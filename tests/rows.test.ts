import { beforeEach, describe, expect, it } from "vitest";

import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/canvas/constants";
import type { NodeRects } from "@/lib/canvas/geometry";
import { coupleBands, clusterRows } from "@/lib/canvas/rows";
import type { Rect } from "@/lib/canvas/viewport";
import { makeRelationship, resetFixtures } from "./helpers";

beforeEach(resetFixtures);

function rect(x: number, y: number): Rect {
  return { x, y, width: NODE_WIDTH, height: NODE_HEIGHT };
}

describe("row bands", () => {
  it("treats nodes at the same height as one row", () => {
    const bands = clusterRows([rect(0, 0), rect(300, 4), rect(-300, -6)], { tolerance: 64 });
    expect(bands).toHaveLength(1);
    expect(bands[0].count).toBe(3);
    expect(bands[0].left).toBe(-300);
    expect(bands[0].right).toBe(300 + NODE_WIDTH);
    expect(bands[0].top).toBe(-6);
    // Spans the highest top (-6) to the lowest foot (4 + node height).
    expect(bands[0].height).toBe(NODE_HEIGHT + 10);
  });

  it("separates generations that are a layout gap apart", () => {
    const bands = clusterRows([rect(0, 0), rect(0, 320), rect(240, 330)], { tolerance: 64 });
    // The lone node is dropped (minCount default 2), leaving the pair.
    expect(bands).toHaveLength(1);
    expect(bands[0].count).toBe(2);
    expect(bands[0].top).toBe(320);
  });

  it("keeps lone nodes when asked", () => {
    const bands = clusterRows([rect(0, 0), rect(0, 320)], { tolerance: 64, minCount: 1 });
    expect(bands).toHaveLength(2);
    expect(bands.every((band) => band.count === 1)).toBe(true);
  });

  it("follows dragged positions instead of a computed generation", () => {
    // Same people, one of them dragged far below its siblings.
    const bands = clusterRows([rect(0, 0), rect(300, 700)], { tolerance: 64, minCount: 1 });
    expect(bands).toHaveLength(2);
    expect(bands[0].top).toBe(0);
    expect(bands[1].top).toBe(700);
  });
});

describe("couple bands", () => {
  it("wraps both spouses with a little breathing room", () => {
    const rects: NodeRects = new Map([
      ["a", rect(0, 0)],
      ["b", rect(NODE_WIDTH + 30, 0)],
    ]);
    const bands = coupleBands([makeRelationship("spouse", "a", "b")], rects);

    expect(bands).toHaveLength(1);
    expect(bands[0].rect.x).toBe(-12);
    expect(bands[0].rect.y).toBe(-8);
    expect(bands[0].rect.width).toBe(NODE_WIDTH * 2 + 30 + 24);
    expect(bands[0].rect.height).toBe(NODE_HEIGHT + 16);
  });

  it("ignores bonds that are not marriages, and missing positions", () => {
    const rects: NodeRects = new Map([
      ["a", rect(0, 0)],
      ["b", rect(300, 0)],
    ]);
    expect(coupleBands([makeRelationship("parent", "a", "b")], rects)).toHaveLength(0);
    expect(coupleBands([makeRelationship("spouse", "a", "gone")], rects)).toHaveLength(0);
  });
});
