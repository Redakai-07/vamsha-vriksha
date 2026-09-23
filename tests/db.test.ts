import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { exportAll, importBackup, resetEverything } from "@/lib/db/backup";
import { getDb, openDatabase } from "@/lib/db/db";
import { canvasRepo } from "@/lib/db/repositories/canvas";
import { biodataRepo } from "@/lib/db/repositories/biodata";
import { peopleRepo } from "@/lib/db/repositories/people";
import { preferencesRepo } from "@/lib/db/repositories/preferences";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { relationshipsRepo } from "@/lib/db/repositories/relationships";

beforeEach(async () => {
  await openDatabase();
  await resetEverything();
});

afterAll(async () => {
  getDb().close();
});

describe("projects", () => {
  it("creates a project together with its canvas state", async () => {
    const project = await projectsRepo.create({ name: "Sharma lineage" });
    expect(project.id).toBeTruthy();

    const canvas = await canvasRepo.get(project.id);
    expect(canvas.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(canvas.nodePositions).toEqual({});
  });

  it("cascades a project delete to every dependent table", async () => {
    const project = await projectsRepo.create({ name: "Doomed" });
    const person = await peopleRepo.create({ projectId: project.id, name: "A" });
    const other = await peopleRepo.create({ projectId: project.id, name: "B" });
    await biodataRepo.upsert(person.id, { occupation: "Farmer" });
    await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: person.id,
      toPersonId: other.id,
    });
    await canvasRepo.setPosition(project.id, person.id, { x: 10, y: 20 });

    await projectsRepo.remove(project.id);

    const db = getDb();
    expect(await db.projects.count()).toBe(0);
    expect(await db.people.count()).toBe(0);
    expect(await db.relationships.count()).toBe(0);
    expect(await db.biodata.count()).toBe(0);
    expect(await db.canvasStates.get(project.id)).toBeUndefined();
  });
});

describe("people and biodata", () => {
  it("stores a person with only a name (every field is optional)", async () => {
    const project = await projectsRepo.create({ name: "Minimal" });
    const person = await peopleRepo.create({ projectId: project.id, name: "Kaveri" });
    expect(person.gender).toBe("unknown");
    expect(person.dateOfBirth).toBeNull();
    expect(person.profilePhoto).toBeNull();
    // No biodata row is created until something is written.
    expect(await biodataRepo.get(person.id)).toBeUndefined();
  });

  it("creates biodata lazily and keeps blank values out of storage", async () => {
    const project = await projectsRepo.create({ name: "Biodata" });
    const person = await peopleRepo.create({ projectId: project.id, name: "Rao" });

    const created = await biodataRepo.upsert(person.id, {
      occupation: "  Weaver  ",
      education: "   ",
      biography: "Wove cotton for the village.",
    });
    expect(created.occupation).toBe("Weaver");
    expect(created.education).toBeUndefined();
    expect(created.customFields).toEqual([]);

    const updated = await biodataRepo.upsert(person.id, { placeOfBirth: "Kanchipuram" });
    expect(updated.occupation).toBe("Weaver");
    expect(updated.placeOfBirth).toBe("Kanchipuram");
    expect(await getDb().biodata.count()).toBe(1);
  });

  it("adds and removes custom biodata fields", async () => {
    const project = await projectsRepo.create({ name: "Custom" });
    const person = await peopleRepo.create({ projectId: project.id, name: "Rao" });
    const field = await biodataRepo.addCustomField(person.id, "Gotra", "Kashyap");
    let biodata = await biodataRepo.get(person.id);
    expect(biodata?.customFields).toHaveLength(1);

    await biodataRepo.removeCustomField(person.id, field.id);
    biodata = await biodataRepo.get(person.id);
    expect(biodata?.customFields).toHaveLength(0);
  });

  it("removing a person removes their relationships, biodata and position", async () => {
    const project = await projectsRepo.create({ name: "Cleanup" });
    const a = await peopleRepo.create({ projectId: project.id, name: "A" });
    const b = await peopleRepo.create({ projectId: project.id, name: "B" });
    await biodataRepo.upsert(a.id, { occupation: "Doctor" });
    await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: a.id,
      toPersonId: b.id,
    });
    await canvasRepo.setPosition(project.id, a.id, { x: 0, y: 0 });

    const result = await peopleRepo.remove(a.id);
    expect(result.removedRelationships).toBe(1);

    const db = getDb();
    expect(await db.relationships.count()).toBe(0);
    expect(await db.biodata.get(a.id)).toBeUndefined();
    const canvas = await canvasRepo.get(project.id);
    expect(canvas.nodePositions[a.id]).toBeUndefined();
  });
});

describe("relationships", () => {
  it("creates bonds and refuses invalid ones", async () => {
    const project = await projectsRepo.create({ name: "Bonds" });
    const a = await peopleRepo.create({ projectId: project.id, name: "A" });
    const b = await peopleRepo.create({ projectId: project.id, name: "B" });

    const first = await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: a.id,
      toPersonId: b.id,
    });
    expect(first.ok).toBe(true);

    const duplicate = await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: a.id,
      toPersonId: b.id,
    });
    expect(duplicate.ok).toBe(false);

    const loop = await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: b.id,
      toPersonId: a.id,
    });
    expect(loop.ok).toBe(false);

    expect(await relationshipsRepo.listForPerson(project.id, a.id)).toHaveLength(1);
  });

  it("keeps the elder sibling first when dates allow", async () => {
    const project = await projectsRepo.create({ name: "Siblings" });
    const younger = await peopleRepo.create({
      projectId: project.id,
      name: "Younger",
      dateOfBirth: "1994",
    });
    const elder = await peopleRepo.create({
      projectId: project.id,
      name: "Elder",
      dateOfBirth: "1990",
    });

    const result = await relationshipsRepo.create({
      projectId: project.id,
      type: "sibling",
      fromPersonId: younger.id,
      toPersonId: elder.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.relationship.fromPersonId).toBe(elder.id);
      expect(result.relationship.toPersonId).toBe(younger.id);
    }
  });
});

describe("offline persistence", () => {
  it("survives closing and reopening the database (browser restart)", async () => {
    const project = await projectsRepo.create({ name: "Persisted lineage" });
    const person = await peopleRepo.create({
      projectId: project.id,
      name: "Ancestor",
      gender: "male",
      dateOfBirth: "1926",
    });
    await biodataRepo.upsert(person.id, { occupation: "Farmer", biography: "Kept records." });
    await canvasRepo.setPosition(project.id, person.id, { x: 220, y: -40 });
    await canvasRepo.saveViewport(project.id, { x: -100, y: 40, zoom: 1.35 });

    // Simulate the app being closed and the page being opened again later.
    getDb().close();
    await openDatabase();

    const reopened = await projectsRepo.list();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].name).toBe("Persisted lineage");

    const people = await peopleRepo.listByProject(project.id);
    expect(people).toHaveLength(1);
    expect((await biodataRepo.get(person.id))?.occupation).toBe("Farmer");

    const canvas = await canvasRepo.get(project.id);
    expect(canvas.nodePositions[person.id]).toEqual({ x: 220, y: -40 });
    expect(canvas.viewport).toEqual({ x: -100, y: 40, zoom: 1.35 });
  });

  it("runs on schema version 2 after migrations", async () => {
    await openDatabase();
    expect(getDb().verno).toBe(2);
    expect(getDb().tables.map((table) => table.name).sort()).toEqual([
      "biodata",
      "canvasStates",
      "meta",
      "people",
      "preferences",
      "projects",
      "relationships",
    ]);
  });
});

describe("backup", () => {
  it("exports and re-imports a lineage as a copy with remapped ids", async () => {
    const project = await projectsRepo.create({ name: "Exportable" });
    const a = await peopleRepo.create({ projectId: project.id, name: "A" });
    const b = await peopleRepo.create({ projectId: project.id, name: "B" });
    await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: a.id,
      toPersonId: b.id,
    });
    await canvasRepo.setPosition(project.id, a.id, { x: 5, y: 7 });

    const backup = await exportAll();
    const json = JSON.stringify(backup);

    const result = await importBackup(json, "copy");
    expect(result.ok).toBe(true);
    expect(result.projectIds).toHaveLength(1);

    const projects = await projectsRepo.list();
    expect(projects).toHaveLength(2);

    const imported = projects.find((item) => item.id !== project.id)!;
    expect(imported.name).toContain("(imported)");

    const importedPeople = await peopleRepo.listByProject(imported.id);
    expect(importedPeople).toHaveLength(2);
    // Ids are remapped, so the copy cannot collide with the original.
    expect(importedPeople.map((person) => person.id)).not.toContain(a.id);

    const importedRelationships = await relationshipsRepo.listByProject(imported.id);
    expect(importedRelationships).toHaveLength(1);
    const importedIds = new Set(importedPeople.map((person) => person.id));
    expect(importedIds.has(importedRelationships[0].fromPersonId)).toBe(true);
    expect(importedIds.has(importedRelationships[0].toPersonId)).toBe(true);

    const importedCanvas = await canvasRepo.get(imported.id);
    expect(Object.values(importedCanvas.nodePositions)).toHaveLength(1);
  });

  it("rejects files that are not backups", async () => {
    const result = await importBackup("{ not json", "copy");
    expect(result.ok).toBe(false);
    const wrongFormat = await importBackup(JSON.stringify({ hello: "world" }), "copy");
    expect(wrongFormat.ok).toBe(false);
  });
});

describe("preferences", () => {
  it("returns defaults and persists changes", async () => {
    const initial = await preferencesRepo.all();
    expect(initial.theme).toBe("system");
    expect(initial.canvasBackdrop).toBe("dots");

    await preferencesRepo.save({ theme: "dark", showMinimap: false });
    const updated = await preferencesRepo.all();
    expect(updated.theme).toBe("dark");
    expect(updated.showMinimap).toBe(false);
    expect(updated.showCulturalTerms).toBe(true);

    await preferencesRepo.reset();
    expect((await preferencesRepo.all()).theme).toBe("system");
  });
});
