import { getDb } from "@/lib/db/db";
import type { KinshipSystemId, Project } from "@/lib/domain/types";
import { createId, nowIso } from "@/lib/utils/id";

/** Default canvas state for a brand new project: empty world, 100% zoom. */
function initialCanvasState(projectId: string) {
  return {
    id: projectId,
    projectId,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodePositions: {},
    pinnedPersonIds: [] as string[],
    updatedAt: nowIso(),
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  kinshipSystem?: KinshipSystemId;
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

    await db.transaction("rw", db.projects, db.canvasStates, db.meta, async () => {
      await db.projects.add(project);
      // Every project owns its own canvas presentation state.
      await db.canvasStates.put(initialCanvasState(project.id));
      await db.meta.put({ key: "lastProjectId", value: project.id, updatedAt: stamp });
    });

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
    await db.projects.put(next);
    return next;
  },

  /** Bumps `updatedAt` so the dashboard sorts by real activity. */
  async touch(projectId: string): Promise<void> {
    const db = getDb();
    const existing = await db.projects.get(projectId);
    if (!existing) return;
    await db.projects.put({ ...existing, updatedAt: nowIso() });
  },

  /** Deletes a lineage and everything that belongs to it - in one transaction. */
  async remove(projectId: string): Promise<void> {
    const db = getDb();
    await db.transaction(
      "rw",
      [db.projects, db.people, db.relationships, db.biodata, db.canvasStates, db.meta],
      async () => {
        await db.people.where("projectId").equals(projectId).delete();
        await db.relationships.where("projectId").equals(projectId).delete();
        await db.biodata.where("projectId").equals(projectId).delete();
        await db.canvasStates.delete(projectId);
        await db.projects.delete(projectId);

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
