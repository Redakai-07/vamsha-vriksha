import { describe, expect, it } from "vitest";

import { mergeRecords, type MergeInput } from "@/lib/sync/merge";
import type { SyncCollection } from "@/lib/sync/types";

const A = { updatedAt: "2026-05-01T10:00:00.000Z", origin: "device-a" };
const B = { updatedAt: "2026-05-01T11:00:00.000Z", origin: "device-b" };

function merge(partial: Partial<MergeInput> & { collection?: SyncCollection }): ReturnType<typeof mergeRecords> {
  return mergeRecords({
    collection: partial.collection ?? "people",
    base: partial.base ?? null,
    ours: partial.ours ?? {},
    theirs: partial.theirs ?? {},
    ourStamp: partial.ourStamp ?? A,
    theirStamp: partial.theirStamp ?? B,
    ourDeletedAt: partial.ourDeletedAt ?? null,
    theirDeletedAt: partial.theirDeletedAt ?? null,
  });
}

describe("three-way merge", () => {
  it("takes each side's change when they touched different fields", () => {
    const outcome = merge({
      base: { name: "Rama", notes: "" },
      ours: { name: "Rama", notes: "farmer" },
      theirs: { name: "Rama Kumar", notes: "" },
    });

    // Neither device overwrote the other's work, so there is nothing to
    // reconcile and nothing to report.
    expect(outcome.payload).toMatchObject({ name: "Rama Kumar", notes: "farmer" });
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.pushBack).toBe(true);
  });

  it("gives a field both devices changed to the later edit, and preserves the other", () => {
    const outcome = merge({
      base: { name: "Rama" },
      ours: { name: "Rama Rao" },
      theirs: { name: "Rama Kumar" },
    });

    expect(outcome.payload.name).toBe("Rama Kumar");
    expect(outcome.conflicts).toEqual([
      {
        field: "name",
        appliedValue: "Rama Kumar",
        appliedFrom: "cloud",
        preservedValue: "Rama Rao",
      },
    ]);
  });

  it("is order independent: the same two edits give the same winner either way", () => {
    const ours = merge({ base: { name: "Rama" }, ours: { name: "Rama Rao" }, theirs: { name: "Rama Kumar" } });
    const flipped = merge({
      base: { name: "Rama" },
      ours: { name: "Rama Kumar" },
      theirs: { name: "Rama Rao" },
      ourStamp: B,
      theirStamp: A,
    });
    expect(ours.payload.name).toBe(flipped.payload.name);
  });

  it("falls back to the device id when both edits share a timestamp", () => {
    const sameTime = { updatedAt: "2026-05-01T10:00:00.000Z", origin: "device-a" };
    const outcome = merge({
      base: { name: "x" },
      ours: { name: "from-a" },
      theirs: { name: "from-b" },
      ourStamp: sameTime,
      theirStamp: { updatedAt: "2026-05-01T10:00:00.000Z", origin: "device-b" },
    });
    expect(outcome.payload.name).toBe("from-b");
  });

  it("unions canvas positions so two devices moving different people both keep them", () => {
    const outcome = merge({
      collection: "canvasStates",
      base: { nodePositions: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } },
      ours: { nodePositions: { p1: { x: 40, y: 0 }, p2: { x: 0, y: 0 } } },
      theirs: { nodePositions: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 90 } } },
    });

    expect(outcome.payload.nodePositions).toEqual({ p1: { x: 40, y: 0 }, p2: { x: 0, y: 90 } });
    expect(outcome.conflicts).toEqual([]);
  });

  it("keeps the only side that actually changed a shared canvas key", () => {
    const outcome = merge({
      collection: "canvasStates",
      base: { nodePositions: { p1: { x: 0, y: 0 } } },
      ours: { nodePositions: { p1: { x: 40, y: 0 } } },
      theirs: { nodePositions: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 90 } } },
    });

    // Device B stamped its record later, but it never touched p1 - so p1 stays
    // where this device put it.
    expect(outcome.payload.nodePositions).toEqual({
      p1: { x: 40, y: 0 },
      p2: { x: 0, y: 90 },
    });
    expect(outcome.conflicts).toEqual([]);
  });

  it("lets a removed pinned person stay removed when the other side left them alone", () => {
    const outcome = merge({
      collection: "canvasStates",
      base: { pinnedPersonIds: ["p1", "p2"] },
      ours: { pinnedPersonIds: ["p2"] },
      theirs: { pinnedPersonIds: ["p1", "p2"] },
    });

    expect(outcome.payload.pinnedPersonIds).toEqual(["p2"]);
    expect(outcome.conflicts).toEqual([]);
  });

  it("keeps extra biodata fields added on both devices", () => {
    const outcome = merge({
      collection: "biodata",
      base: { customFields: [] },
      ours: { customFields: [{ id: "f1", label: "Gotra", value: "Kashyap" }] },
      theirs: { customFields: [{ id: "f2", label: "House", value: "Heggade" }] },
    });

    expect(outcome.payload.customFields).toEqual([
      { id: "f1", label: "Gotra", value: "Kashyap" },
      { id: "f2", label: "House", value: "Heggade" },
    ]);
    expect(outcome.conflicts).toEqual([]);
  });

  it("reports a per-entry clash when both devices edited the same biodata field", () => {
    const clash = merge({
      collection: "biodata",
      base: { customFields: [{ id: "f1", label: "Gotra", value: "old" }] },
      ours: { customFields: [{ id: "f1", label: "Gotra", value: "Kashyap" }] },
      theirs: { customFields: [{ id: "f1", label: "Gotra", value: "Bharadwaj" }] },
    });
    expect(clash.conflicts[0].field).toBe("customFields.f1");
    expect(clash.payload.customFields).toEqual([{ id: "f1", label: "Gotra", value: "Bharadwaj" }]);
  });

  it("never lets a tombstone destroy a concurrent edit", () => {
    const outcome = merge({
      base: { name: "Rama", notes: "head of family" },
      ours: { name: "Rama", notes: "head of family, farmer" },
      theirs: {},
      ourStamp: A,
      theirStamp: B,
      theirDeletedAt: "2026-05-01T11:00:00.000Z",
    });

    expect(outcome.deletedAt).toBeNull();
    expect(outcome.payload.notes).toBe("head of family, farmer");
    // The surviving copy is pushed back so the other device sees it too.
    expect(outcome.pushBack).toBe(true);
  });

  it("accepts a remote delete when this device changed nothing", () => {
    const outcome = merge({
      base: { name: "Rama" },
      ours: { name: "Rama" },
      theirs: { name: "Rama" },
      theirDeletedAt: "2026-05-01T11:00:00.000Z",
    });

    expect(outcome.deletedAt).toBe("2026-05-01T11:00:00.000Z");
    expect(outcome.changed).toBe(true);
    expect(outcome.pushBack).toBe(false);
  });

  it("keeps local content when this device deleted and the cloud edited", () => {
    const outcome = merge({
      base: { name: "Rama" },
      ours: { name: "Rama" },
      theirs: { name: "Rama Kumar" },
      ourDeletedAt: "2026-05-01T10:30:00.000Z",
    });

    expect(outcome.deletedAt).toBeNull();
    expect(outcome.payload.name).toBe("Rama Kumar");
    expect(outcome.pushBack).toBe(true);
  });

  it("records a conflict but keeps both values when there is no common ancestor", () => {
    const outcome = merge({ base: null, ours: { name: "A" }, theirs: { name: "B" } });

    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0].preservedValue).toBe("A");
    expect(outcome.payload.name).toBe("B");
  });
});
