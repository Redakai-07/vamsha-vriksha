import type { Id, Person, Point, Viewport } from "@/lib/domain/types";

import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import type { Rect } from "./viewport";

/** Node rectangles in world space, keyed by person id. */
export type NodeRects = Map<Id, Rect>;

export function rectFromPoint(point: Point, width = NODE_WIDTH, height = NODE_HEIGHT): Rect {
  return { x: point.x, y: point.y, width, height };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function boundsOfRects(rects: Iterable<Rect>): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const rect of rects) {
    found = true;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boundsOfPositions(positions: Iterable<Point>): Rect | null {
  return boundsOfRects(
    [...positions].map((point) => rectFromPoint(point)),
  );
}

export function padRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsOverlapWithMargin(a: Rect, b: Rect, margin = 0): boolean {
  return rectsIntersect(padRect(a, -margin), b);
}

/** Builds node rects from a position map (missing people get no rect). */
export function buildNodeRects(
  people: readonly Person[],
  positions: Record<Id, Point>,
): NodeRects {
  const rects: NodeRects = new Map();
  for (const person of people) {
    const position = positions[person.id];
    if (!position) continue;
    rects.set(person.id, rectFromPoint(position));
  }
  return rects;
}

/** Ids whose rect is at least partially visible - cheap viewport culling. */
export function visibleNodeIds(rects: NodeRects, view: Rect, slack = 240): Id[] {
  const padded = padRect(view, slack);
  const ids: Id[] = [];
  for (const [id, rect] of rects) {
    if (rectsIntersect(rect, padded)) ids.push(id);
  }
  return ids;
}

export function zoomedRect(rect: Rect, viewport: Viewport): Rect {
  return {
    x: (rect.x - viewport.x) * viewport.zoom,
    y: (rect.y - viewport.y) * viewport.zoom,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

/** Snaps a world point to the dot grid so manual placement stays tidy. */
export function snapPoint(point: Point, step: number): Point {
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  };
}
