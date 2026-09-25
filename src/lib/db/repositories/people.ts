import { getDb } from "@/lib/db/db";
import { touchProjectStaged } from "@/lib/db/repositories/projects";
import type { Gender, Person } from "@/lib/domain/types";
import { stageDelete, stageUpsert } from "@/lib/sync/queue";
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

    await db.transaction("rw", [db.people, db.projects, db.outbox], async () => {
      await stageUpsert(db, "people", person);
      await touchProjectStaged(db, person.projectId, stamp);
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
    await db.transaction("rw", [db.people, db.projects, db.outbox], async () => {
      await stageUpsert(db, "people", next);
      await touchProjectStaged(db, next.projectId, stamp);
    });
    return next;
  },

  /**
   * Removes a person and every row that would otherwise dangle: their biodata,
   * every relationship they were part of, and their canvas position. With an
   * account signed in, each of those removals is published as a tombstone.
   */
  async remove(personId: string): Promise<{ removedRelationships: number }> {
    const db = getDb();
    const person = await db.people.get(personId);
    if (!person) return { removedRelationships: 0 };

    let removedRelationships = 0;
    await db.transaction(
      "rw",
      [db.people, db.relationships, db.biodata, db.canvasStates, db.projects, db.outbox, db.syncBase],
      async () => {
        const [asFrom, asTo] = await Promise.all([
          db.relationships.where("[projectId+fromPersonId]").equals([person.projectId, personId]).toArray(),
          db.relationships.where("[projectId+toPersonId]").equals([person.projectId, personId]).toArray(),
        ]);
        const bonds = [...asFrom, ...asTo];
        removedRelationships = bonds.length;
        for (const bond of bonds) await stageDelete(db, "relationships", bond);

        const [biodata, canvas] = await Promise.all([
          db.biodata.where("personId").equals(personId).first(),
          db.canvasStates.get(person.projectId),
        ]);
        if (biodata) await stageDelete(db, "biodata", biodata);
        await stageDelete(db, "people", person);

        if (canvas?.nodePositions?.[personId]) {
          const { [personId]: _removed, ...rest } = canvas.nodePositions;
          await stageUpsert(db, "canvasStates", {
            ...canvas,
            nodePositions: rest,
            pinnedPersonIds: canvas.pinnedPersonIds.filter((id) => id !== personId),
            updatedAt: nowIso(),
          });
        }

        const project = await db.projects.get(person.projectId);
        if (project) {
          await stageUpsert(db, "projects", {
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
