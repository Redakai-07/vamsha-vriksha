/**
 * A "cloud" that lives in this browser.
 *
 * It exists so the synchronization engine is real, exercisable and testable
 * before an endpoint is chosen: it implements the exact same contract as the
 * HTTP adapter, including compare-and-set revision checks and a global change
 * counter, and it uses a SEPARATE Dexie database so mirror rows can never end up
 * inside the user's real data (or in an export).
 *
 * It is deliberately not presented as a backup: the sign-in surface labels it
 * "this browser" and explains that a second device will not see it.
 */
import Dexie, { type Table } from "dexie";

import { nowIso } from "@/lib/utils/id";
import type {
  ListChangesInput,
  ListChangesResult,
  PutRecordInput,
  PutResult,
  RemoteRecord,
  SyncBackend,
  SyncCollection,
} from "@/lib/sync/types";

interface MirrorRow {
  key: string;
  accountId: string;
  collection: SyncCollection;
  id: string;
  projectId: string | null;
  /** JSON payload - stored as text so the mirror is schema-agnostic. */
  payload: string;
  cloudRev: number;
  updatedAt: string;
  origin: string;
  deletedAt: string | null;
  seq: number;
}

interface CounterRow {
  key: string;
  value: number;
}

class MirrorDatabase extends Dexie {
  records!: Table<MirrorRow, string>;
  counters!: Table<CounterRow, string>;

  constructor() {
    super("vamsha-vriksha-mirror");
    this.version(1).stores({
      records: "&key, accountId, collection, seq, [accountId+seq], [accountId+projectId]",
      counters: "&key",
    });
  }
}

let instance: MirrorDatabase | null = null;

function getMirror(): MirrorDatabase {
  if (!instance) instance = new MirrorDatabase();
  return instance;
}

/** Test hook: drops the in-process handle so the next call rebuilds it. */
export function resetLocalMirrorHandle(): void {
  instance = null;
}

/** Empties the mirror. Used by tests, and by "forget this device's account". */
export async function clearLocalMirror(): Promise<void> {
  const db = getMirror();
  await db.transaction("rw", db.records, db.counters, async () => {
    await db.records.clear();
    await db.counters.clear();
  });
}

function rowKey(accountId: string, collection: SyncCollection, id: string): string {
  return `${accountId}:${collection}:${id}`;
}

function toRemote(row: MirrorRow): RemoteRecord {
  return {
    collection: row.collection,
    id: row.id,
    projectId: row.projectId,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    cloudRev: row.cloudRev,
    updatedAt: row.updatedAt,
    origin: row.origin,
    deletedAt: row.deletedAt,
  };
}

export function createLocalMirrorBackend(): SyncBackend {
  const countKey = "change";

  async function nextSeq(db: MirrorDatabase): Promise<number> {
    const row = await db.counters.get(countKey);
    const value = (row?.value ?? 0) + 1;
    await db.counters.put({ key: countKey, value });
    return value;
  }

  return {
    kind: "local",
    label: "This browser",

    async listChanges(input: ListChangesInput): Promise<ListChangesResult> {
      const db = getMirror();
      const limit = input.limit ?? 500;
      // Scoped by account in the index itself, so one account's backlog can
      // never crowd another's out of a page.
      const rows = await db.records
        .where("[accountId+seq]")
        .aboveOrEqual([input.accountId, input.since + 1])
        .limit(limit)
        .toArray();
      const cursorRow = await db.counters.get(countKey);
      const cursor = rows.length ? rows[rows.length - 1].seq : (cursorRow?.value ?? input.since);
      return {
        records: rows.map(toRemote),
        cursor: Math.max(cursor, input.since),
        hasMore: rows.length === limit,
      };
    },

    async getRecord(
      accountId: string,
      collection: SyncCollection,
      id: string,
    ): Promise<RemoteRecord | null> {
      const row = await getMirror().records.get(rowKey(accountId, collection, id));
      return row ? toRemote(row) : null;
    },

    async putRecord(input: PutRecordInput): Promise<PutResult> {
      const db = getMirror();
      return db.transaction("rw", db.records, db.counters, async () => {
        const key = rowKey(input.accountId, input.collection, input.id);
        const existing = await db.records.get(key);

        // Compare-and-set. A client that based its write on an older revision
        // is told what is there now instead of silently winning.
        if (input.baseRev === null) {
          if (existing) return { ok: false, current: toRemote(existing) };
        } else if (!existing) {
          return { ok: false, current: null };
        } else if (existing.cloudRev !== input.baseRev) {
          return { ok: false, current: toRemote(existing) };
        }

        const cloudRev = (existing?.cloudRev ?? 0) + 1;
        const row: MirrorRow = {
          key,
          accountId: input.accountId,
          collection: input.collection,
          id: input.id,
          projectId: input.projectId,
          payload: JSON.stringify(input.payload),
          cloudRev,
          updatedAt: input.updatedAt || nowIso(),
          origin: input.origin,
          deletedAt: input.deletedAt,
          seq: await nextSeq(db),
        };
        await db.records.put(row);
        return { ok: true, record: toRemote(row) };
      });
    },

    async listProject(accountId: string, projectId: string): Promise<RemoteRecord[]> {
      const rows = await getMirror()
        .records.where("[accountId+projectId]")
        .equals([accountId, projectId])
        .toArray();
      return rows.map(toRemote);
    },

    async listAll(accountId: string): Promise<RemoteRecord[]> {
      const rows = await getMirror().records.where("accountId").equals(accountId).toArray();
      return rows.map(toRemote);
    },
  };
}
