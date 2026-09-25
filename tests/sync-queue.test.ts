import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, openDatabase } from "@/lib/db/db";
import { resetEverything } from "@/lib/db/backup";
import { peopleRepo } from "@/lib/db/repositories/people";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { relationshipsRepo } from "@/lib/db/repositories/relationships";
import { setExcludedProjects } from "@/lib/sync/exclusions";
import { queueEverythingMissing } from "@/lib/sync/engine";
import { listQueue, pendingByProject, readSyncMeta, setSyncEnabled } from "@/lib/sync/queue";

beforeEach(async () => {
  await openDatabase();
  await resetEverything();
  setExcludedProjects([]);
  setSyncEnabled(false);
});

afterAll(() => {
  getDb().close();
});

describe("sync queue", () => {
  it("stages a new project together with its canvas state", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Karnataka lineage" });

    const queue = await listQueue();
    expect(queue.map((row) => row.collection).sort()).toEqual(["canvasStates", "projects"]);
    expect(queue.every((row) => row.op === "upsert")).toBe(true);
    expect(queue.every((row) => row.projectId === project.id)).toBe(true);

    const stored = await getDb().projects.get(project.id);
    expect(readSyncMeta(stored)).toMatchObject({ rev: 1, syncedRev: 0, state: "pending" });
  });

  it("stages even while anonymous, so a later sign-in is incremental", async () => {
    setSyncEnabled(false);
    await projectsRepo.create({ name: "Offline only" });

    expect(await getDb().outbox.count()).toBe(2);
    const project = (await projectsRepo.list())[0];
    expect(readSyncMeta(project).state).toBe("local");
  });

  it("coalesces repeated edits to one entity into a single queue row", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Lineage" });
    const person = await peopleRepo.create({ projectId: project.id, name: "Rama" });

    await peopleRepo.update(person.id, { occupation: undefined, notes: "one" });
    await peopleRepo.update(person.id, { notes: "two" });
    await peopleRepo.update(person.id, { notes: "three" });

    const rows = (await listQueue()).filter((row) => row.collection === "people");
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(person.id);

    const stored = await getDb().people.get(person.id);
    // One queue entry, but the revision keeps climbing: it is what the merge
    // compares, and collapsing it would lose "this changed after the last sync".
    expect(readSyncMeta(stored).rev).toBe(4);
  });

  it("stages a delete as a tombstone carrying its base revision", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Lineage" });
    const person = await peopleRepo.create({ projectId: project.id, name: "Rama" });
    await getDb().people.update(person.id, { sync: { rev: 3, syncedRev: 3, cloudRev: 7, origin: "d", state: "synced" } });

    await peopleRepo.remove(person.id);

    expect(await getDb().people.get(person.id)).toBeUndefined();
    const row = (await listQueue()).find((entry) => entry.collection === "people");
    expect(row).toMatchObject({ op: "delete", entityId: person.id, cloudRev: 7 });
  });

  it("cascades a project delete into tombstones for everything inside it", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Doomed" });
    const a = await peopleRepo.create({ projectId: project.id, name: "A" });
    const b = await peopleRepo.create({ projectId: project.id, name: "B" });
    await relationshipsRepo.create({
      projectId: project.id,
      type: "parent",
      fromPersonId: a.id,
      toPersonId: b.id,
    });

    await projectsRepo.remove(project.id);

    const rows = await listQueue();
    expect(rows.every((row) => row.op === "delete")).toBe(true);
    expect(rows.filter((row) => row.collection === "people")).toHaveLength(2);
    expect(rows.filter((row) => row.collection === "relationships")).toHaveLength(1);
    expect(rows.some((row) => row.collection === "projects")).toBe(true);
  });

  it("never queues further work on a project the user chose to keep local", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Private lineage" });

    // The user answered "keep them local": anything already queued is withdrawn,
    // and the choice sticks from then on.
    setExcludedProjects([project.id]);
    await getDb().outbox.clear();

    await peopleRepo.create({ projectId: project.id, name: "Rama" });
    await projectsRepo.update(project.id, { name: "Private lineage (renamed)" });

    expect(await getDb().outbox.count()).toBe(0);
    // The work itself is untouched: this is an upload choice, not a data change.
    expect(await peopleRepo.countByProject(project.id)).toBe(1);
  });

  it("counts queued work per project", async () => {
    setSyncEnabled(true);
    const one = await projectsRepo.create({ name: "One" });
    const two = await projectsRepo.create({ name: "Two" });
    await peopleRepo.create({ projectId: one.id, name: "A" });

    const counts = await pendingByProject();
    expect(counts[one.id]).toBe(2 + 1); // project + canvas + person
    expect(counts[two.id]).toBe(2);
  });

  it("sweeps rows that predate sync, and only those", async () => {
    setSyncEnabled(true);
    const project = await projectsRepo.create({ name: "Old" });
    await getDb().outbox.clear();

    const queued = await queueEverythingMissing();
    expect(queued).toBe(2);

    // A second sweep is a no-op rather than a re-upload.
    expect(await queueEverythingMissing()).toBe(0);
    expect((await listQueue()).every((row) => row.projectId === project.id)).toBe(true);
  });
});
