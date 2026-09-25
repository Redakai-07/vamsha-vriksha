/**
 * The offline queue, and the one place local writes are staged for sync.
 *
 * Every mutation of a synchronized entity goes through `stageUpsert` or
 * `stageDelete`, INSIDE the repository's own transaction, so an edit and its
 * queue entry are committed together or not at all. There is no window where
 * the user's change exists but sync has forgotten about it.
 *
 * The queue is coalesced by entity (see the unique index in `db.ts`): what is
 * queued is "this entity differs from the cloud", not a replay log.
 *
 * Nothing here touches the network, and nothing here is on the critical path of
 * an edit. If the device has never signed in, rows are still staged, so a later
 * "back up these projects" is incremental rather than a full re-upload - and the
 * app never has to know the difference.
 */
import type { VamshaDatabase, OutboxRow } from "@/lib/db/db";
import { getDb } from "@/lib/db/db";
import type { SyncMeta, SyncableEntity } from "@/lib/domain/types";
import { isProjectExcluded } from "@/lib/sync/exclusions";
import type { SyncCollection } from "@/lib/sync/types";
import { nowIso } from "@/lib/utils/id";

/**
 * A row as this layer sees it: a synchronized entity, addressed by name.
 *
 * The sync layer works with collection names held in variables, so TypeScript
 * cannot pick one member of the entity union for it. This shape is what every
 * helper below takes and returns, which keeps exactly one cast in the codebase
 * instead of one per call site.
 */
export type LocalRow = SyncableEntity & Record<string, unknown> & { id: string };

/**
 * Anything this layer can stage: a synchronized entity with an identity.
 * Declared generically so concrete domain types (which are interfaces, and so
 * have no implicit index signature) can be passed straight in.
 */
export type Stageable = SyncableEntity & { id: string; projectId?: string | null };

export function defaultSyncMeta(): SyncMeta {
  return { rev: 0, syncedRev: 0, cloudRev: 0, origin: "", state: "local" };
}

export function readSyncMeta(entity: SyncableEntity | null | undefined): SyncMeta {
  return entity?.sync ?? defaultSyncMeta();
}

/** A row is dirty when its content has moved past what the cloud acknowledged. */
export function isDirty(entity: SyncableEntity | null | undefined): boolean {
  if (!entity) return false;
  const meta = readSyncMeta(entity);
  return meta.rev > meta.syncedRev;
}

export function isTombstoned(entity: SyncableEntity | null | undefined): boolean {
  return Boolean(entity?.deletedAt);
}

// ---------------------------------------------------------------------------
// Row access, by collection name
// ---------------------------------------------------------------------------

export async function getRow(
  db: VamshaDatabase,
  collection: SyncCollection,
  id: string,
): Promise<LocalRow | undefined> {
  return (await db.table(collection).get(id)) as unknown as LocalRow | undefined;
}

/**
 * Writes a whole row. Takes `unknown` on purpose: rows arriving from a provider
 * are only known to be JSON, and validating that is the engine's job.
 */
export async function putRow(
  db: VamshaDatabase,
  collection: SyncCollection,
  row: unknown,
): Promise<void> {
  await db.table(collection).put(row);
}

export async function deleteRow(
  db: VamshaDatabase,
  collection: SyncCollection,
  id: string,
): Promise<void> {
  await db.table(collection).delete(id);
}

export async function rowsByProject(
  db: VamshaDatabase,
  collection: SyncCollection,
  projectId: string,
): Promise<LocalRow[]> {
  if (collection === "projects") {
    const row = await getRow(db, collection, projectId);
    return row ? [row] : [];
  }
  return (await db.table(collection).where("projectId").equals(projectId).toArray()) as unknown as LocalRow[];
}

export function projectIdOf(
  collection: SyncCollection,
  entity: { id: string; projectId?: string | null },
): string | null {
  if (collection === "projects") return entity.id;
  return entity.projectId ?? null;
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

let syncEnabled = false;

/**
 * Whether an account is signed in. Read from a cached flag rather than from
 * IndexedDB so that staging stays cheap on hot paths (dragging a node writes a
 * canvas position on release, and that must not cost an extra read).
 */
export function setSyncEnabled(value: boolean): void {
  syncEnabled = value;
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

async function enqueue(
  db: VamshaDatabase,
  collection: SyncCollection,
  entityId: string,
  projectId: string | null,
  op: OutboxRow["op"],
  rev: number,
  cloudRev: number | null,
): Promise<void> {
  const existing = await db.outbox
    .where("[collection+entityId]")
    .equals([collection, entityId])
    .first();
  const row: OutboxRow = {
    collection,
    entityId,
    projectId,
    op,
    rev,
    cloudRev,
    queuedAt: nowIso(),
    attempts: existing?.attempts ?? 0,
    lastError: existing?.lastError,
  };
  if (existing) {
    row.seq = existing.seq;
    await db.outbox.put(row);
    return;
  }
  await db.outbox.add(row);
}

/** Stages a create or an edit. Mutates `entity` in place. */
export async function stageUpsert<T extends Stageable>(
  db: VamshaDatabase,
  collection: SyncCollection,
  entity: T,
): Promise<T> {
  const previous = readSyncMeta(entity);
  const target = entity as SyncableEntity;
  const projectId = projectIdOf(collection, entity);
  const excluded = isProjectExcluded(projectId);
  target.deletedAt = null;
  target.sync = {
    ...previous,
    rev: previous.rev + 1,
    state:
      !excluded && syncEnabled ? "pending" : previous.state === "conflict" ? "conflict" : "local",
  };
  await putRow(db, collection, entity);
  // A project the user chose to keep on this device is never queued - not even
  // by a later edit.
  if (excluded) return entity;
  await enqueue(db, collection, entity.id, projectId, "upsert", previous.rev + 1, previous.cloudRev || null);
  return entity;
}

/**
 * Stages a delete and removes the row locally.
 *
 * The delete is published as a TOMBSTONE ("this id is gone, as of this
 * revision"), not as an absent row, which is what lets another device that is
 * editing the same record answer back with content instead of losing it. The
 * base revision has to be captured here, because after this call the row it
 * belongs to no longer exists.
 */
export async function stageDelete<T extends Stageable>(
  db: VamshaDatabase,
  collection: SyncCollection,
  entity: T,
): Promise<void> {
  const previous = readSyncMeta(entity);
  const projectId = projectIdOf(collection, entity);
  if (!isProjectExcluded(projectId)) {
    await enqueue(db, collection, entity.id, projectId, "delete", previous.rev + 1, previous.cloudRev || null);
  }
  await db.syncBase.delete(`${collection}:${entity.id}`);
  await deleteRow(db, collection, entity.id);
}

/**
 * Queues one entity's CURRENT revision without bumping it. Used by "back up
 * these projects", which must also sweep rows written before sync existed (and
 * therefore have no queue entry yet).
 */
export async function queueEntity<T extends Stageable>(
  db: VamshaDatabase,
  collection: SyncCollection,
  entity: T,
): Promise<void> {
  const meta = readSyncMeta(entity);
  await enqueue(
    db,
    collection,
    entity.id,
    projectIdOf(collection, entity),
    entity.deletedAt ? "delete" : "upsert",
    meta.rev,
    meta.cloudRev || null,
  );
}

export async function dropFromQueue(
  db: VamshaDatabase,
  collection: SyncCollection,
  entityId: string,
): Promise<void> {
  await db.outbox.where("[collection+entityId]").equals([collection, entityId]).delete();
}

export async function pendingCount(): Promise<number> {
  return getDb().outbox.count();
}

export async function listQueue(): Promise<OutboxRow[]> {
  return getDb().outbox.orderBy("seq").toArray();
}

/** Queue size per project - used to explain what a sync would send. */
export async function pendingByProject(): Promise<Record<string, number>> {
  const rows = await listQueue();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.projectId ?? "-";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
