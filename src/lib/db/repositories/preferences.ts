import { getDb } from "@/lib/db/db";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/domain/types";
import { createId, nowIso } from "@/lib/utils/id";

/** Preferences are stored as one row per key so partial writes stay cheap. */
export const preferencesRepo = {
  async all(): Promise<UserPreferences> {
    const rows = await getDb().preferences.toArray();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return { ...DEFAULT_PREFERENCES, ...stored } as UserPreferences;
  },

  async save(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    const db = getDb();
    const stamp = nowIso();
    const rows = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value, updatedAt: stamp }));
    if (rows.length) await db.preferences.bulkPut(rows);
    return this.all();
  },

  async reset(): Promise<UserPreferences> {
    await getDb().preferences.clear();
    return { ...DEFAULT_PREFERENCES };
  },
};

export const metaRepo = {
  async get(key: string): Promise<string | null> {
    const row = await getDb().meta.get(key);
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await getDb().meta.put({ key, value, updatedAt: nowIso() });
  },

  async getLastProjectId(): Promise<string | null> {
    const value = await this.get("lastProjectId");
    return value || null;
  },

  async setLastProjectId(projectId: string): Promise<void> {
    await this.set("lastProjectId", projectId);
  },

  /** Stable per-install id used for future sync/telemetry opt-in. No PII. */
  async ensureInstallId(): Promise<string> {
    const existing = await this.get("installId");
    if (existing) return existing;
    const created = createId("ins");
    await this.set("installId", created);
    return created;
  },
};
