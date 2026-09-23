import Dexie, { type Table } from "dexie";

import type {
  Biodata,
  CanvasState,
  MetaRow,
  Person,
  Project,
  Relationship,
} from "@/lib/domain/types";
import { nowIso } from "@/lib/utils/id";

export interface PreferenceRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * Vamsha-Vriksha local database.
 *
 * Everything the app needs lives here. There is no server, no account and no
 * network call on any code path in this module - that is the whole point of
 * the product.
 *
 * MIGRATION CONVENTION (important):
 *   - Never call `db.delete()` / `indexedDB.deleteDatabase()` at startup and
 *     never ship a "reset the database" workaround for a schema change.
 *   - To change the shape, add a new `this.version(n).stores({...})` block with
 *     only the *changed* tables, optionally followed by `.upgrade(tx => ...)`
 *     that rewrites existing rows in place. Dexie applies the chain in order.
 *   - `version 2` below is a worked example of exactly that pattern.
 */
export class VamshaDatabase extends Dexie {
  projects!: Table<Project, string>;
  people!: Table<Person, string>;
  relationships!: Table<Relationship, string>;
  biodata!: Table<Biodata, string>;
  canvasStates!: Table<CanvasState, string>;
  preferences!: Table<PreferenceRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("vamsha-vriksha");

    // ---- v1: the original Phase-1 schema ------------------------------
    this.version(1).stores({
      projects: "&id, updatedAt",
      people: "&id, projectId, updatedAt",
      relationships: "&id, projectId, type, [projectId+type]",
      biodata: "&id, personId, projectId",
      canvasStates: "&id, projectId",
      preferences: "&key",
      meta: "&key",
    });

    // ---- v2: additive indexes for name search and per-person lookups ---
    // Adds compound indexes used by the relationship panel and the person
    // picker, and backfills `updatedAt` for rows written by older builds.
    // No table is dropped and no user data is touched.
    this.version(2)
      .stores({
        projects: "&id, name, updatedAt",
        people: "&id, projectId, name, updatedAt",
        relationships:
          "&id, projectId, type, [projectId+type], [projectId+fromPersonId], [projectId+toPersonId], updatedAt",
        biodata: "&id, personId, projectId",
        canvasStates: "&id, projectId",
      })
      .upgrade(async (tx) => {
        const stamp = nowIso();
        await tx
          .table<Person>("people")
          .toCollection()
          .modify((person) => {
            if (!person.updatedAt) person.updatedAt = stamp;
            if (!person.gender) person.gender = "unknown";
          });
        await tx
          .table<Relationship>("relationships")
          .toCollection()
          .modify((relationship) => {
            if (!relationship.updatedAt) relationship.updatedAt = stamp;
          });
        await tx
          .table<Biodata>("biodata")
          .toCollection()
          .modify((biodata) => {
            if (!Array.isArray(biodata.customFields)) biodata.customFields = [];
            if (!biodata.updatedAt) biodata.updatedAt = stamp;
          });
      });
  }
}

let instance: VamshaDatabase | null = null;

/**
 * Lazy singleton so that tests can install a fake IndexedDB implementation
 * before Dexie touches the global. Called on every access - the cost is a
 * null check.
 */
export function getDb(): VamshaDatabase {
  if (!instance) instance = new VamshaDatabase();
  return instance;
}

/** Open (and migrate) the database once, reporting failures to the caller. */
export async function openDatabase(): Promise<VamshaDatabase> {
  const db = getDb();
  if (!db.isOpen()) await db.open();
  return db;
}

/**
 * Storage health check used by the offline indicator: IndexedDB can be
 * unavailable in private modes / locked-down webviews, and we want a clear
 * message rather than a blank canvas.
 */
export async function probeStorage(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await openDatabase();
    await db.meta.get("installId");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
