import type { RelationshipType } from "@/lib/domain/types";

import type { Rect } from "./viewport";

/**
 * Edge routing.
 *
 * Each bond type gets a distinct, restrained visual language so the graph is
 * readable without a legend:
 *
 *   parent  - vertical cubic from the parent's foot to the child's crown
 *   spouse  - short horizontal tie between facing sides, on the couple's midline
 *   sibling - shallow arc between facing sides (dotted when parents are known,
 *             because then the bond is already implied by the tree)
 *   other   - dashed curve between centres
 *
 * The functions only produce geometry (`d` attributes and label anchors); they
 * never touch React or the DOM.
 */

export interface EdgeGeometry {
  /** SVG path data. */
  d: string;
  /** Where a relationship label or marker should sit. */
  mid: { x: number; y: number };
  /** Tangent direction at the midpoint, for orienting labels. */
  horizontal: boolean;
}

export interface EdgeRoutingOptions {
  /** Vertical control-point strength for parent edges. */
  tension?: number;
  /** Extra arc depth for sibling edges. */
  arcDepth?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function bottomCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
}

export function topCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y };
}

export function leftCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x, y: rect.y + rect.height / 2 };
}

export function rightCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

export function rectCenterPoint(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Parent -> child. Control points are vertical so lineages read as clean
 * trunks even when a child sits far to the side of its parent.
 */
export function parentEdge(parent: Rect, child: Rect, options: EdgeRoutingOptions = {}): EdgeGeometry {
  const tension = options.tension ?? 0.42;
  const from = bottomCenter(parent);
  const to = topCenter(child);

  // If the child is (manually) placed above the parent, route from the crown.
  if (to.y < from.y) {
    const start = topCenter(parent);
    const end = bottomCenter(child);
    const dy = Math.max(18, Math.abs(end.y - start.y) * tension);
    return {
      d: `M ${round(start.x)} ${round(start.y)} C ${round(start.x)} ${round(start.y - dy)} ${round(end.x)} ${round(end.y + dy)} ${round(end.x)} ${round(end.y)}`,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      horizontal: false,
    };
  }

  const dy = Math.max(18, Math.abs(to.y - from.y) * tension);
  return {
    d: `M ${round(from.x)} ${round(from.y)} C ${round(from.x)} ${round(from.y + dy)} ${round(to.x)} ${round(to.y - dy)} ${round(to.x)} ${round(to.y)}`,
    mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    horizontal: false,
  };
}

/** Spouse tie. Chooses a horizontal or vertical orientation from geometry. */
export function spouseEdge(a: Rect, b: Rect): EdgeGeometry {
  const centreA = rectCenterPoint(a);
  const centreB = rectCenterPoint(b);
  const horizontalDominant = Math.abs(centreB.x - centreA.x) >= Math.abs(centreB.y - centreA.y);

  if (horizontalDominant) {
    const [left, right] = centreA.x <= centreB.x ? [a, b] : [b, a];
    const from = rightCenter(left);
    const to = leftCenter(right);
    const midY = (from.y + to.y) / 2;
    return {
      d: `M ${round(from.x)} ${round(from.y)} L ${round(to.x)} ${round(midY)}`,
      mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      horizontal: true,
    };
  }

  const [top, bottom] = centreA.y <= centreB.y ? [a, b] : [b, a];
  const from = bottomCenter(top);
  const to = topCenter(bottom);
  return {
    d: `M ${round(from.x)} ${round(from.y)} L ${round(from.x)} ${round(to.y)}`,
    mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    horizontal: false,
  };
}

/** Sibling arc: a shallow, symmetric bow between the two facing sides. */
export function siblingEdge(a: Rect, b: Rect, options: EdgeRoutingOptions = {}): EdgeGeometry {
  const arcDepth = options.arcDepth ?? 22;
  const centreA = rectCenterPoint(a);
  const centreB = rectCenterPoint(b);
  const horizontalDominant = Math.abs(centreB.x - centreA.x) >= Math.abs(centreB.y - centreA.y);

  if (horizontalDominant) {
    const [left, right] = centreA.x <= centreB.x ? [a, b] : [b, a];
    const from = rightCenter(left);
    const to = leftCenter(right);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + arcDepth;
    return {
      d: `M ${round(from.x)} ${round(from.y)} Q ${round(midX)} ${round(midY)} ${round(to.x)} ${round(to.y)}`,
      mid: { x: midX, y: (from.y + midY) / 2 },
      horizontal: true,
    };
  }

  const [top, bottom] = centreA.y <= centreB.y ? [a, b] : [b, a];
  const from = bottomCenter(top);
  const to = topCenter(bottom);
  const midX = (from.x + to.x) / 2 + arcDepth;
  const midY = (from.y + to.y) / 2;
  return {
    d: `M ${round(from.x)} ${round(from.y)} Q ${round(midX)} ${round(midY)} ${round(to.x)} ${round(to.y)}`,
    mid: { x: (from.x + midX) / 2, y: midY },
    horizontal: false,
  };
}

/** Custom ("other") bonds: a gentle curve between node centres. */
export function otherEdge(a: Rect, b: Rect): EdgeGeometry {
  const centreA = rectCenterPoint(a);
  const centreB = rectCenterPoint(b);
  const dx = centreB.x - centreA.x;
  const dy = centreB.y - centreA.y;
  const distance = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, distance * 0.18);
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const mid = {
    x: (centreA.x + centreB.x) / 2 + normalX * bow,
    y: (centreA.y + centreB.y) / 2 + normalY * bow,
  };
  return {
    d: `M ${round(centreA.x)} ${round(centreA.y)} Q ${round(mid.x)} ${round(mid.y)} ${round(centreB.x)} ${round(centreB.y)}`,
    mid,
    horizontal: Math.abs(dx) >= Math.abs(dy),
  };
}

export function edgeGeometry(
  type: RelationshipType,
  from: Rect,
  to: Rect,
  options: EdgeRoutingOptions = {},
): EdgeGeometry {
  switch (type) {
    case "parent":
      return parentEdge(from, to, options);
    case "spouse":
      return spouseEdge(from, to);
    case "sibling":
      return siblingEdge(from, to, options);
    default:
      return otherEdge(from, to);
  }
}
