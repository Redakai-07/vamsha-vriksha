import { describe, expect, it, beforeEach } from "vitest";

import { COUPLE_GAP_X, NODE_WIDTH } from "@/lib/canvas/constants";
import { assignGenerations } from "@/lib/canvas/layout/generations";
import { computeLayeredLayout } from "@/lib/canvas/layout/layered";
import { makeGraph, makePerson, makeRelationship, resetFixtures } from "./helpers";

beforeEach(resetFixtures);

/** grandfather+grandmother -> father+mother -> me+wife -> kid */
function threeGenerationFamily() {
  const grandpa = makePerson({ name: "Grandpa", gender: "male", dateOfBirth: "1935" });
  const grandma = makePerson({ name: "Grandma", gender: "female", dateOfBirth: "1938" });
  const father = makePerson({ name: "Father", gender: "male", dateOfBirth: "1962" });
  const mother = makePerson({ name: "Mother", gender: "female", dateOfBirth: "1965" });
  const me = makePerson({ name: "Me", gender: "male", dateOfBirth: "1990" });
  const wife = makePerson({ name: "Wife", gender: "female", dateOfBirth: "1991" });
  const kid = makePerson({ name: "Kid", gender: "female", dateOfBirth: "2018" });

  const people = [grandpa, grandma, father, mother, me, wife, kid];
  const relationships = [
    makeRelationship("spouse", grandpa.id, grandma.id),
    makeRelationship("spouse", father.id, mother.id),
    makeRelationship("parent", grandpa.id, father.id),
    makeRelationship("parent", grandma.id, father.id),
    makeRelationship("parent", father.id, me.id),
    makeRelationship("parent", mother.id, me.id),
    makeRelationship("spouse", me.id, wife.id),
    makeRelationship("parent", me.id, kid.id),
    makeRelationship("parent", wife.id, kid.id),
  ];
  return { people, relationships, grandpa, grandma, father, mother, me, wife, kid };
}

describe("generation assignment", () => {
  it("puts each generation one row apart and keeps couples together", () => {
    const { people, relationships, grandpa, father, me, wife, kid } = threeGenerationFamily();
    const graph = makeGraph(people, relationships);
    const { levels } = assignGenerations(graph);

    expect(levels.get(grandpa.id)).toBe(0);
    expect(levels.get(father.id)).toBe(1);
    expect(levels.get(me.id)).toBe(2);
    expect(levels.get(kid.id)).toBe(3);
    // A spouse shares the row of their partner, never their own row.
    expect(levels.get(wife.id)).toBe(levels.get(me.id));
  });

  it("normalises the oldest known person to generation 0 even without parents", () => {
    const lonely = makePerson({ name: "Lonely", gender: "male" });
    const child = makePerson({ name: "Child", gender: "female" });
    const graph = makeGraph([lonely, child], [makeRelationship("parent", lonely.id, child.id)]);
    const { levels } = assignGenerations(graph);
    expect(levels.get(lonely.id)).toBe(0);
    expect(levels.get(child.id)).toBe(1);
  });

  it("keeps siblings on one row when their parents were never recorded", () => {
    const father = makePerson({ name: "Father", gender: "male", dateOfBirth: "1955" });
    const son = makePerson({ name: "Son", gender: "male", dateOfBirth: "1985" });
    // The sibling bond is asserted because the parents are unknown - the case
    // the "add sibling" control on the canvas exists for.
    const brother = makePerson({ name: "Brother", gender: "male", dateOfBirth: "1988" });
    const graph = makeGraph(
      [father, son, brother],
      [
        makeRelationship("parent", father.id, son.id),
        makeRelationship("sibling", son.id, brother.id),
      ],
    );
    const { levels } = assignGenerations(graph);

    expect(levels.get(son.id)).toBe(1);
    expect(levels.get(brother.id)).toBe(1);
  });

  it("carries a sibling's children down a generation with them", () => {
    const father = makePerson({ name: "Father", gender: "male" });
    const son = makePerson({ name: "Son", gender: "male" });
    const brother = makePerson({ name: "Brother", gender: "male" });
    const niece = makePerson({ name: "Niece", gender: "female" });
    const graph = makeGraph(
      [father, son, brother, niece],
      [
        makeRelationship("parent", father.id, son.id),
        makeRelationship("sibling", son.id, brother.id),
        makeRelationship("parent", brother.id, niece.id),
      ],
    );
    const { levels } = assignGenerations(graph);

    expect(levels.get(brother.id)).toBe(1);
    expect(levels.get(niece.id)).toBe(2);
  });

  it("survives a cyclic record instead of hanging", () => {
    const a = makePerson({ name: "A", gender: "male" });
    const b = makePerson({ name: "B", gender: "male" });
    const graph = makeGraph(
      [a, b],
      [makeRelationship("parent", a.id, b.id), makeRelationship("parent", b.id, a.id)],
    );
    const { levels } = assignGenerations(graph);
    expect(levels.size).toBe(2);
    expect(Number.isFinite(levels.get(a.id) as number)).toBe(true);
  });
});

describe("layered layout", () => {
  it("places children below parents and couples side by side", () => {
    const { people, relationships, father, me, wife, kid } = threeGenerationFamily();
    const request = {
      people,
      relationships,
      graph: makeGraph(people, relationships),
    };
    const { positions } = computeLayeredLayout(request);

    const fatherPos = positions.get(father.id)!;
    const mePos = positions.get(me.id)!;
    const wifePos = positions.get(wife.id)!;
    const kidPos = positions.get(kid.id)!;

    expect(mePos.y).toBeGreaterThan(fatherPos.y);
    expect(kidPos.y).toBeGreaterThan(mePos.y);
    // Spouses sit exactly one node width plus the couple gap apart.
    expect(Math.abs(wifePos.x - mePos.x)).toBeCloseTo(NODE_WIDTH + COUPLE_GAP_X, 6);
    expect(wifePos.y).toBeCloseTo(mePos.y, 6);
  });

  it("never overlaps two nodes in the same generation", () => {
    const { people, relationships } = threeGenerationFamily();
    const { positions } = computeLayeredLayout({
      people,
      relationships,
      graph: makeGraph(people, relationships),
    });

    const rows = new Map<number, number[]>();
    for (const position of positions.values()) {
      const row = rows.get(position.y);
      if (row) row.push(position.x);
      else rows.set(position.y, [position.x]);
    }

    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  });

  it("is deterministic across runs", () => {
    const { people, relationships } = threeGenerationFamily();
    const graph = makeGraph(people, relationships);
    const first = computeLayeredLayout({ people, relationships, graph });
    const second = computeLayeredLayout({ people, relationships, graph });
    for (const [id, position] of first.positions) {
      expect(second.positions.get(id)).toEqual(position);
    }
  });

  it("keeps disconnected lineages from overlapping", () => {
    const a = makePerson({ name: "Alpha", gender: "male" });
    const b = makePerson({ name: "Beta", gender: "female" });
    const c = makePerson({ name: "Gamma", gender: "male" });
    const d = makePerson({ name: "Delta", gender: "female" });
    const people = [a, b, c, d];
    const relationships = [
      makeRelationship("parent", a.id, b.id),
      makeRelationship("parent", c.id, d.id),
    ];
    const { positions, componentBounds } = computeLayeredLayout({
      people,
      relationships,
      graph: makeGraph(people, relationships),
    });

    expect(componentBounds).toHaveLength(2);
    const first = componentBounds[0];
    const second = componentBounds[1];
    const overlaps =
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;
    expect(overlaps).toBe(false);
    expect(positions.size).toBe(4);
  });

  it("centres the world on the origin", () => {
    const { people, relationships } = threeGenerationFamily();
    const { bounds } = computeLayeredLayout({
      people,
      relationships,
      graph: makeGraph(people, relationships),
    });
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width / 2).toBeCloseTo(0, 6);
    expect(bounds!.y + bounds!.height / 2).toBeCloseTo(0, 6);
  });
});
