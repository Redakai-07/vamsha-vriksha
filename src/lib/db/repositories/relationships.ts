import { getDb } from "@/lib/db/db";
import {
  createRelationship,
  orderSiblingsForStorage,
  validateNewRelationship,
  type RelationshipInput,
} from "@/lib/domain/relationship";
import type { Relationship } from "@/lib/domain/types";
import { createId, nowIso } from "@/lib/utils/id";

export type CreateRelationshipResult =
  | { ok: true; relationship: Relationship }
  | { ok: false; reason: string };

export const relationshipsRepo = {
  async listByProject(projectId: string): Promise<Relationship[]> {
    return getDb().relationships.where("projectId").equals(projectId).toArray();
  },

  async listForPerson(projectId: string, personId: string): Promise<Relationship[]> {
    const db = getDb();
    const [asFrom, asTo] = await Promise.all([
      db.relationships.where("[projectId+fromPersonId]").equals([projectId, personId]).toArray(),
      db.relationships.where("[projectId+toPersonId]").equals([projectId, personId]).toArray(),
    ]);
    return [...asFrom, ...asTo];
  },

  async get(relationshipId: string): Promise<Relationship | undefined> {
    return getDb().relationships.get(relationshipId);
  },

  /**
   * Creates an explicit relationship record. Always validated against the
   * current project graph, so the UI cannot produce impossible kinship.
   */
  async create(input: Omit<RelationshipInput, "id">): Promise<CreateRelationshipResult> {
    const db = getDb();
    const existing = await db.relationships.where("projectId").equals(input.projectId).toArray();

    let fromPersonId = input.fromPersonId;
    let toPersonId = input.toPersonId;

    // Keep the elder sibling first so relationship lists read chronologically.
    if (input.type === "sibling") {
      const [a, b] = await Promise.all([
        db.people.get(fromPersonId),
        db.people.get(toPersonId),
      ]);
      const ordered = orderSiblingsForStorage(a, b);
      if (ordered) {
        fromPersonId = ordered.from;
        toPersonId = ordered.to;
      }
    }

    const candidate = { ...input, fromPersonId, toPersonId };
    const validation = validateNewRelationship(candidate, existing);
    if (!validation.ok) return { ok: false, reason: validation.reason };

    const relationship = createRelationship(candidate, createId("rel"));
    await db.transaction("rw", db.relationships, db.projects, async () => {
      await db.relationships.add(relationship);
      const project = await db.projects.get(relationship.projectId);
      if (project) await db.projects.put({ ...project, updatedAt: nowIso() });
    });

    return { ok: true, relationship };
  },

  async update(
    relationshipId: string,
    patch: Partial<Pick<Relationship, "status" | "label" | "startDate" | "endDate" | "notes">>,
  ): Promise<Relationship | undefined> {
    const db = getDb();
    const existing = await db.relationships.get(relationshipId);
    if (!existing) return undefined;
    const next: Relationship = {
      ...existing,
      ...patch,
      label:
        existing.type === "other"
          ? (patch.label ?? existing.label)?.trim() || "Related"
          : undefined,
      notes: patch.notes === undefined ? existing.notes : patch.notes?.trim() || undefined,
      updatedAt: nowIso(),
    };
    await db.relationships.put(next);
    return next;
  },

  async remove(relationshipId: string): Promise<void> {
    const db = getDb();
    const existing = await db.relationships.get(relationshipId);
    if (!existing) return;
    await db.transaction("rw", db.relationships, db.projects, async () => {
      await db.relationships.delete(relationshipId);
      const project = await db.projects.get(existing.projectId);
      if (project) await db.projects.put({ ...project, updatedAt: nowIso() });
    });
  },

  /** Resolves the single bond between two people, if one exists. */
  async findBetween(
    projectId: string,
    a: string,
    b: string,
  ): Promise<Relationship | undefined> {
    const bonds = await getDb()
      .relationships.where("projectId")
      .equals(projectId)
      .filter(
        (rel) =>
          (rel.fromPersonId === a && rel.toPersonId === b) ||
          (rel.fromPersonId === b && rel.toPersonId === a),
      )
      .toArray();
    return bonds[0];
  },

  async countByProject(projectId: string): Promise<number> {
    return getDb().relationships.where("projectId").equals(projectId).count();
  },
};
