import { getDb } from "@/lib/db/db";
import { touchProjectStaged } from "@/lib/db/repositories/projects";
import type { Biodata, BiodataField } from "@/lib/domain/types";
import { stageDelete, stageUpsert } from "@/lib/sync/queue";
import { createId, nowIso } from "@/lib/utils/id";

export type BiodataPatch = Partial<
  Pick<Biodata, "placeOfBirth" | "placeOfDeath" | "occupation" | "education" | "biography" | "notes">
>;

/**
 * Biodata rows are created lazily: a person without any biodata simply has no
 * row. `upsert` therefore creates on first write and never fails on a missing
 * row, which keeps the edit forms free of "does it exist yet?" branching.
 */
export const biodataRepo = {
  async get(personId: string): Promise<Biodata | undefined> {
    return getDb().biodata.get(personId);
  },

  async listByProject(projectId: string): Promise<Biodata[]> {
    return getDb().biodata.where("projectId").equals(projectId).toArray();
  },

  async upsert(personId: string, patch: BiodataPatch): Promise<Biodata> {
    const db = getDb();
    const person = await db.people.get(personId);
    if (!person) throw new Error("Cannot store biodata for an unknown person");

    const stamp = nowIso();
    const existing = await db.biodata.get(personId);
    const clean = (value: string | undefined) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    };

    const next: Biodata = existing
      ? {
          ...existing,
          ...patch,
          placeOfBirth: patch.placeOfBirth === undefined ? existing.placeOfBirth : clean(patch.placeOfBirth),
          placeOfDeath: patch.placeOfDeath === undefined ? existing.placeOfDeath : clean(patch.placeOfDeath),
          occupation: patch.occupation === undefined ? existing.occupation : clean(patch.occupation),
          education: patch.education === undefined ? existing.education : clean(patch.education),
          biography: patch.biography === undefined ? existing.biography : clean(patch.biography),
          notes: patch.notes === undefined ? existing.notes : clean(patch.notes),
          updatedAt: stamp,
        }
      : {
          id: personId,
          personId,
          projectId: person.projectId,
          placeOfBirth: clean(patch.placeOfBirth),
          placeOfDeath: clean(patch.placeOfDeath),
          occupation: clean(patch.occupation),
          education: clean(patch.education),
          biography: clean(patch.biography),
          notes: clean(patch.notes),
          customFields: [],
          createdAt: stamp,
          updatedAt: stamp,
        };

    await db.transaction("rw", [db.biodata, db.projects, db.outbox], async () => {
      await stageUpsert(db, "biodata", next);
      await touchProjectStaged(db, person.projectId, stamp);
    });
    return next;
  },

  async setCustomFields(personId: string, fields: BiodataField[]): Promise<Biodata> {
    const db = getDb();
    const person = await db.people.get(personId);
    if (!person) throw new Error("Cannot store biodata for an unknown person");
    const stamp = nowIso();
    const existing = await db.biodata.get(personId);
    const cleaned = fields
      .map((field) => ({ ...field, label: field.label.trim(), value: field.value }))
      .filter((field) => field.label || field.value);

    const next: Biodata = existing
      ? { ...existing, customFields: cleaned, updatedAt: stamp }
      : {
          id: personId,
          personId,
          projectId: person.projectId,
          customFields: cleaned,
          createdAt: stamp,
          updatedAt: stamp,
        };

    await db.transaction("rw", [db.biodata, db.outbox], async () => {
      await stageUpsert(db, "biodata", next);
    });
    return next;
  },

  async addCustomField(personId: string, label = "", value = ""): Promise<BiodataField> {
    const field: BiodataField = { id: createId("fld"), label, value };
    const existing = await this.get(personId);
    await this.setCustomFields(personId, [...(existing?.customFields ?? []), field]);
    return field;
  },

  async removeCustomField(personId: string, fieldId: string): Promise<void> {
    const existing = await this.get(personId);
    if (!existing) return;
    await this.setCustomFields(
      personId,
      existing.customFields.filter((field) => field.id !== fieldId),
    );
  },

  async remove(personId: string): Promise<void> {
    const db = getDb();
    const existing = await db.biodata.get(personId);
    if (!existing) return;
    await db.transaction("rw", [db.biodata, db.outbox, db.syncBase], async () => {
      await stageDelete(db, "biodata", existing);
    });
  },
};
