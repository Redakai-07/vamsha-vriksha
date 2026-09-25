import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetEverything } from "@/lib/db/backup";
import { getDb, openDatabase } from "@/lib/db/db";
import { canvasRepo } from "@/lib/db/repositories/canvas";
import { peopleRepo } from "@/lib/db/repositories/people";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { relationshipsRepo } from "@/lib/db/repositories/relationships";
import { clearLocalMirror, createLocalMirrorBackend } from "@/lib/sync/backend.local";
import { createSyncEngine } from "@/lib/sync/engine";
import { SyncTransportError } from "@/lib/sync/errors";
import { setExcludedProjects } from "@/lib/sync/exclusions";
import { readAccount, setCursor, writeAccount, type SyncAccount } from "@/lib/sync/identity";
import { listQueue, readSyncMeta, setSyncEnabled } from "@/lib/sync/queue";
import type { SyncBackend } from "@/lib/sync/types";

const ACCOUNT: SyncAccount = {
  accountId: "acct_test",
  displayName: "This browser",
  provider: "local",
  signedInAt: "2026-05-01T00:00:00.000Z",
};

/** A second device, as seen from here: something outside this browser. */
const DEVICE_B = "device-b";

let mirror: SyncBackend;

beforeEach(async () => {
  await openDatabase();
  await resetEverything();
  await clearLocalMirror();
  setExcludedProjects([]);
  setSyncEnabled(false);
  mirror = createLocalMirrorBackend();
});

afterAll(() => {
  getDb().close();
});

function engine(backend: SyncBackend = mirror) {
  return createSyncEngine(backend);
}

/** Signs in and performs the first backup, as the UI does. */
async function signInAndBackUp() {
  await writeAccount(ACCOUNT);
  setSyncEnabled(true);
  return engine().sync();
}

async function seedLineage() {
  setSyncEnabled(false);
  const project = await projectsRepo.create({ name: "Karnataka lineage" });
  const rama = await peopleRepo.create({ projectId: project.id, name: "Rama", gender: "male" });
  const sita = await peopleRepo.create({ projectId: project.id, name: "Sita", gender: "female" });
  await relationshipsRepo.create({
    projectId: project.id,
    type: "spouse",
    fromPersonId: rama.id,
    toPersonId: sita.id,
  });
  return { project, rama, sita };
}

/** Writes to the cloud as another device would, with its own origin. */
async function otherDeviceEdits(
  collection: "people",
  id: string,
  projectId: string,
  patch: Record<string, unknown>,
  updatedAt: string,
) {
  const current = await mirror.getRecord(ACCOUNT.accountId, collection, id);
  expect(current).not.toBeNull();
  const result = await mirror.putRecord({
    accountId: ACCOUNT.accountId,
    collection,
    id,
    projectId,
    payload: { ...current!.payload, ...patch },
    baseRev: current!.cloudRev,
    updatedAt,
    origin: DEVICE_B,
    deletedAt: null,
  });
  expect(result.ok).toBe(true);
}

describe("offline-first behaviour", () => {
  it("works exactly as before with nobody signed in", async () => {
    const { project, rama } = await seedLineage();

    const summary = await engine().sync();

    expect(summary.skipped).toBe("no-account");
    expect(await getDb().projects.get(project.id)).toBeTruthy();
    expect(await getDb().people.get(rama.id)).toBeTruthy();
    // The work is queued, not uploaded - and not lost either.
    expect(await getDb().outbox.count()).toBeGreaterThan(0);
    expect(await mirror.listAll(ACCOUNT.accountId)).toEqual([]);
  });

  it("keeps editing possible when the network refuses every write", async () => {
    const { project } = await seedLineage();
    await writeAccount(ACCOUNT);
    setSyncEnabled(true);

    const offline: SyncBackend = {
      ...mirror,
      putRecord: async () => {
        throw new SyncTransportError("offline");
      },
      listChanges: async () => {
        throw new SyncTransportError("offline");
      },
    };

    const before = await getDb().outbox.count();
    const summary = await engine(offline).sync();

    expect(summary.offline).toBe(true);
    expect(summary.message).toMatch(/offline/i);
    expect(await getDb().outbox.count()).toBe(before);

    // Editing never blocks on sync.
    const late = await peopleRepo.create({ projectId: project.id, name: "Late arrival" });
    expect(await getDb().people.get(late.id)).toBeTruthy();
  });
});

describe("backing up and syncing", () => {
  it("uploads the whole lineage on first sign-in and marks it synced", async () => {
    const { project, rama } = await seedLineage();

    const summary = await signInAndBackUp();

    expect(summary.offline).toBe(false);
    expect(summary.pushed).toBeGreaterThan(0);
    expect(await getDb().outbox.count()).toBe(0);

    const records = await mirror.listAll(ACCOUNT.accountId);
    expect(records.some((record) => record.collection === "projects" && record.id === project.id)).toBe(true);
    expect(records.some((record) => record.collection === "people" && record.id === rama.id)).toBe(true);

    const stored = await getDb().people.get(rama.id);
    expect(readSyncMeta(stored).state).toBe("synced");
    expect(readSyncMeta(stored).cloudRev).toBeGreaterThan(0);
  });

  it("sends only what changed, never the whole database", async () => {
    const { project, rama, sita } = await seedLineage();
    await signInAndBackUp();

    await peopleRepo.update(rama.id, { notes: "family head" });

    const queued = await listQueue();
    expect(queued.filter((row) => row.collection === "people").map((row) => row.entityId)).toEqual([rama.id]);
    // Sita and the relationship are untouched, so they are not in the queue.
    expect(queued.some((row) => row.entityId === sita.id)).toBe(false);
    expect(queued.some((row) => row.collection === "relationships")).toBe(false);
    expect(queued.some((row) => row.collection === "projects" && row.entityId === project.id)).toBe(true);

    const summary = await engine().sync();
    expect(summary.pushed).toBe(queued.length);
  });

  it("uploads work that predates sync entirely", async () => {
    const { project, rama } = await seedLineage();
    // Exactly what an older build left behind: rows with no sync block at all,
    // and so no revision history to compare.
    await getDb().people.toCollection().modify((person) => {
      delete person.sync;
    });
    await getDb().projects.toCollection().modify((row) => {
      delete row.sync;
    });
    await getDb().canvasStates.toCollection().modify((row) => {
      delete row.sync;
    });

    await writeAccount(ACCOUNT);
    setSyncEnabled(true);
    const summary = await engine().backUpProject(project.id);

    expect(summary.pushed).toBeGreaterThan(0);
    const records = await mirror.listAll(ACCOUNT.accountId);
    expect(records.some((record) => record.collection === "people" && record.id === rama.id)).toBe(true);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("does not re-upload records the account already has", async () => {
    await seedLineage();
    await signInAndBackUp();

    const summary = await engine().sync();

    expect(summary.pushed).toBe(0);
    expect(summary.pulled).toBe(0);
    expect(summary.offline).toBe(false);
  });
});

describe("two devices editing the same person", () => {
  it("merges edits to different fields with no conflict at all", async () => {
    const { project, rama } = await seedLineage();
    await signInAndBackUp();

    await otherDeviceEdits("people", rama.id, project.id, { name: "Rama Kumar" }, "2026-05-02T00:00:00.000Z");
    await peopleRepo.update(rama.id, { notes: "farmer" });

    await engine().sync();

    const merged = await getDb().people.get(rama.id);
    expect(merged?.name).toBe("Rama Kumar");
    expect(merged?.notes).toBe("farmer");
    expect(await getDb().conflicts.count()).toBe(0);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("keeps the newer edit and preserves the other when both change one field", async () => {
    const { project, rama } = await seedLineage();
    await signInAndBackUp();

    await otherDeviceEdits("people", rama.id, project.id, { name: "Rama Kumar" }, "2026-05-02T00:00:00.000Z");
    await peopleRepo.update(rama.id, { name: "Rama Rao" });

    await engine().sync();

    const merged = await getDb().people.get(rama.id);
    // This device's edit is the more recent one, so the field keeps it...
    expect(merged?.name).toBe("Rama Rao");

    // ...and the other value is preserved rather than destroyed.
    const conflicts = await getDb().conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      collection: "people",
      entityId: rama.id,
      field: "name",
      appliedValue: "Rama Rao",
      appliedFrom: "local",
      preservedValue: "Rama Kumar",
    });
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("lets the user put the preserved value back", async () => {
    const { project, rama } = await seedLineage();
    await signInAndBackUp();
    await otherDeviceEdits("people", rama.id, project.id, { name: "Rama Kumar" }, "2026-05-02T00:00:00.000Z");
    await peopleRepo.update(rama.id, { name: "Rama Rao" });
    await engine().sync();

    const conflict = (await getDb().conflicts.toArray())[0];
    await engine().resolveConflict(conflict.id, "keep-preserved");

    expect((await getDb().people.get(rama.id))?.name).toBe("Rama Kumar");
    // Answered, so it no longer counts as an open question - the row itself is
    // kept as a record of what happened.
    expect(await engine().countConflicts()).toBe(0);
    expect(await getDb().conflicts.count()).toBe(1);

    // Restoring a value is an edit like any other, so it travels back out.
    await engine().sync();
    const remote = await mirror.getRecord(ACCOUNT.accountId, "people", rama.id);
    expect(remote?.payload.name).toBe("Rama Kumar");
  });

  it("brings a record back when another device edited it after this one deleted it", async () => {
    const { project, rama } = await seedLineage();
    await signInAndBackUp();

    const before = await mirror.getRecord(ACCOUNT.accountId, "people", rama.id);
    await peopleRepo.remove(rama.id);
    // Device B edits the person in the meantime, based on the revision we knew.
    await mirror.putRecord({
      accountId: ACCOUNT.accountId,
      collection: "people",
      id: rama.id,
      projectId: project.id,
      payload: { ...before!.payload, notes: "still here" },
      baseRev: before!.cloudRev,
      updatedAt: "2026-05-02T00:00:00.000Z",
      origin: DEVICE_B,
      deletedAt: null,
    });

    await engine().sync();

    const restored = await getDb().people.get(rama.id);
    expect(restored).toBeTruthy();
    expect(restored?.notes).toBe("still here");
    expect((await getDb().conflicts.toArray()).some((row) => row.field === "*restore")).toBe(true);
  });
});

describe("recovering a project on another device", () => {
  it("replays the account's copy, tombstones included, onto an empty device", async () => {
    const { project, rama, sita } = await seedLineage();
    await signInAndBackUp();

    // A is edited and removed, B survives.
    await peopleRepo.update(rama.id, { notes: "moved to Mysuru" });
    await peopleRepo.update(sita.id, { notes: "kept" });
    await peopleRepo.remove(sita.id);
    await engine().sync();

    // Now pretend this browser has never seen the project. Meta is kept, because
    // the whole point is that the account - not the local data - is what remains.
    await getDb().people.clear();
    await getDb().relationships.clear();
    await getDb().biodata.clear();
    await getDb().canvasStates.clear();
    await getDb().projects.clear();
    await getDb().outbox.clear();
    await getDb().syncBase.clear();
    await setCursor(ACCOUNT.accountId, 0);

    expect(await getDb().projects.get(project.id)).toBeUndefined();

    const restored = await restore();
    expect(restored).toBeGreaterThan(0);
    expect(await getDb().projects.get(project.id)).toBeTruthy();
    expect((await getDb().people.get(rama.id))?.notes).toBe("moved to Mysuru");
    // The deletion travelled too, and did not resurrect the person.
    expect(await getDb().people.get(sita.id)).toBeUndefined();
  });

  it("restores a single lineage on demand, canvas layout included", async () => {
    const { project, rama } = await seedLineage();
    await canvasRepo.setPosition(project.id, rama.id, { x: 42, y: -18 });
    await signInAndBackUp();

    await getDb().people.clear();
    await getDb().canvasStates.clear();
    await getDb().projects.clear();

    const result = await engine().restoreProject(project.id);

    expect(result.restored).toBeGreaterThan(0);
    expect(await getDb().people.get(rama.id)).toBeTruthy();
    expect((await canvasRepo.get(project.id)).nodePositions[rama.id]).toEqual({ x: 42, y: -18 });
  });

  async function restore(): Promise<number> {
    setSyncEnabled(true);
    const summary = await engine().sync();
    return summary.pulled;
  }
});

describe("keeping a lineage out of the cloud", () => {
  it("withdraws queued work when the user chooses to keep it local", async () => {
    const { project } = await seedLineage();
    await writeAccount(ACCOUNT);
    setSyncEnabled(true);
    expect(await getDb().outbox.count()).toBeGreaterThan(0);

    await engine().dropQueuedProjects([project.id]);

    expect(await getDb().outbox.count()).toBe(0);
    expect(await mirror.listAll(ACCOUNT.accountId)).toEqual([]);
  });

  it("forgets the account on sign-out without touching a single project", async () => {
    const { project, rama } = await seedLineage();
    await signInAndBackUp();

    await writeAccount(null);

    expect(await readAccount()).toBeNull();
    expect(await getDb().projects.get(project.id)).toBeTruthy();
    expect(await getDb().people.get(rama.id)).toBeTruthy();
  });
});
