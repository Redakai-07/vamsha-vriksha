import { getDb } from "@/lib/db/db";
import type { Gender, Person } from "@/lib/domain/types";
import { createId, nowIso } from "@/lib/utils/id";

export interface CreatePersonInput {
  projectId: string;
  name: string;
  displayName?: string;
  gender?: Gender;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  profilePhoto?: string | null;
  notes?: string;
}

export const peopleRepo = {
  async listByProject(projectId: string): Promise<Person[]> {
    return getDb().people.where("projectId").equals(projectId).toArray();
  },

  async get(personId: string): Promise<Person | undefined> {
    return getDb().people.get(personId);
  },

  async create(input: CreatePersonInput): Promise<Person> {
    const db = getDb();
    const stamp = nowIso();
    const person: Person = {
      id: createId("per"),
      projectId: input.projectId,
      name: input.name.trim() || "Unnamed",
      displayName: input.displayName?.trim() || undefined,
      gender: input.gender ?? "unknown",
      dateOfBirth: input.dateOfBirth ?? null,
      dateOfDeath: input.dateOfDeath ?? null,
      profilePhoto: input.profilePhoto ?? null,
      notes: input.notes?.trim() || undefined,
      createdAt: stamp,
      updatedAt: stamp,
    };

    await db.transaction("rw", db.people, db.projects, async () => {
      await db.people.add(person);
      const project = await db.projects.get(person.projectId);
      if (project) await db.projects.put({ ...project, updatedAt: stamp });
    });

    return person;
  },

  async update(personId: string, patch: Partial<Omit<Person, "id" | "projectId">>): Promise<Person | undefined> {
    const db = getDb();
    const existing = await db.people.get(personId);
    if (!existing) return undefined;
    const stamp = nowIso();
    const next: Person = {
      ...existing,
      ...patch,
      name: (patch.name ?? existing.name).trim() || existing.name,
      displayName:
        patch.displayName === undefined
          ? existing.displayName
          : patch.displayName?.trim() || undefined,
      notes: patch.notes === undefined ? existing.notes : patch.notes?.trim() || undefined,
      updatedAt: stamp,
    };
    await db.transaction("rw", db.people, db.projects, async () => {
      await db.people.put(next);
      const project = await db.projects.get(next.projectId);
      if (project) await db.projects.put({ ...project, updatedAt: stamp });
    });
    return next;
  },

  /**
   * Removes a person and every row that would otherwise dangle: their biodata,
   * every relationship they were part of, and their canvas position.
   */
  async remove(personId: string): Promise<{ removedRelationships: number }> {
    const db = getDb();
    const person = await db.people.get(personId);
    if (!person) return { removedRelationships: 0 };

    let removedRelationships = 0;
    await db.transaction(
      "rw",
      [db.people, db.relationships, db.biodata, db.canvasStates, db.projects],
      async () => {
        const [asFrom, asTo] = await Promise.all([
          db.relationships.where("[projectId+fromPersonId]").equals([person.projectId, personId]).toArray(),
          db.relationships.where("[projectId+toPersonId]").equals([person.projectId, personId]).toArray(),
        ]);
        const ids = new Set([...asFrom, ...asTo].map((rel) => rel.id));
        removedRelationships = ids.size;
        if (ids.size) await db.relationships.bulkDelete([...ids]);

        await db.biodata.where("personId").equals(personId).delete();
        await db.people.delete(personId);

        const canvas = await db.canvasStates.get(person.projectId);
        if (canvas?.nodePositions?.[personId]) {
          const { [personId]: _removed, ...rest } = canvas.nodePositions;
          await db.canvasStates.put({
            ...canvas,
            nodePositions: rest,
            pinnedPersonIds: canvas.pinnedPersonIds.filter((id) => id !== personId),
            updatedAt: nowIso(),
          });
        }

        const project = await db.projects.get(person.projectId);
        if (project) {
          await db.projects.put({
            ...project,
            rootPersonId: project.rootPersonId === personId ? null : project.rootPersonId,
            updatedAt: nowIso(),
          });
        }
      },
    );

    return { removedRelationships };
  },

  async countByProject(projectId: string): Promise<number> {
    return getDb().people.where("projectId").equals(projectId).count();
  },
};
