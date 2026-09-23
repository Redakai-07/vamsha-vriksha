import type { Id, Point } from "@/lib/domain/types";

import { NODE_HEIGHT, NODE_WIDTH } from "../constants";
import type { Rect } from "../viewport";
import type { LayoutRequest, LayoutResult } from "./engine";
import { computeLayeredLayout } from "./layered";

/**
 * Radial ("mandala") layout: one concentric ring per generation, with people
 * ordered around the ring by the position the layered layout would have given
 * them. It is a genuinely different reading of the same data - useful for wide
 * lateral families - and it exists to prove the engine is pluggable:
 * `radial` reuses nothing but the layered *ordering*, and the canvas shell does
 * not know which engine produced its positions.
 */
export function computeRadialLayout(request: LayoutRequest): LayoutResult {
  const layered = computeLayeredLayout(request);
  const { graph } = request;

  if (!graph.people.length) return layered;

  const byLevel = new Map<number, Id[]>();
  for (const person of graph.people) {
    const level = layered.generations.get(person.id) ?? 0;
    const row = byLevel.get(level);
    if (row) row.push(person.id);
    else byLevel.set(level, [person.id]);
  }

  const positions = new Map<Id, Point>();
  const ringGap = NODE_HEIGHT * 2.4;
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const minLevel = levels[0] ?? 0;

  for (const level of levels) {
    const row = [...(byLevel.get(level) ?? [])].sort((a, b) => {
      const pointA = layered.positions.get(a)?.x ?? 0;
      const pointB = layered.positions.get(b)?.x ?? 0;
      return pointA - pointB;
    });

    const radius = (level - minLevel) * ringGap;
    const count = row.length;

    if (count === 1 && radius === 0) {
      positions.set(row[0], { x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2 });
      continue;
    }

    // A full turn is only used when a ring is busy; sparse rings stay readable.
    const span = count <= 1 ? 0 : Math.min(Math.PI * 2, Math.PI * (0.6 + count * 0.22));
    const startAngle = -Math.PI / 2 - span / 2;

    row.forEach((personId, index) => {
      const angle = count <= 1 ? -Math.PI / 2 : startAngle + (span * index) / (count - 1);
      const x = Math.cos(angle) * (radius + NODE_WIDTH * 0.9) - NODE_WIDTH / 2;
      const y = Math.sin(angle) * (radius + NODE_HEIGHT) - NODE_HEIGHT / 2;
      positions.set(personId, { x, y });
    });
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of positions.values()) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x + NODE_WIDTH);
    maxY = Math.max(maxY, point.y + NODE_HEIGHT);
  }

  const bounds: Rect | null = Number.isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null;

  return {
    positions,
    bounds,
    generations: layered.generations,
    componentBounds: bounds ? [bounds] : [],
  };
}

export const radialLayoutEngine = {
  id: "radial",
  label: "Radial",
  description: "Concentric generations - good for wide, lateral families.",
  compute: computeRadialLayout,
};
