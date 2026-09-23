import { describe, expect, it } from "vitest";

import {
  canonicalPair,
  createRelationship,
  relationshipKeyOf,
  validateNewRelationship,
} from "@/lib/domain/relationship";

import { makeRelationship } from "./helpers";

describe("relationship records", () => {
  it("stores spouse bonds with canonically ordered endpoints", () => {
    const forward = createRelationship(
      { projectId: "p", type: "spouse", fromPersonId: "z", toPersonId: "a" },
      "r1",
    );
    const backward = createRelationship(
      { projectId: "p", type: "spouse", fromPersonId: "a", toPersonId: "z" },
      "r2",
    );
    expect(forward.fromPersonId).toBe("a");
    expect(forward.toPersonId).toBe("z");
    expect(relationshipKeyOf(forward)).toBe(relationshipKeyOf(backward));
  });

  it("keeps parent bonds directional", () => {
    const rel = createRelationship(
      { projectId: "p", type: "parent", fromPersonId: "child", toPersonId: "parent" },
      "r1",
    );
    expect(rel.fromPersonId).toBe("child");
    expect(rel.toPersonId).toBe("parent");
  });

  it("defaults spouse status and custom labels", () => {
    const spouse = createRelationship(
      { projectId: "p", type: "spouse", fromPersonId: "a", toPersonId: "b" },
      "r1",
    );
    expect(spouse.status).toBe("married");
    const other = createRelationship(
      { projectId: "p", type: "other", fromPersonId: "a", toPersonId: "b", label: "  Guru " },
      "r2",
    );
    expect(other.label).toBe("Guru");
  });

  it("rejects self relationships", () => {
    const result = validateNewRelationship(
      { type: "parent", fromPersonId: "a", toPersonId: "a" },
      [],
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicates regardless of direction", () => {
    const existing = [makeRelationship("spouse", "a", "b")];
    expect(
      validateNewRelationship({ type: "spouse", fromPersonId: "b", toPersonId: "a" }, existing).ok,
    ).toBe(false);
    expect(
      validateNewRelationship({ type: "spouse", fromPersonId: "a", toPersonId: "b" }, existing).ok,
    ).toBe(false);
  });

  it("keeps distinct custom bonds with the same endpoints", () => {
    const existing = [makeRelationship("other", "a", "b", { label: "Guru" })];
    expect(
      validateNewRelationship(
        { type: "other", fromPersonId: "a", toPersonId: "b", label: "Godparent" },
        existing,
      ).ok,
    ).toBe(true);
    expect(
      validateNewRelationship(
        { type: "other", fromPersonId: "a", toPersonId: "b", label: "guru" },
        existing,
      ).ok,
    ).toBe(false);
  });

  it("refuses to create a loop in the lineage", () => {
    const existing = [
      makeRelationship("parent", "grandparent", "parent"),
      makeRelationship("parent", "parent", "child"),
    ];
    const result = validateNewRelationship(
      { type: "parent", fromPersonId: "child", toPersonId: "grandparent" },
      existing,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/loop/i);
  });

  it("allows a grandparent link that does not close a loop", () => {
    const existing = [makeRelationship("parent", "a", "b")];
    expect(
      validateNewRelationship({ type: "parent", fromPersonId: "b", toPersonId: "c" }, existing).ok,
    ).toBe(true);
  });

  it("flags a spouse bond between an existing parent and child", () => {
    const existing = [makeRelationship("parent", "a", "b")];
    const result = validateNewRelationship(
      { type: "spouse", fromPersonId: "a", toPersonId: "b" },
      existing,
    );
    expect(result.ok).toBe(false);
  });

  it("orders canonical pairs consistently", () => {
    expect(canonicalPair("b", "a")).toEqual({ from: "a", to: "b" });
    expect(canonicalPair("a", "b")).toEqual({ from: "a", to: "b" });
  });
});
