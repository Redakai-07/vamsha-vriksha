import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, Person, Point, Relationship } from "@/lib/domain/types";

import type { Rect } from "../viewport";

/**
 * The graph engine boundary.
 *
 * The UI never imports a concrete layout algorithm - it asks the registry for
 * an engine and calls `compute`. That is what keeps the canvas shell, the
 * renderer and the algorithms independently replaceable (and testable without
 * React or the DOM).
 */

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  gapX?: number;
  coupleGapX?: number;
  generationGapY?: number;
  componentGapX?: number;
}

export interface LayoutRequest {
  people: readonly Person[];
  relationships: readonly Relationship[];
  graph: FamilyGraph;
  options?: LayoutOptions;
}

export interface LayoutResult {
  /** World position of each person's NODE TOP-LEFT. */
  positions: Map<Id, Point>;
  /** Tight bounding box of all placed nodes. */
  bounds: Rect | null;
  /** Generation index per person (0 = oldest known generation). */
  generations: Map<Id, number>;
  /** Bounding box per connected component, for camera framing. */
  componentBounds: Rect[];
}

export interface LayoutEngine {
  id: string;
  label: string;
  description: string;
  compute(request: LayoutRequest): LayoutResult;
}

const registry = new Map<string, LayoutEngine>();

export function registerLayoutEngine(engine: LayoutEngine): LayoutEngine {
  registry.set(engine.id, engine);
  return engine;
}

export function getLayoutEngine(id: string): LayoutEngine {
  const engine = registry.get(id);
  if (!engine) {
    const fallback = [...registry.values()][0];
    if (!fallback) throw new Error("No layout engine registered");
    return fallback;
  }
  return engine;
}

export function listLayoutEngines(): LayoutEngine[] {
  return [...registry.values()];
}
