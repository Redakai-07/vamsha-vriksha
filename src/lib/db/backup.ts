import { getDb } from "@/lib/db/db";
import { projectsRepo } from "@/lib/db/repositories/projects";
import type {
  Biodata,
  CanvasState,
  Person,
  Project,
  Relationship,
} from "@/lib/domain/types";
import { createId, nowIso, slugify } from "@/lib/utils/id";

/**
 * Because there is no cloud, the user's local store IS the source of truth.
 * Export / import is therefore a first-class product feature, not a debug tool.
 */
export const BACKUP_FORMAT = "vamsha-vriksha/backup" as const;
export const BACKUP_VERSION = 1;

export interface ProjectBundle {
  project: Project;
  people: Person[];
  relationships: Relationship[];
  biodata: Biodata[];
  canvas: CanvasState | null;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  bundles: ProjectBundle[];
}

export async function collectProjectBundle(projectId: string): Promise<ProjectBundle | null> {
  const db = getDb();
  const project = await db.projects.get(projectId);
  if (!project) return null;
  const [people, relationships, biodata, canvas] = await Promise.all([
    db.people.where("projectId").equals(projectId).toArray(),
    db.relationships.where("projectId").equals(projectId).toArray(),
    db.biodata.where("projectId").equals(projectId).toArray(),
    db.canvasStates.get(projectId),
  ]);
  return { project, people, relationships, biodata, canvas: canvas ?? null };
}

export async function exportAll(projectIds?: string[]): Promise<BackupFile> {
  const db = getDb();
  const ids =
    projectIds && projectIds.length
      ? projectIds
      : (await db.projects.toArray()).map((project) => project.id);

  const bundles: ProjectBundle[] = [];
  for (const id of ids) {
    const bundle = await collectProjectBundle(id);
    if (bundle) bundles.push(bundle);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    bundles,
  };
}

export function backupFileName(projectName?: string): string {
  const stamp = nowIso().slice(0, 10);
  return projectName
    ? `${slugify(projectName)}-${stamp}.vamsha.json`
    : `vamsha-vriksha-backup-${stamp}.json`;
}

export interface ImportResult {
  ok: boolean;
  message: string;
  projectIds: string[];
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BackupFile>;
  return candidate.format === BACKUP_FORMAT && Array.isArray(candidate.bundles);
}

/**
 * Imports bundles. `copy` (the default) never overwrites anything: it remaps
 * every id so imported data becomes a new lineage alongside existing ones.
 * `replace` wipes the local store first and is only reachable from an explicit
 * destructive action in Settings.
 */
export async function importBackup(
  json: string,
  mode: "copy" | "replace" = "copy",
): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: "That file is not valid JSON.", projectIds: [] };
  }

  if (!isBackupFile(parsed)) {
    return { ok: false, message: "That file is not a Vamsha-Vriksha backup.", projectIds: [] };
  }

  const db = getDb();
  const stamp = nowIso();
  const importedProjectIds: string[] = [];

  if (mode === "replace") await resetEverything();

  await db.transaction(
    "rw",
    [db.projects, db.people, db.relationships, db.biodata, db.canvasStates],
    async () => {
      for (const bundle of parsed.bundles) {
        if (!bundle?.project) continue;
        const projectId = createId("prj");
        importedProjectIds.push(projectId);

        await db.projects.add({
          ...bundle.project,
          id: projectId,
          name: mode === "replace" ? bundle.project.name : `${bundle.project.name} (imported)`,
          createdAt: bundle.project.createdAt ?? stamp,
          updatedAt: stamp,
        });

        const personIdMap = new Map<string, string>();
        for (const person of bundle.people ?? []) {
          const newId = createId("per");
          personIdMap.set(person.id, newId);
          await db.people.add({ ...person, id: newId, projectId });
        }

        for (const relationship of bundle.relationships ?? []) {
          const from = personIdMap.get(relationship.fromPersonId);
          const to = personIdMap.get(relationship.toPersonId);
          if (!from || !to) continue;
          await db.relationships.add({
            ...relationship,
            id: createId("rel"),
            projectId,
            fromPersonId: from,
            toPersonId: to,
          });
        }

        for (const biodata of bundle.biodata ?? []) {
          const personId = personIdMap.get(biodata.personId);
          if (!personId) continue;
          await db.biodata.add({
            ...biodata,
            id: personId,
            personId,
            projectId,
            customFields: biodata.customFields ?? [],
          });
        }

        const positions: Record<string, { x: number; y: number }> = {};
        for (const [oldId, position] of Object.entries(bundle.canvas?.nodePositions ?? {})) {
          const newId = personIdMap.get(oldId);
          if (newId) positions[newId] = position;
        }

        await db.canvasStates.put({
          id: projectId,
          projectId,
          viewport: bundle.canvas?.viewport ?? { x: 0, y: 0, zoom: 1 },
          nodePositions: positions,
          pinnedPersonIds: [],
          updatedAt: stamp,
        });
      }
    },
  );

  return {
    ok: true,
    message:
      mode === "replace"
        ? `Replaced local data with ${importedProjectIds.length} lineage${importedProjectIds.length === 1 ? "" : "s"}.`
        : `Imported ${importedProjectIds.length} lineage${importedProjectIds.length === 1 ? "" : "s"} as a copy.`,
    projectIds: importedProjectIds,
  };
}

/**
 * Explicit, user-triggered wipe. Never called during startup - startup must
 * always preserve whatever the user already has on this device.
 */
export async function resetEverything(): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.projects, db.people, db.relationships, db.biodata, db.canvasStates, db.meta],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.people.clear(),
        db.relationships.clear(),
        db.biodata.clear(),
        db.canvasStates.clear(),
        db.meta.clear(),
      ]);
    },
  );
}

/** Convenience used by the dashboard export action. */
export async function exportProjectToFile(projectId: string): Promise<string> {
  const bundle = await collectProjectBundle(projectId);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    bundles: bundle ? [bundle] : [],
  };
  return JSON.stringify(file, null, 2);
}

export async function touchProject(projectId: string): Promise<void> {
  await projectsRepo.touch(projectId);
}
