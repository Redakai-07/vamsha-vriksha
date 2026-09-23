import type { Id, Relationship } from "@/lib/domain/types";

import { type NodeRects } from "./geometry";
import type { Rect } from "./viewport";

/**
 * Reading aids for the canvas.
 *
 * Both helpers work from the *current* node rects rather than the layout
 * engine's generations. That distinction matters: positions are what the user
 * sees, and someone can drag a node into a different row. A band that showed
 * the computed generation would then contradict the picture in front of them.
 */

export interface RowBand {
  /** World y of the row's topmost node. */
  top: number;
  /** Distance from the row's top to its bottommost node. */
  height: number;
  left: number;
  right: number;
  /** How many nodes the row holds. */
  count: number;
}

export interface RowOptions {
  /** Node tops within this many world units count as one row. */
  tolerance?: number;
  /** Rows with fewer nodes than this are dropped (a band for one card is noise). */
  minCount?: number;
}

/**
 * Groups nodes into the rows the eye already sees.
 *
 * Nodes are clustered greedily from the top down: the first node of a cluster
 * sets its anchor, and any node within `tolerance` of that anchor joins it. The
 * anchor (rather than the running average) keeps the result stable while a node
 * is being dragged, so bands do not jitter mid-gesture.
 */
export function clusterRows(rects: Iterable<Rect>, options: RowOptions = {}): RowBand[] {
  const tolerance = options.tolerance ?? 64;
  const minCount = options.minCount ?? 2;

  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const bands: RowBand[] = [];

  let current: { anchor: number; top: number; bottom: number; left: number; right: number; count: number } | null =
    null;

  const flush = () => {
    if (!current) return;
    if (current.count >= minCount) {
      bands.push({
        top: current.top,
        height: Math.max(1, current.bottom - current.top),
        left: current.left,
        right: current.right,
        count: current.count,
      });
    }
    current = null;
  };

  for (const rect of sorted) {
    if (current && Math.abs(rect.y - current.anchor) <= tolerance) {
      current.top = Math.min(current.top, rect.y);
      current.bottom = Math.max(current.bottom, rect.y + rect.height);
      current.left = Math.min(current.left, rect.x);
      current.right = Math.max(current.right, rect.x + rect.width);
      current.count += 1;
      continue;
    }
    flush();
    current = {
      anchor: rect.y,
      top: rect.y,
      bottom: rect.y + rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      count: 1,
    };
  }
  flush();

  return bands;
}

export interface CoupleBand {
  /** The two people the band belongs to. */
  personIds: [Id, Id];
  rect: Rect;
}

/**
 * The label plate behind a couple.
 *
 * A marriage is a vertical tie between two cards; grouping them with one quiet
 * plate is what makes a row of siblings read as "these two are a pair, those
 * three are their children" without a legend.
 */
export function coupleBands(
  relationships: readonly Relationship[],
  rects: NodeRects,
  options: { paddingX?: number; paddingY?: number } = {},
): CoupleBand[] {
  const paddingX = options.paddingX ?? 12;
  const paddingY = options.paddingY ?? 8;
  const bands: CoupleBand[] = [];

  for (const relationship of relationships) {
    if (relationship.type !== "spouse") continue;
    const a = rects.get(relationship.fromPersonId);
    const b = rects.get(relationship.toPersonId);
    if (!a || !b) continue;

    const left = Math.min(a.x, b.x) - paddingX;
    const top = Math.min(a.y, b.y) - paddingY;
    const right = Math.max(a.x + a.width, b.x + b.width) + paddingX;
    const bottom = Math.max(a.y + a.height, b.y + b.height) + paddingY;

    bands.push({
      personIds: [relationship.fromPersonId, relationship.toPersonId],
      rect: { x: left, y: top, width: right - left, height: bottom - top },
    });
  }

  return bands;
}
