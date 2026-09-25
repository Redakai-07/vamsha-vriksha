/**
 * The synchronization engine.
 *
 * One rule governs everything here: the local database is the truth, the cloud
 * is a replica, and no failure of the network may ever block an edit or lose
 * one. Concretely:
 *
 *  - pushes are driven by the local outbox, one entity at a time, so an
 *    interrupted sync resumes where it stopped instead of starting over;
 *  - every write to the cloud is a compare-and-set on the provider revision, so
 *    a device that is behind is TOLD it is behind rather than silently winning;
 *  - the answer to "you are behind" is a three-way merge, and a value that loses
 *    that merge is preserved for the user rather than dropped;
 *  - pulls are incremental from a single watermark, so a sync transfers what
 *    changed, never the whole database.
 *
 * The engine never runs on the critical path of an edit: repositories keep
 * writing to IndexedDB first and queue as a side effect.
 */
import { getDb, type ConflictRow, type OutboxRow } from "@/lib/db/db";
import { isTransportError } from "@/lib/sync/errors";
import {
  getCursor,
  getDeviceId,
  getLastSyncedAt,
  readAccount,
  setCursor,
  setLastSyncedAt,
  type SyncAccount,
} from "@/lib/sync/identity";
import { mergeRecords, type FieldConflict, type MergeOutcome } from "@/lib/sync/merge";
import { applyPayload, payloadsEqual, toPayload } from "@/lib/sync/payload";
import {
  deleteRow,
  dropFromQueue,
  getRow,
  isDirty,
  listQueue,
  projectIdOf,
  putRow,
  queueEntity,
  readSyncMeta,
  rowsByProject,
  setSyncEnabled,
  type LocalRow,
} from "@/lib/sync/queue";
import { SYNC_COLLECTIONS } from "@/lib/sync/types";
import type {
  RemoteRecord,
  SyncBackend,
  SyncCollection,
  SyncPayload,
} from "@/lib/sync/types";
import { createId, nowIso } from "@/lib/utils/id";

/** Bounded reconciliation: each round resolves one round of concurrent edits. */
const MAX_PUSH_ROUNDS = 4;
const PULL_PAGE = 500;
const MAX_PULL_PAGES = 40;

export interface SyncRunSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
  /** True when the network was not there; the queue is untouched and retried later. */
  offline: boolean;
  skipped?: "no-account";
  message?: string;
  lastSyncedAt?: string | null;
}

export interface SyncEngine {
  readonly backend: SyncBackend;
  sync(reason?: string): Promise<SyncRunSummary>;
  countPending(): Promise<number>;
  countConflicts(): Promise<number>;
  listConflicts(): Promise<ConflictRow[]>;
  resolveConflict(conflictId: string, choice: "keep-preserved" | "dismiss"): Promise<void>;
  /** Queues a whole project's current state and pushes it - "back up this lineage". */
  backUpProject(projectId: string): Promise<SyncRunSummary>;
  /** Pulls everything the account holds for a project this device does not have. */
  restoreProject(projectId: string): Promise<{ restored: number }>;
  /** Withdraws queued work for projects the user decided to keep local. */
  dropQueuedProjects(projectIds: string[]): Promise<void>;
  stats(): Promise<{
    pending: number;
    conflicts: number;
    lastSyncedAt: string | null;
    account: SyncAccount | null;
  }>;
}

// ---------------------------------------------------------------------------
// Merge bases
// ---------------------------------------------------------------------------

function baseKey(collection: SyncCollection, entityId: string): string {
  return `${collection}:${entityId}`;
}

async function readBase(
  collection: SyncCollection,
  entityId: string,
): Promise<{ payload: SyncPayload; cloudRev: number } | null> {
  const row = await getDb().syncBase.get(baseKey(collection, entityId));
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload) as SyncPayload, cloudRev: row.cloudRev };
  } catch {
    return null;
  }
}

async function saveBase(
  collection: SyncCollection,
  entityId: string,
  payload: SyncPayload,
  cloudRev: number,
): Promise<void> {
  await getDb().syncBase.put({
    key: baseKey(collection, entityId),
    collection,
    entityId,
    payload: JSON.stringify(payload),
    cloudRev,
    updatedAt: nowIso(),
  });
}

/** Forget the common ancestor of a record that no longer exists here. */
async function dropBase(collection: SyncCollection, entityId: string): Promise<void> {
  await getDb().syncBase.delete(baseKey(collection, entityId));
}

// ---------------------------------------------------------------------------
// Applying remote state
// ---------------------------------------------------------------------------

function fromRemote(collection: SyncCollection, remote: RemoteRecord): LocalRow {
  return {
    ...(remote.payload as SyncPayload),
    deletedAt: remote.deletedAt,
    sync: {
      rev: 1,
      syncedRev: 1,
      cloudRev: remote.cloudRev,
      origin: remote.origin,
      state: "synced",
    },
  } as LocalRow;
}

async function recordConflicts(
  collection: SyncCollection,
  entityId: string,
  projectId: string | null,
  conflicts: FieldConflict[],
): Promise<void> {
  if (!conflicts.length) return;
  const stamp = nowIso();
  await getDb().conflicts.bulkAdd(
    conflicts.map((conflict) => ({
      id: createId("cf"),
      collection,
      entityId,
      projectId,
      field: conflict.field,
      appliedValue: conflict.appliedValue,
      appliedFrom: conflict.appliedFrom,
      preservedValue: conflict.preservedValue,
      detectedAt: stamp,
      resolvedAt: null,
    })),
  );
}

/**
 * Brings a remote revision into the local row, merging when this device has
 * unpublished work. Shared by the pull pass and by the push pass (which lands
 * here when the provider says the client is behind).
 */
async function reconcile(
  remote: RemoteRecord,
  origin: string,
): Promise<{ applied: boolean; conflicts: number; dirty: boolean }> {
  const db = getDb();
  const { collection } = remote;
  const local = await getRow(db, collection, remote.id);

  if (!local) {
    if (remote.deletedAt) {
      // A tombstone for a record this device never had is nothing to store.
      await dropBase(collection, remote.id);
      return { applied: false, conflicts: 0, dirty: false };
    }
    await putRow(db, collection, fromRemote(collection, remote));
    await saveBase(collection, remote.id, remote.payload as SyncPayload, remote.cloudRev);
    return { applied: true, conflicts: 0, dirty: false };
  }

  const meta = readSyncMeta(local);
  if (meta.cloudRev === remote.cloudRev) {
    // Already based on this revision. Any local difference is unpublished work
    // and belongs to the push pass.
    return { applied: false, conflicts: 0, dirty: isDirty(local) };
  }

  if (!isDirty(local)) {
    // Nothing of ours is unpublished, so the cloud copy can be adopted whole -
    // no merge, and therefore no spurious conflict.
    if (remote.deletedAt) {
      // Deletes stay deletes locally: the row is removed rather than kept as a
      // tombstone, so nothing else in the app has to filter tombstoned rows.
      await deleteRow(db, collection, remote.id);
      await dropBase(collection, remote.id);
      await dropFromQueue(db, collection, remote.id);
      return { applied: true, conflicts: 0, dirty: false };
    }
    const next = applyPayload(collection, local, remote.payload as SyncPayload);
    await putRow(db, collection, {
      ...next,
      deletedAt: null,
      sync: {
        rev: meta.rev,
        syncedRev: meta.rev,
        cloudRev: remote.cloudRev,
        origin: remote.origin,
        state: "synced",
      },
    });
    await saveBase(collection, remote.id, remote.payload as SyncPayload, remote.cloudRev);
    await dropFromQueue(db, collection, remote.id);
    return { applied: true, conflicts: 0, dirty: false };
  }

  if (remote.deletedAt) {
    // Both sides moved, and one of them was a delete. If our content never
    // actually changed since the last agreement, the delete applies; otherwise
    // the edit wins and is published back over the tombstone.
    const previous = await readBase(collection, remote.id);
    const ours = toPayload(collection, local);
    if (previous && payloadsEqual(ours, previous.payload)) {
      await deleteRow(db, collection, remote.id);
      await dropBase(collection, remote.id);
      await dropFromQueue(db, collection, remote.id);
      return { applied: true, conflicts: 0, dirty: false };
    }
    await putRow(db, collection, {
      ...local,
      deletedAt: null,
      sync: { ...meta, cloudRev: remote.cloudRev, origin, state: "pending" },
    });
    await saveBase(collection, remote.id, remote.payload as SyncPayload, remote.cloudRev);
    await recordConflicts(collection, remote.id, projectIdOf(collection, local), [
      {
        field: "*delete",
        appliedValue: null,
        appliedFrom: "local",
        preservedValue: remote.deletedAt,
      },
    ]);
    return { applied: true, conflicts: 1, dirty: true };
  }

  const base = await readBase(collection, remote.id);
  const outcome: MergeOutcome = mergeRecords({
    collection,
    base: base?.payload ?? null,
    ours: toPayload(collection, local),
    theirs: remote.payload as SyncPayload,
    ourStamp: {
      updatedAt: String(local.updatedAt ?? nowIso()),
      origin: meta.origin || origin,
    },
    theirStamp: { updatedAt: remote.updatedAt, origin: remote.origin },
    ourDeletedAt: local.deletedAt ?? null,
    theirDeletedAt: remote.deletedAt,
  });

  await recordConflicts(collection, remote.id, projectIdOf(collection, local), outcome.conflicts);

  if (outcome.deletedAt) {
    await deleteRow(db, collection, remote.id);
    await dropBase(collection, remote.id);
    await dropFromQueue(db, collection, remote.id);
    return { applied: true, conflicts: outcome.conflicts.length, dirty: false };
  }

  const nextRev = outcome.changed ? meta.rev + 1 : meta.rev;
  await putRow(db, collection, {
    ...applyPayload(collection, local, outcome.payload),
    deletedAt: null,
    sync: {
      ...meta,
      rev: nextRev,
      // `syncedRev` is deliberately NOT advanced: the merged content is ours to
      // publish next, so the row stays dirty until the provider acknowledges it.
      cloudRev: remote.cloudRev,
      origin,
      state: outcome.conflicts.length ? "conflict" : meta.state === "conflict" ? "conflict" : "pending",
    },
  });
  // The base always describes the revision we are now based on, so the next
  // merge compares against the right common ancestor.
  await saveBase(collection, remote.id, remote.payload as SyncPayload, remote.cloudRev);

  return {
    applied: true,
    conflicts: outcome.conflicts.length,
    dirty: true,
  };
}

/** One page of the pull loop. */
async function pullPass(
  backend: SyncBackend,
  account: SyncAccount,
  origin: string,
): Promise<{ pulled: number; conflicts: number }> {
  const db = getDb();
  let pulled = 0;
  let conflicts = 0;
  let since = await getCursor(account.accountId);

  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const result = await backend.listChanges({
      accountId: account.accountId,
      since,
      limit: PULL_PAGE,
    });

    for (const remote of result.records) {
      const applied = await reconcile(remote, origin);
      if (applied.applied) pulled += 1;
      conflicts += applied.conflicts;
      if (applied.dirty) {
        // A merge changed a row, so the queue must reflect it.
        const row = await getRow(db, remote.collection, remote.id);
        if (row) await queueEntity(db, remote.collection, row);
      }
    }

    const next = Math.max(result.cursor, since);
    if (next > since) {
      since = next;
      await setCursor(account.accountId, since);
    }
    if (!result.hasMore || next === since) break;
  }

  return { pulled, conflicts };
}

// ---------------------------------------------------------------------------
// Pushing local state
// ---------------------------------------------------------------------------

/**
 * Publishes a delete as a tombstone.
 *
 * The row is already gone locally, so the base revision travels in the queue
 * entry. If the cloud copy moved in the meantime, the edit wins: the record is
 * brought back locally and the reason is recorded rather than silently obeyed.
 */
async function pushDelete(
  backend: SyncBackend,
  account: SyncAccount,
  row: OutboxRow,
  origin: string,
): Promise<{ pushed: boolean; conflicts: number }> {
  const db = getDb();
  const stamp = nowIso();
  const result = await backend.putRecord({
    accountId: account.accountId,
    collection: row.collection,
    id: row.entityId,
    projectId: row.projectId,
    payload: {},
    baseRev: row.cloudRev,
    updatedAt: stamp,
    origin,
    deletedAt: stamp,
  });

  if (result.ok || !result.current) {
    // Either the tombstone landed, or there was nothing published to delete.
    await dropBase(row.collection, row.entityId);
    await dropFromQueue(db, row.collection, row.entityId);
    return { pushed: result.ok, conflicts: 0 };
  }

  await reconcile(result.current, origin);
  await recordConflicts(row.collection, row.entityId, row.projectId, [
    { field: "*restore", appliedValue: null, appliedFrom: "cloud", preservedValue: null },
  ]);
  await dropFromQueue(db, row.collection, row.entityId);
  return { pushed: false, conflicts: 1 };
}

async function pushEntity(
  backend: SyncBackend,
  account: SyncAccount,
  row: OutboxRow,
  origin: string,
): Promise<{ pushed: boolean; conflicts: number }> {
  const db = getDb();
  const { collection, entityId } = row;

  if (row.op === "delete") return pushDelete(backend, account, row, origin);

  for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
    const local = await getRow(db, collection, entityId);
    if (!local) {
      await dropFromQueue(db, collection, entityId);
      return { pushed: false, conflicts: 0 };
    }

    const meta = readSyncMeta(local);
    if (meta.rev <= meta.syncedRev) {
      // Nothing unpublished: the queue entry was stale.
      await dropFromQueue(db, collection, entityId);
      return { pushed: false, conflicts: 0 };
    }

    const payload = toPayload(collection, local);
    const sentRev = meta.rev;
    const result = await backend.putRecord({
      accountId: account.accountId,
      collection,
      id: entityId,
      projectId: projectIdOf(collection, local),
      payload,
      // A record we have never pushed claims no base, so the provider rejects
      // the write instead of replacing something it did not know about.
      baseRev: meta.cloudRev > 0 ? meta.cloudRev : null,
      updatedAt: String(local.updatedAt ?? nowIso()),
      origin,
      deletedAt: null,
    });

    if (result.ok) {
      const current = await getRow(db, collection, entityId);
      if (current) {
        const currentMeta = readSyncMeta(current);
        const unchangedSinceSend = currentMeta.rev === sentRev;
        await putRow(db, collection, {
          ...current,
          sync: {
            ...currentMeta,
            syncedRev: sentRev,
            cloudRev: result.record.cloudRev,
            origin,
            state: unchangedSinceSend ? "synced" : "pending",
          },
        });
        if (unchangedSinceSend) await dropFromQueue(db, collection, entityId);
      } else {
        await dropFromQueue(db, collection, entityId);
      }
      await saveBase(collection, entityId, payload, result.record.cloudRev);
      return { pushed: true, conflicts: 0 };
    }

    if (!result.current) {
      // The provider does not hold the revision we claimed (it was removed out
      // from under us). Re-publish from our own content.
      const fresh = await getRow(db, collection, entityId);
      if (!fresh) {
        await dropFromQueue(db, collection, entityId);
        return { pushed: false, conflicts: 0 };
      }
      await putRow(db, collection, {
        ...fresh,
        sync: { ...readSyncMeta(fresh), cloudRev: 0 },
      });
      continue;
    }

    // Concurrent edit: merge the cloud revision in (preserving the losing
    // values) and try again with the merged content.
    const merged = await reconcile(result.current, origin);
    if (!merged.applied) {
      // Nothing changed locally, so the provider's answer is now our base.
      const current = await getRow(db, collection, entityId);
      if (current) {
        await putRow(db, collection, {
          ...current,
          sync: { ...readSyncMeta(current), cloudRev: result.current.cloudRev, state: "pending" },
        });
      }
    }
  }

  await markQueueFailure(collection, entityId, "Could not reconcile with the cloud copy");
  return { pushed: false, conflicts: 0 };
}

async function markQueueFailure(
  collection: SyncCollection,
  entityId: string,
  message: string,
): Promise<void> {
  const db = getDb();
  const row = await db.outbox.where("[collection+entityId]").equals([collection, entityId]).first();
  if (!row?.seq) return;
  await db.outbox.update(row.seq, { attempts: row.attempts + 1, lastError: message });
}

async function pushPass(
  backend: SyncBackend,
  account: SyncAccount,
  origin: string,
): Promise<{ pushed: number; conflicts: number }> {
  const queue = await listQueue();
  let pushed = 0;
  let conflicts = 0;
  for (const row of queue) {
    const result = await pushEntity(backend, account, row, origin);
    if (result.pushed) pushed += 1;
    conflicts += result.conflicts;
  }
  return { pushed, conflicts };
}

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

export function createSyncEngine(backend: SyncBackend): SyncEngine {
  let running: Promise<SyncRunSummary> | null = null;

  async function run(): Promise<SyncRunSummary> {
    const summary: SyncRunSummary = { pushed: 0, pulled: 0, conflicts: 0, offline: false };
    const account = await readAccount();
    if (!account) {
      setSyncEnabled(false);
      return { ...summary, skipped: "no-account" };
    }

    setSyncEnabled(true);
    const origin = await getDeviceId();

    try {
      const push = await pushPass(backend, account, origin);
      summary.pushed = push.pushed;
      summary.conflicts = push.conflicts;

      const pull = await pullPass(backend, account, origin);
      summary.pulled = pull.pulled;

      // Merges performed during the pull can leave rows dirty; draining them in
      // the same run is what makes one sync call converge.
      const second = await pushPass(backend, account, origin);
      summary.pushed += second.pushed;
      summary.conflicts += second.conflicts;

      summary.conflicts += await engine.countConflicts();
      const stamp = nowIso();
      await setLastSyncedAt(account.accountId, stamp);
      summary.lastSyncedAt = stamp;
    } catch (error) {
      if (isTransportError(error)) {
        summary.offline = true;
        // Deliberately no payload in the message, and the queue is left exactly
        // as it was so nothing is lost.
        summary.message = "Offline - changes are saved on this device";
      } else {
        summary.message = error instanceof Error ? error.message : String(error);
      }
    }

    return summary;
  }

  const engine: SyncEngine = {
    backend,

    sync() {
      // Never two runs at once: a second caller joins the first.
      if (running) return running;
      running = run().finally(() => {
        running = null;
      });
      return running;
    },

    async countPending() {
      return getDb().outbox.count();
    },

    async countConflicts() {
      return getDb()
        .conflicts.filter((row) => !row.resolvedAt)
        .count();
    },

    async listConflicts() {
      const rows = await getDb().conflicts.filter((row) => !row.resolvedAt).toArray();
      return rows.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    },

    async resolveConflict(conflictId, choice) {
      const db = getDb();
      const conflict = await db.conflicts.get(conflictId);
      if (!conflict) return;

      if (choice === "keep-preserved") {
        const entity = await getRow(db, conflict.collection, conflict.entityId);
        if (entity) {
          const field = conflict.field;
          if (field === "*delete") {
            await putRow(db, conflict.collection, {
              ...entity,
              deletedAt: (conflict.preservedValue as string) ?? nowIso(),
              sync: { ...readSyncMeta(entity), rev: readSyncMeta(entity).rev + 1, state: "pending" },
            });
          } else {
            const restored = { ...entity };
            applyFieldValue(restored, field, conflict.preservedValue);
            await putRow(db, conflict.collection, {
              ...restored,
              sync: { ...readSyncMeta(entity), rev: readSyncMeta(entity).rev + 1, state: "pending" },
            });
          }
          const row = await getRow(db, conflict.collection, conflict.entityId);
          if (row) await queueEntity(db, conflict.collection, row);
        }
      }

      await db.conflicts.update(conflictId, { resolvedAt: nowIso() });
    },

    async backUpProject(projectId) {
      const db = getDb();
      // Project first, then its contents, so a reader of the cloud store sees
      // lineage records before the rows that reference them.
      const project = await getRow(db, "projects", projectId);
      if (project) await queueEntity(db, "projects", project);
      const [people, relationships, biodata, canvas] = await Promise.all([
        rowsByProject(db, "people", projectId),
        rowsByProject(db, "relationships", projectId),
        rowsByProject(db, "biodata", projectId),
        getRow(db, "canvasStates", projectId),
      ]);
      for (const person of people) await queueEntity(db, "people", person);
      for (const relationship of relationships) await queueEntity(db, "relationships", relationship);
      for (const row of biodata) await queueEntity(db, "biodata", row);
      if (canvas) await queueEntity(db, "canvasStates", canvas);
      return engine.sync();
    },

    async dropQueuedProjects(projectIds) {
      if (!projectIds.length) return;
      const db = getDb();
      await db.outbox.where("projectId").anyOf(projectIds).delete();
    },

    async restoreProject(projectId) {
      const account = await readAccount();
      if (!account) return { restored: 0 };
      const records = await backend.listProject(account.accountId, projectId);
      const origin = await getDeviceId();
      let restored = 0;
      // Parents before children, so nothing references a row that is not there.
      const order: SyncCollection[] = [
        "projects",
        "canvasStates",
        "people",
        "relationships",
        "biodata",
      ];
      for (const collection of order) {
        for (const remote of records.filter((record) => record.collection === collection)) {
          const applied = await reconcile(remote, origin);
          if (applied.applied) restored += 1;
        }
      }
      return { restored };
    },

    async stats() {
      const account = await readAccount();
      const [pending, conflicts] = await Promise.all([
        engine.countPending(),
        engine.countConflicts(),
      ]);
      return {
        pending,
        conflicts,
        lastSyncedAt: account ? await getLastSyncedAt(account.accountId) : null,
        account,
      };
    },
  };

  return engine;
}

/** Writes a preserved value back into a field, supporting `field.key` paths. */
export function applyFieldValue(
  entity: Record<string, unknown>,
  field: string,
  value: unknown,
): void {
  const dot = field.indexOf(".");
  if (dot < 0) {
    entity[field] = value;
    return;
  }
  const head = field.slice(0, dot);
  const key = field.slice(dot + 1);
  const container = entity[head];
  if (Array.isArray(container)) {
    const list = [...(container as Record<string, unknown>[])];
    const index = list.findIndex((entry) => String(entry.id ?? entry.label ?? "") === key);
    if (index >= 0) list[index] = value as Record<string, unknown>;
    else list.push(value as Record<string, unknown>);
    entity[head] = list;
    return;
  }
  entity[head] = { ...((container ?? {}) as Record<string, unknown>), [key]: value };
}

/**
 * Sweeps every collection for rows that exist locally but are not queued.
 *
 * This is what makes signing in safe on a device that has been used for months:
 * rows written before sync existed have no queue entry, and "back up these
 * projects" must not silently skip them.
 */
export async function queueEverythingMissing(): Promise<number> {
  const db = getDb();
  let queued = 0;
  for (const collection of SYNC_COLLECTIONS) {
    const rows = (await db.table(collection).toArray()) as LocalRow[];
    for (const row of rows) {
      const meta = readSyncMeta(row);
      if (meta.cloudRev > 0 && meta.rev <= meta.syncedRev) continue;
      const existing = await db.outbox
        .where("[collection+entityId]")
        .equals([collection, row.id])
        .first();
      if (existing) continue;
      await queueEntity(db, collection, row);
      queued += 1;
    }
  }
  return queued;
}
