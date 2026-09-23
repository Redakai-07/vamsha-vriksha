import type { Point } from "@/lib/domain/types";

import { COUPLE_GAP_X, GENERATION_GAP_Y, NODE_GAP_X, NODE_HEIGHT, NODE_WIDTH, SNAP_STEP } from "./constants";
import { padRect, rectFromPoint, rectsIntersect, type NodeRects } from "./geometry";
import type { Rect } from "./viewport";

/**
 * Where should a brand new person appear?
 *
 * New nodes are placed *relative to the person they were created from* and then
 * nudged until they hit free space, so adding a parent never lands on top of
 * an existing sibling. This is layout guidance, not kinship: the relationship
 * record is created separately and remains the source of truth.
 */

export type PlacementRelation = "parent" | "child" | "spouse" | "sibling" | "other" | "free";

export interface PlacementRequest {
  anchor: Point;
  relation: PlacementRelation;
  occupied: Rect[] | NodeRects;
  /** Preferred horizontal direction when the anchor is not centred. */
  preferRight?: boolean;
}

function toRectList(occupied: Rect[] | NodeRects): Rect[] {
  return Array.isArray(occupied) ? occupied : [...occupied.values()];
}

export function desiredOffset(relation: PlacementRelation): Point {
  switch (relation) {
    case "parent":
      return { x: 0, y: -(NODE_HEIGHT + GENERATION_GAP_Y) };
    case "child":
      return { x: 0, y: NODE_HEIGHT + GENERATION_GAP_Y };
    case "spouse":
      return { x: NODE_WIDTH + COUPLE_GAP_X, y: 0 };
    case "sibling":
    case "other":
      return { x: NODE_WIDTH + NODE_GAP_X, y: 0 };
    default:
      return { x: NODE_WIDTH + NODE_GAP_X, y: 0 };
  }
}

export function findFreeSlot(
  desired: Point,
  occupied: Rect[] | NodeRects,
  options: { margin?: number; maxRings?: number } = {},
): Point {
  const rects = toRectList(occupied);
  const margin = options.margin ?? 12;
  const maxRings = options.maxRings ?? 12;

  const overlaps = (point: Point) => {
    const candidate = padRect(rectFromPoint(point), margin);
    return rects.some((rect) => rectsIntersect(candidate, rect));
  };

  if (!overlaps(desired)) return desired;

  const stepX = NODE_WIDTH + NODE_GAP_X;
  const stepY = NODE_HEIGHT + GENERATION_GAP_Y;

  for (let ring = 1; ring <= maxRings; ring += 1) {
    // Alternate left/right so growth stays symmetric around the anchor.
    for (const direction of [1, -1]) {
      for (let level = -ring; level <= ring; level += 1) {
        const candidate: Point = {
          x: desired.x + direction * ring * stepX,
          y: desired.y + level * stepY,
        };
        if (!overlaps(candidate)) return candidate;
      }
    }
  }

  return { x: desired.x + stepX * 2, y: desired.y };
}

/** Snaps to the dot grid unless that would collide, then falls back to raw. */
export function snapIfFree(point: Point, occupied: Rect[] | NodeRects): Point {
  const snapped: Point = {
    x: Math.round(point.x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(point.y / SNAP_STEP) * SNAP_STEP,
  };
  return findFreeSlot(snapped, occupied);
}

export function suggestPosition(request: PlacementRequest): Point {
  const { anchor, relation, preferRight = true } = request;
  const offset = desiredOffset(relation);
  const signedOffset = {
    x: offset.x * (offset.x === 0 || preferRight ? 1 : -1),
    y: offset.y,
  };
  const desired = { x: anchor.x + signedOffset.x, y: anchor.y + signedOffset.y };
  return snapIfFree(desired, request.occupied);
}

/**
 * Given the person a new node will relate to, and everyone's current positions,
 * returns a free world position for the newcomer.
 */
export function placeNear(
  anchor: Point,
  relation: PlacementRelation,
  positions: Map<string, Point> | Record<string, Point> | Iterable<Point>,
): Point {
  const occupied: Rect[] = [];
  if (positions instanceof Map) {
    for (const point of positions.values()) occupied.push(rectFromPoint(point));
  } else if (Array.isArray(positions)) {
    for (const point of positions) occupied.push(rectFromPoint(point));
  } else {
    for (const point of Object.values(positions)) occupied.push(rectFromPoint(point));
  }
  return suggestPosition({ anchor, relation, occupied });
}
