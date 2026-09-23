import { beforeEach, describe, expect, it } from "vitest";

import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/canvas/constants";
import { buildRenderEdges } from "@/lib/canvas/edges";
import type { NodeRects } from "@/lib/canvas/geometry";
import type { Rect } from "@/lib/canvas/viewport";
import { makeRelationship, resetFixtures } from "./helpers";

beforeEach(resetFixtures);

function rect(x: number, y: number): Rect {
  return { x, y, width: NODE_WIDTH, height: NODE_HEIGHT };
}

/** A couple side by side above a child. */
function coupleAboveChild(): NodeRects {
  return new Map([
    ["father", rect(0, 0)],
    ["mother", rect(NODE_WIDTH + 30, 0)],
    ["child", rect((NODE_WIDTH + 30) / 2, NODE_HEIGHT + 240)],
  ]);
}

describe("edge building", () => {
  it("merges a married couple's parent rows into one trunk", () => {
    const rects = coupleAboveChild();
    const relationships = [
      makeRelationship("spouse", "father", "mother"),
      makeRelationship("parent", "father", "child"),
      makeRelationship("parent", "mother", "child"),
    ];

    const edges = buildRenderEdges({ relationships, rects });
    const trunks = edges.filter((edge) => edge.type === "parent" && edge.personIds.length === 3);

    expect(trunks).toHaveLength(1);
    expect(trunks[0].id).toBe("trunk:child:father+mother");
    expect(trunks[0].relationshipIds).toHaveLength(2);
    // The individual parent rows are not drawn a second time.
    expect(edges).toHaveLength(2); // the trunk plus the marriage tie
    expect(edges.some((edge) => edge.id === "trunk:child:father+mother")).toBe(true);

    // The trunk leaves the couple's shared middle (the centre of their combined
    // span), which is why the child - centred under them - gets one straight
    // line instead of two crossing curves.
    expect(trunks[0].geometry.d).toContain("M 251 92 ");
    expect(trunks[0].personIds).toEqual(["father", "mother", "child"]);
  });

  it("keeps two unmarried parents as two lines", () => {
    const rects = coupleAboveChild();
    const edges = buildRenderEdges({
      relationships: [
        makeRelationship("parent", "father", "child"),
        makeRelationship("parent", "mother", "child"),
      ],
      rects,
    });

    expect(edges).toHaveLength(2);
    expect(edges.every((edge) => edge.personIds.length === 2)).toBe(true);
  });

  it("leaves a single parent's line alone", () => {
    const rects = coupleAboveChild();
    const edges = buildRenderEdges({
      relationships: [makeRelationship("parent", "father", "child")],
      rects,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].personIds).toEqual(["father", "child"]);
    expect(edges[0].relationshipIds).toHaveLength(1);
  });

  it("skips rows whose endpoints are not on the canvas", () => {
    const rects: NodeRects = new Map([["child", rect(0, 0)]]);
    const edges = buildRenderEdges({
      relationships: [
        makeRelationship("parent", "ghost", "child"),
        makeRelationship("spouse", "child", "ghost"),
      ],
      rects,
    });
    expect(edges).toHaveLength(0);
  });

  it("carries a label for named bonds and past marriages", () => {
    const rects = coupleAboveChild();
    const edges = buildRenderEdges({
      relationships: [
        makeRelationship("other", "father", "child", { label: "Guru" }),
        makeRelationship("spouse", "father", "mother", { status: "divorced" }),
      ],
      rects,
    });

    expect(edges.find((edge) => edge.type === "other")?.label).toBe("Guru");
    expect(edges.find((edge) => edge.type === "spouse")?.label).toBe("divorced");
  });

  it("carries the implied flag through to the render edge", () => {
    const relationship = makeRelationship("sibling", "father", "mother");
    const edges = buildRenderEdges({
      relationships: [relationship],
      rects: coupleAboveChild(),
      impliedRelationshipIds: new Set([relationship.id]),
    });
    expect(edges[0].implied).toBe(true);
  });

  it("is deterministic", () => {
    const rects = coupleAboveChild();
    const relationships = [
      makeRelationship("spouse", "father", "mother"),
      makeRelationship("parent", "mother", "child"),
      makeRelationship("parent", "father", "child"),
    ];
    const first = buildRenderEdges({ relationships, rects }).map((edge) => edge.id);
    const second = buildRenderEdges({ relationships: [...relationships].reverse(), rects }).map(
      (edge) => edge.id,
    );
    expect(first).toEqual(second);
  });
});
