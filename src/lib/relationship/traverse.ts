import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id } from "@/lib/domain/types";

import { normalizePath, type NormalizedPath } from "./normalize";
import { directStep, neighboursOf } from "./primitives";
import type { RelationshipPath } from "./types";

/**
 * Graph traversal.
 *
 * The family graph is a graph, not a tree: people marry across families, so
 * every walk needs visited-node protection, a depth limit and a cycle guard.
 *
 *  - `findPath`       breadth-first shortest path (deterministic tie-breaking).
 *  - `findPaths`      several distinct simple paths, shortest first, so the UI
 *                     can show that two people are related more than one way.
 *  - `reversePath`    the same chain read the other way, for the reverse
 *                     sentence of an explanation.
 */

export const DEFAULT_MAX_DEPTH = 8;

interface QueueEntry {
  personId: Id;
  tokens: string[];
  personIds: Id[];
}

export interface RawPath {
  personIds: Id[];
  tokens: string[];
}

/** Breadth-first shortest path over primitive facts. */
export function findRawPath(
  graph: FamilyGraph,
  fromId: Id,
  toId: Id,
  maxDepth = DEFAULT_MAX_DEPTH,
): RawPath | null {
  if (!graph.peopleById.has(fromId) || !graph.peopleById.has(toId)) return null;
  if (fromId === toId) return { personIds: [fromId], tokens: [] };

  const visited = new Set<Id>([fromId]);
  let frontier: QueueEntry[] = [{ personId: fromId, tokens: [], personIds: [fromId] }];

  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const next: QueueEntry[] = [];
    for (const current of frontier) {
      for (const neighbour of neighboursOf(graph, current.personId)) {
        if (visited.has(neighbour.personId)) continue;
        const entry: QueueEntry = {
          personId: neighbour.personId,
          tokens: [...current.tokens, neighbour.token],
          personIds: [...current.personIds, neighbour.personId],
        };
        if (neighbour.personId === toId) return { personIds: entry.personIds, tokens: entry.tokens };
        visited.add(neighbour.personId);
        next.push(entry);
      }
    }
    frontier = next;
  }

  return null;
}

/**
 * Up to `limit` distinct simple paths, shortest first. A depth-first search
 * with a visited set and a depth cap is enough for family-sized graphs and
 * keeps every returned path explainable (no repeated people).
 */
export function findRawPaths(
  graph: FamilyGraph,
  fromId: Id,
  toId: Id,
  options: { maxDepth?: number; limit?: number } = {},
): RawPath[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const limit = options.limit ?? 3;
  if (!graph.peopleById.has(fromId) || !graph.peopleById.has(toId)) return [];
  if (fromId === toId) return [{ personIds: [fromId], tokens: [] }];

  const results: RawPath[] = [];
  const visited = new Set<Id>([fromId]);
  const personIds: Id[] = [fromId];
  const tokens: string[] = [];

  const walk = (current: Id) => {
    if (results.length >= limit || tokens.length >= maxDepth) return;
    for (const neighbour of neighboursOf(graph, current)) {
      if (visited.has(neighbour.personId)) continue;
      visited.add(neighbour.personId);
      personIds.push(neighbour.personId);
      tokens.push(neighbour.token);
      if (neighbour.personId === toId) {
        results.push({ personIds: [...personIds], tokens: [...tokens] });
      } else {
        walk(neighbour.personId);
      }
      visited.delete(neighbour.personId);
      personIds.pop();
      tokens.pop();
      if (results.length >= limit) return;
    }
  };

  walk(fromId);
  return results.sort((a, b) => a.tokens.length - b.tokens.length);
}

/** Wraps a raw walk into the normalized, auditable path the UI renders. */
export function toRelationshipPath(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  raw: RawPath,
): RelationshipPath {
  const normalized = normalizePath(graph, raw.personIds, raw.tokens);
  return buildRelationshipPath(graph, sourcePersonId, targetPersonId, normalized);
}

export function buildRelationshipPath(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  normalized: NormalizedPath,
): RelationshipPath {
  const edgeIds: Id[] = [];
  const derivedSiblingPairs: RelationshipPath["derivedSiblingPairs"] = [];

  for (const step of normalized.steps) {
    if (step.relationshipId && !edgeIds.includes(step.relationshipId)) edgeIds.push(step.relationshipId);
    if (step.kind === "SIBLING_OF" && step.origin === "derived" && step.viaPersonId) {
      derivedSiblingPairs.push({
        siblingId: step.fromPersonId,
        otherId: step.toPersonId,
        viaPersonId: step.viaPersonId,
      });
      // Highlight the shared parent's rows: they are the evidence for the link.
      for (const siblingId of [step.fromPersonId, step.toPersonId]) {
        const row = (graph.relationshipsByPerson.get(step.viaPersonId) ?? []).find(
          (rel) =>
            rel.type === "parent" &&
            rel.fromPersonId === step.viaPersonId &&
            rel.toPersonId === siblingId,
        );
        if (row && !edgeIds.includes(row.id)) edgeIds.push(row.id);
      }
    }
  }

  return {
    sourcePersonId,
    targetPersonId,
    personIds: normalized.personIds,
    steps: normalized.steps,
    tokens: normalized.tokens,
    rawTokens: normalized.rawTokens,
    rawPersonIds: normalized.rawPersonIds,
    edgeIds,
    derivedSiblingPairs,
  };
}

/**
 * Reads a path backwards ("A is B's ..." when the walk was B -> A). The reverse
 * tokens are re-derived from the raw facts, so no inverse of a collapsed hop is
 * ever guessed.
 */
export function reverseRawPath(graph: FamilyGraph, raw: RawPath): RawPath {
  const personIds = [...raw.personIds].reverse();
  const tokens: string[] = [];
  for (let i = 0; i < personIds.length - 1; i += 1) {
    const step = directStep(graph, personIds[i], personIds[i + 1]);
    tokens.push(step?.token ?? raw.tokens[raw.tokens.length - 1 - i] ?? "b");
  }
  return { personIds, tokens };
}
