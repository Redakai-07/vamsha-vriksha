/**
 * Projects the user has chosen NOT to send to the cloud.
 *
 * "Keep them local" has to mean something: without this list, the very next edit
 * to a project the user deliberately kept back would quietly queue it for
 * upload. The list is stored in the local meta table, is per device, and is
 * enforced in one place (`stageUpsert`/`stageDelete`), so no write path can
 * accidentally bypass it.
 */
import { getDb } from "@/lib/db/db";
import { nowIso } from "@/lib/utils/id";

const KEY = "syncExcludedProjects";

const excluded = new Set<string>();

export function isProjectExcluded(projectId: string | null | undefined): boolean {
  return Boolean(projectId && excluded.has(projectId));
}

export function excludedProjects(): string[] {
  return [...excluded];
}

/** Replaces the in-memory set. Called on hydrate and after every change. */
export function setExcludedProjects(projectIds: Iterable<string>): void {
  excluded.clear();
  for (const id of projectIds) excluded.add(id);
}

export async function loadExcludedProjects(): Promise<string[]> {
  const row = await getDb().meta.get(KEY);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function saveExcludedProjects(projectIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(projectIds)];
  setExcludedProjects(ids);
  await getDb().meta.put({ key: KEY, value: JSON.stringify(ids), updatedAt: nowIso() });
}
