import { connectedComponents } from "@/lib/domain/graph";
import type { Id, Point } from "@/lib/domain/types";
import { birthSortKey } from "@/lib/utils/date";

import {
  COMPONENT_GAP_X,
  COUPLE_GAP_X,
  GENERATION_GAP_Y,
  NODE_GAP_X,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../constants";
import type { Rect } from "../viewport";
import type { LayoutOptions, LayoutRequest, LayoutResult } from "./engine";
import { assignGenerations, type GenerationAssignment } from "./generations";

/**
 * Layered family layout.
 *
 * This is deliberately a *heuristic*, not a rigid tree layout:
 *
 *  1. rows      - generations come from `assignGenerations` (couples share a row)
 *  2. order     - within each row, units are ordered by the barycentre of their
 *                 parents, then refined bottom-up from their children; this is
 *                 the classic crossing-reduction sweep from Sugiyama-style
 *                 layered drawing, trimmed to what a family graph needs
 *  3. x         - each unit is pulled toward the average centre of its parents
 *                 but can never overlap its left neighbour
 *  4. refine    - one bottom-up pass pulls parents toward the centre of their
 *                 children when there is slack, so parents sit over their kids
 *  5. clusters  - disconnected lineages are laid out independently and packed
 *                 side by side, so an unrelated branch never collides
 *
 * Every step is deterministic, which keeps layouts stable across reloads.
 */

interface Config {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  coupleGapX: number;
  generationGapY: number;
  componentGapX: number;
}

function resolveConfig(options: LayoutOptions = {}): Config {
  return {
    nodeWidth: options.nodeWidth ?? NODE_WIDTH,
    nodeHeight: options.nodeHeight ?? NODE_HEIGHT,
    gapX: options.gapX ?? NODE_GAP_X,
    coupleGapX: options.coupleGapX ?? COUPLE_GAP_X,
    generationGapY: options.generationGapY ?? GENERATION_GAP_Y,
    componentGapX: options.componentGapX ?? COMPONENT_GAP_X,
  };
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Orders units row by row to reduce edge crossings.
 * Returns, for each generation, the left-to-right order of unit ids.
 */
function orderRows(
  rows: Map<number, string[]>,
  parentsOfUnit: Map<string, string[]>,
  childrenOfUnit: Map<string, string[]>,
  sweeps = 4,
): { order: Map<number, string[]>; indexInRow: Map<string, number> } {
  const order = new Map<number, string[]>();
  for (const [level, units] of rows) order.set(level, [...units]);
  const levels = [...order.keys()].sort((a, b) => a - b);

  const reindex = () => {
    const index = new Map<string, number>();
    for (const level of levels) {
      (order.get(level) ?? []).forEach((unit, position) => index.set(unit, position));
    }
    return index;
  };

  let indexInRow = reindex();

  const barycentre = (
    unit: string,
    neighbours: Map<string, string[]>,
    fallback: number,
  ): number => {
    const values = (neighbours.get(unit) ?? [])
      .map((neighbour) => indexInRow.get(neighbour))
      .filter((value): value is number => value !== undefined);
    const average = mean(values);
    return average === null ? fallback : average;
  };

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    // top-down: place children near their parents
    for (let i = 1; i < levels.length; i += 1) {
      const level = levels[i];
      const row = order.get(level) ?? [];
      const decorated = row.map((unit, position) => ({
        unit,
        key: barycentre(unit, parentsOfUnit, position),
        position,
      }));
      decorated.sort((a, b) => (a.key === b.key ? a.position - b.position : a.key - b.key));
      order.set(
        level,
        decorated.map((item) => item.unit),
      );
      indexInRow = reindex();
    }

    // bottom-up: place parents near their children
    for (let i = levels.length - 2; i >= 0; i -= 1) {
      const level = levels[i];
      const row = order.get(level) ?? [];
      const decorated = row.map((unit, position) => ({
        unit,
        key: barycentre(unit, childrenOfUnit, position),
        position,
      }));
      decorated.sort((a, b) => (a.key === b.key ? a.position - b.position : a.key - b.key));
      order.set(
        level,
        decorated.map((item) => item.unit),
      );
      indexInRow = reindex();
    }
  }

  return { order, indexInRow };
}

interface UnitMetrics {
  id: string;
  level: number;
  members: Id[];
  width: number;
  x: number;
}

export function computeLayeredLayout(request: LayoutRequest): LayoutResult {
  const { graph } = request;
  const config = resolveConfig(request.options);
  const positions = new Map<Id, Point>();

  if (!graph.people.length) {
    return { positions, bounds: null, generations: new Map(), componentBounds: [] };
  }

  const generation: GenerationAssignment = assignGenerations(graph);
  const peopleById = new Map(graph.people.map((person) => [person.id, person]));

  const unitOfPerson = generation.groupOf;
  const unitWidth = (members: Id[]) =>
    members.length * config.nodeWidth + Math.max(0, members.length - 1) * config.coupleGapX;
  const unitLevel = (members: Id[]) => generation.levels.get(members[0]) ?? 0;

  // ---- unit-level edges (within couples nothing changes) ----------------
  const parentsOfUnit = new Map<string, string[]>();
  const childrenOfUnit = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) {
      if (!list.includes(value)) list.push(value);
    } else map.set(key, [value]);
  };

  for (const rel of graph.relationships) {
    if (rel.type !== "parent") continue;
    const parentUnit = unitOfPerson.get(rel.fromPersonId);
    const childUnit = unitOfPerson.get(rel.toPersonId);
    if (!parentUnit || !childUnit || parentUnit === childUnit) continue;
    push(childrenOfUnit, parentUnit, childUnit);
    push(parentsOfUnit, childUnit, parentUnit);
  }

  // ---- lay out each connected lineage, then pack them side by side -------
  const components = connectedComponents(graph).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const nameA = peopleById.get(a[0])?.name ?? "";
    const nameB = peopleById.get(b[0])?.name ?? "";
    return nameA.localeCompare(nameB);
  });

  const componentRects: Rect[] = [];
  const globalPositions = new Map<Id, Point>();
  let packCursorX = 0;

  for (const component of components) {
    const unitsInComponent = new Set<string>();
    for (const personId of component) {
      const unit = unitOfPerson.get(personId);
      if (unit) unitsInComponent.add(unit);
    }

    // rows
    const rows = new Map<number, string[]>();
    for (const unit of unitsInComponent) {
      const level = unitLevel(generation.membersOf.get(unit) ?? []);
      const row = rows.get(level);
      if (row) row.push(unit);
      else rows.set(level, [unit]);
    }

    // deterministic starting order: oldest first, then by name
    const firstBirth = (unit: string) => {
      const members = generation.membersOf.get(unit) ?? [];
      const keys = members.map((id) => birthSortKey(peopleById.get(id)?.dateOfBirth ?? null, 0));
      return Math.min(...keys);
    };
    const nameOf = (unit: string) =>
      (generation.membersOf.get(unit) ?? [])
        .map((id) => peopleById.get(id)?.name ?? "")
        .sort()[0] ?? "";

    for (const [level, units] of rows) {
      rows.set(
        level,
        [...units].sort((a, b) => {
          const delta = firstBirth(a) - firstBirth(b);
          if (delta !== 0) return delta;
          return nameOf(a).localeCompare(nameOf(b));
        }),
      );
    }

    const { order } = orderRows(rows, parentsOfUnit, childrenOfUnit);
    const levels = [...order.keys()].sort((a, b) => a - b);

    const metrics = new Map<string, UnitMetrics>();
    for (const unit of unitsInComponent) {
      const members = generation.membersOf.get(unit) ?? [];
      metrics.set(unit, {
        id: unit,
        level: unitLevel(members),
        members,
        width: unitWidth(members),
        x: 0,
      });
    }

    const centerOf = (unit: string) => {
      const metric = metrics.get(unit);
      if (!metric) return null;
      return metric.x + metric.width / 2;
    };

    // ---- top-down x assignment -----------------------------------------
    for (const level of levels) {
      const row = order.get(level) ?? [];
      let cursor = 0;
      for (const unit of row) {
        const metric = metrics.get(unit);
        if (!metric) continue;
        const parentCentres = (parentsOfUnit.get(unit) ?? [])
          .map((parent) => centerOf(parent))
          .filter((value): value is number => value !== null);
        const desired = mean(parentCentres);
        const left = desired === null ? cursor : desired - metric.width / 2;
        metric.x = Math.max(left, cursor);
        cursor = metric.x + metric.width + config.gapX;
      }
    }

    // ---- bottom-up alignment pass --------------------------------------
    for (let i = levels.length - 2; i >= 0; i -= 1) {
      const row = order.get(levels[i]) ?? [];
      for (let position = 0; position < row.length; position += 1) {
        const unit = row[position];
        const metric = metrics.get(unit);
        if (!metric) continue;
        const childCentres = (childrenOfUnit.get(unit) ?? [])
          .map((child) => centerOf(child))
          .filter((value): value is number => value !== null);
        const desired = mean(childCentres);
        if (desired === null) continue;

        const leftNeighbour = position > 0 ? metrics.get(row[position - 1]) : undefined;
        const rightNeighbour =
          position < row.length - 1 ? metrics.get(row[position + 1]) : undefined;

        const minX = leftNeighbour
          ? leftNeighbour.x + leftNeighbour.width + config.gapX
          : Number.NEGATIVE_INFINITY;
        const maxX = rightNeighbour
          ? rightNeighbour.x - metric.width - config.gapX
          : Number.POSITIVE_INFINITY;

        metric.x = clamp(desired - metric.width / 2, minX, Math.max(minX, maxX));
      }
    }

    // ---- component bounds + member positions ---------------------------
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const level of levels) {
      for (const unit of order.get(level) ?? []) {
        const metric = metrics.get(unit);
        if (!metric) continue;
        const y = level * (config.nodeHeight + config.generationGapY);
        metric.members.forEach((personId, indexInUnit) => {
          const x = metric.x + indexInUnit * (config.nodeWidth + config.coupleGapX);
          globalPositions.set(personId, { x, y });
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + config.nodeWidth);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y + config.nodeHeight);
        });
      }
    }

    if (!Number.isFinite(minX)) continue;

    const componentRect: Rect = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // shift this lineage so it starts after the previously packed one
    const shiftX = packCursorX - minX;
    const shiftY = -minY;
    for (const personId of component) {
      const point = globalPositions.get(personId);
      if (!point) continue;
      globalPositions.set(personId, { x: point.x + shiftX, y: point.y + shiftY });
    }
    componentRects.push({
      x: componentRect.x + shiftX,
      y: componentRect.y + shiftY,
      width: componentRect.width,
      height: componentRect.height,
    });
    packCursorX += componentRect.width + config.componentGapX;
  }

  // ---- recentre the whole world on the origin ---------------------------
  let worldMinX = Number.POSITIVE_INFINITY;
  let worldMinY = Number.POSITIVE_INFINITY;
  let worldMaxX = Number.NEGATIVE_INFINITY;
  let worldMaxY = Number.NEGATIVE_INFINITY;
  for (const point of globalPositions.values()) {
    worldMinX = Math.min(worldMinX, point.x);
    worldMinY = Math.min(worldMinY, point.y);
    worldMaxX = Math.max(worldMaxX, point.x + config.nodeWidth);
    worldMaxY = Math.max(worldMaxY, point.y + config.nodeHeight);
  }

  const centreX = (worldMinX + worldMaxX) / 2;
  const centreY = (worldMinY + worldMaxY) / 2;
  for (const [personId, point] of globalPositions) {
    globalPositions.set(personId, { x: point.x - centreX, y: point.y - centreY });
  }

  const bounds: Rect | null = Number.isFinite(worldMinX)
    ? {
        x: worldMinX - centreX,
        y: worldMinY - centreY,
        width: worldMaxX - worldMinX,
        height: worldMaxY - worldMinY,
      }
    : null;

  return {
    positions: globalPositions,
    bounds,
    generations: generation.levels,
    componentBounds: componentRects.map((rect) => ({
      ...rect,
      x: rect.x - centreX,
      y: rect.y - centreY,
    })),
  };
}

export const generationsLayoutEngine = {
  id: "generations",
  label: "Generations",
  description: "Rows per generation, parents centred above their children.",
  compute: computeLayeredLayout,
};
