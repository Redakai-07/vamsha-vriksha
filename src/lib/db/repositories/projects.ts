import { getDb, type VamshaDatabase } from "@/lib/db/db";
import type { CanvasState, KinshipSystemId, Project } from "@/lib/domain/types";
import { stageDelete, stageUpsert } from "@/lib/sync/queue";
import { createId, nowIso } from "@/lib/utils/id";

/** Default canvas state for a brand new project: empty world, 100% zoom. */
function initialCanvasState(projectId: string): CanvasState {
  return {
    id: projectId,
    projectId,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodePositions: {},
    pinnedPersonIds: [],
    updatedAt: nowIso(),
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  kinshipSystem?: KinshipSystemId;
}

/**
 * Bumps a project's `updatedAt` so the dashboard sorts by real activity, and
 * queues that bump for sync along with it.
 *
 * Every content edit in the app funnels through here, which is why editing a
 * person makes their lineage look "recently changed" on every device.
 */
export async function touchProjectStaged(
  db: VamshaDatabase,
  projectId: string,
  stamp = nowIso(),
): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) return;
  await stageUpsert(db, "projects", { ...project, updatedAt: stamp });
}

export const projectsRepo = {
  async list(): Promise<Project[]> {
    const rows = await getDb().projects.toArray();
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(projectId: string): Promise<Project | undefined> {
    return getDb().projects.get(projectId);
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const db = getDb();
    const stamp = nowIso();
    const project: Project = {
      id: createId("prj"),
      name: input.name.trim() || "Untitled lineage",
      description: input.description?.trim() || undefined,
      kinshipSystem: input.kinshipSystem ?? "hindi",
      rootPersonId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };

    await db.transaction(
      "rw",
      [db.projects, db.canvasStates, db.meta, db.outbox],
      async () => {
        await stageUpsert(db, "projects", project);
        // Every project owns its own canvas presentation state.
        await stageUpsert(db, "canvasStates", initialCanvasState(project.id));
        await db.meta.put({ key: "lastProjectId", value: project.id, updatedAt: stamp });
      },
    );

    return project;
  },

  async update(
    projectId: string,
    patch: Partial<Pick<Project, "name" | "description" | "kinshipSystem" | "rootPersonId">>,
  ): Promise<Project | undefined> {
    const db = getDb();
    const existing = await db.projects.get(projectId);
    if (!existing) return undefined;
    const next: Project = {
      ...existing,
      ...patch,
      name: patch.name?.trim() || existing.name,
      description: patch.description?.trim() || undefined,
      updatedAt: nowIso(),
    };
    await db.transaction("rw", [db.projects, db.outbox], async () => {
      await stageUpsert(db, "projects", next);
    });
    return next;
  },

  /** Bumps `updatedAt` so the dashboard sorts by real activity. */
  async touch(projectId: string): Promise<void> {
    const db = getDb();
    await db.transaction("rw", [db.projects, db.outbox], async () => {
      await touchProjectStaged(db, projectId);
    });
  },

  /**
   * Deletes a lineage and everything that belongs to it, in one transaction.
   *
   * If an account is signed in, each row is published as a tombstone on the way
   * out, so the deletion travels to other devices - and, because a tombstone is
   * not the same thing as an absent row, a device that is editing one of these
   * records can still answer back with its content instead of losing it.
   */
  async remove(projectId: string): Promise<void> {
    const db = getDb();
    await db.transaction(
      "rw",
      [db.projects, db.people, db.relationships, db.biodata, db.canvasStates, db.meta, db.outbox, db.syncBase],
      async () => {
        const [people, relationships, biodata, canvas, project] = await Promise.all([
          db.people.where("projectId").equals(projectId).toArray(),
          db.relationships.where("projectId").equals(projectId).toArray(),
          db.biodata.where("projectId").equals(projectId).toArray(),
          db.canvasStates.get(projectId),
          db.projects.get(projectId),
        ]);

        for (const person of people) await stageDelete(db, "people", person);
        for (const relationship of relationships) {
          await stageDelete(db, "relationships", relationship);
        }
        for (const row of biodata) await stageDelete(db, "biodata", row);
        if (canvas) await stageDelete(db, "canvasStates", canvas);
        if (project) await stageDelete(db, "projects", project);

        const last = await db.meta.get("lastProjectId");
        if (last?.value === projectId) {
          await db.meta.put({ key: "lastProjectId", value: "", updatedAt: nowIso() });
        }
      },
    );
  },

  async counts(projectId: string): Promise<{ people: number; relationships: number }> {
    const db = getDb();
    const [people, relationships] = await Promise.all([
      db.people.where("projectId").equals(projectId).count(),
      db.relationships.where("projectId").equals(projectId).count(),
    ]);
    return { people, relationships };
  },
};
