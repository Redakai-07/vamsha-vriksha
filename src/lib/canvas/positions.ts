import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, Person, Point } from "@/lib/domain/types";

import { buildNodeRects, type NodeRects } from "./geometry";
import { getLayoutEngine } from "./layout";
import { GENERATIONS_ENGINE_ID } from "./layout/ids";
import { findFreeSlot, snapIfFree } from "./placement";

/**
 * Node positions come from the canvas state table, but that table is not always
 * complete: a person can be imported, or created by a build that had no canvas
 * row. Rather than rendering them at (0,0) on top of each other, we compute a
 * layout fallback and report which ids were missing so the caller can heal the
 * stored state.
 */
export interface ResolvedPositions {
  positions: Map<Id, Point>;
  rects: NodeRects;
  /** People whose position had to be derived (should be persisted by caller). */
  derived: Id[];
}

export function resolvePositions(
  people: readonly Person[],
  storedPositions: Record<Id, Point>,
  graph: FamilyGraph,
): ResolvedPositions {
  const positions = new Map<Id, Point>();
  const derived: Id[] = [];

  for (const person of people) {
    const stored = storedPositions[person.id];
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      positions.set(person.id, stored);
    }
  }

  const missing = people.filter((person) => !positions.has(person.id));

  if (missing.length) {
    // Lay out everything, then keep the stored positions and only adopt the
    // computed ones for people who have none - user placement always wins.
    const engine = getLayoutEngine(GENERATIONS_ENGINE_ID);
    const computed = engine.compute({ people, relationships: graph.relationships, graph });

    for (const person of missing) {
      const suggestion = computed.positions.get(person.id);
      if (suggestion) {
        positions.set(person.id, suggestion);
        derived.push(person.id);
      }
    }

    // Anything the engine could not place (should not happen) is dropped into
    // the first free slot rather than stacked on the origin.
    const stillMissing = missing.filter((person) => !positions.has(person.id));
    if (stillMissing.length) {
      const rects = buildNodeRects(
        people.filter((person) => positions.has(person.id)),
        Object.fromEntries(positions),
      );
      for (const person of stillMissing) {
        const spot = findFreeSlot({ x: 0, y: 0 }, rects);
        const snapped = snapIfFree(spot, rects);
        positions.set(person.id, snapped);
        rects.set(person.id, { x: snapped.x, y: snapped.y, width: 236, height: 92 });
        derived.push(person.id);
      }
    }
  }

  const rects = buildNodeRects(people, Object.fromEntries(positions));

  return { positions, rects, derived };
}
