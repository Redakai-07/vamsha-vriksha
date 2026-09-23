import type { Id, Person, Relationship } from "@/lib/domain/types";
import { birthSortKey, dateSortKey } from "@/lib/utils/date";

/**
 * The family graph is a *derived* structure. It is rebuilt from the stored
 * people + relationships rows whenever either changes, and it is never
 * persisted. This is the single place where kinship is interpreted, so the
 * canvas, the panels, the kinship finder and the exporter all agree.
 */
export interface FamilyGraph {
  people: Person[];
  relationships: Relationship[];
  peopleById: Map<Id, Person>;
  parentsOf: Map<Id, Id[]>;
  childrenOf: Map<Id, Id[]>;
  spousesOf: Map<Id, Id[]>;
  /** Explicit sibling bonds, plus siblings derived from shared parents. */
  siblingsOf: Map<Id, Id[]>;
  /** True when a bond between the two people exists explicitly. */
  explicitSiblingPairs: Set<string>;
  degree: Map<Id, number>;
  /** Relationships indexed per person (both directions). */
  relationshipsByPerson: Map<Id, Relationship[]>;
}

export function emptyGraph(): FamilyGraph {
  return {
    people: [],
    relationships: [],
    peopleById: new Map(),
    parentsOf: new Map(),
    childrenOf: new Map(),
    spousesOf: new Map(),
    siblingsOf: new Map(),
    explicitSiblingPairs: new Set(),
    degree: new Map(),
    relationshipsByPerson: new Map(),
  };
}

function push<T>(map: Map<Id, T[]>, key: Id, value: T) {
  const list = map.get(key);
  if (list) {
    if (!list.includes(value)) list.push(value);
  } else {
    map.set(key, [value]);
  }
}

export function buildFamilyGraph(
  people: readonly Person[],
  relationships: readonly Relationship[],
): FamilyGraph {
  const graph: FamilyGraph = {
    people: [...people],
    relationships: [...relationships],
    peopleById: new Map(),
    parentsOf: new Map(),
    childrenOf: new Map(),
    spousesOf: new Map(),
    siblingsOf: new Map(),
    explicitSiblingPairs: new Set(),
    degree: new Map(),
    relationshipsByPerson: new Map(),
  };

  for (const person of people) graph.peopleById.set(person.id, person);

  const isKnown = (id: Id) => graph.peopleById.has(id);

  for (const rel of relationships) {
    // Ignore half-written rows pointing at people that no longer exist.
    if (!isKnown(rel.fromPersonId) || !isKnown(rel.toPersonId)) continue;

    push(graph.relationshipsByPerson, rel.fromPersonId, rel);
    push(graph.relationshipsByPerson, rel.toPersonId, rel);

    switch (rel.type) {
      case "parent":
        push(graph.childrenOf, rel.fromPersonId, rel.toPersonId);
        push(graph.parentsOf, rel.toPersonId, rel.fromPersonId);
        break;
      case "spouse":
        push(graph.spousesOf, rel.fromPersonId, rel.toPersonId);
        push(graph.spousesOf, rel.toPersonId, rel.fromPersonId);
        break;
      case "sibling": {
        push(graph.siblingsOf, rel.fromPersonId, rel.toPersonId);
        push(graph.siblingsOf, rel.toPersonId, rel.fromPersonId);
        const [a, b] = [rel.fromPersonId, rel.toPersonId].sort();
        graph.explicitSiblingPairs.add(`${a}|${b}`);
        break;
      }
      default:
        break;
    }
  }

  // Derive siblings from shared parents (the common case for documented trees).
  for (const [personId, parentIds] of graph.parentsOf) {
    for (const parentId of parentIds) {
      for (const siblingId of graph.childrenOf.get(parentId) ?? []) {
        if (siblingId !== personId) push(graph.siblingsOf, personId, siblingId);
      }
    }
  }

  for (const person of people) graph.degree.set(person.id, 0);
  for (const rel of relationships) {
    if (!isKnown(rel.fromPersonId) || !isKnown(rel.toPersonId)) continue;
    graph.degree.set(rel.fromPersonId, (graph.degree.get(rel.fromPersonId) ?? 0) + 1);
    graph.degree.set(rel.toPersonId, (graph.degree.get(rel.toPersonId) ?? 0) + 1);
  }

  return graph;
}

function peopleFromIds(graph: FamilyGraph, ids: readonly Id[] | undefined): Person[] {
  if (!ids?.length) return [];
  return ids
    .map((id) => graph.peopleById.get(id))
    .filter((person): person is Person => Boolean(person));
}

export function parentsOf(graph: FamilyGraph, personId: Id): Person[] {
  return peopleFromIds(graph, graph.parentsOf.get(personId));
}

export function childrenOf(graph: FamilyGraph, personId: Id): Person[] {
  return peopleFromIds(graph, graph.childrenOf.get(personId)).sort(
    (a, b) => birthSortKey(a.dateOfBirth ?? null) - birthSortKey(b.dateOfBirth ?? null),
  );
}

export function spousesOf(graph: FamilyGraph, personId: Id): Person[] {
  return peopleFromIds(graph, graph.spousesOf.get(personId));
}

/** Siblings sorted by birth, so "elder / younger" language stays truthful. */
export function siblingsOf(graph: FamilyGraph, personId: Id): Person[] {
  const ids = graph.siblingsOf.get(personId) ?? [];
  return peopleFromIds(graph, ids).sort((a, b) => {
    const delta = birthSortKey(a.dateOfBirth ?? null) - birthSortKey(b.dateOfBirth ?? null);
    if (delta !== 0) return delta;
    return (a.displayName || a.name).localeCompare(b.displayName || b.name);
  });
}

export function grandparentsOf(graph: FamilyGraph, personId: Id): Person[] {
  const grandparents: Person[] = [];
  for (const parent of parentsOf(graph, personId)) {
    for (const grandparent of parentsOf(graph, parent.id)) {
      if (!grandparents.some((p) => p.id === grandparent.id)) grandparents.push(grandparent);
    }
  }
  return grandparents;
}

export function grandchildrenOf(graph: FamilyGraph, personId: Id): Person[] {
  const out: Person[] = [];
  for (const child of childrenOf(graph, personId)) {
    for (const grandchild of childrenOf(graph, child.id)) {
      if (!out.some((p) => p.id === grandchild.id)) out.push(grandchild);
    }
  }
  return out;
}

export function isExplicitSibling(graph: FamilyGraph, a: Id, b: Id): boolean {
  const [x, y] = [a, b].sort();
  return graph.explicitSiblingPairs.has(`${x}|${y}`);
}

/** Every direct relative of a person, de-duplicated. */
export function directRelatives(graph: FamilyGraph, personId: Id): Person[] {
  const ids = new Set<Id>();
  for (const list of [
    graph.parentsOf.get(personId),
    graph.childrenOf.get(personId),
    graph.spousesOf.get(personId),
    graph.siblingsOf.get(personId),
  ]) {
    for (const id of list ?? []) ids.add(id);
  }
  ids.delete(personId);
  return peopleFromIds(graph, [...ids]);
}

/** Ancestors (transitively) as a set of ids - used for lineage highlighting. */
export function ancestorIds(graph: FamilyGraph, personId: Id, depth = 32): Set<Id> {
  const out = new Set<Id>();
  let frontier = graph.parentsOf.get(personId) ?? [];
  let level = 0;
  while (frontier.length && level < depth) {
    const next: Id[] = [];
    for (const id of frontier) {
      if (out.has(id)) continue;
      out.add(id);
      next.push(...(graph.parentsOf.get(id) ?? []));
    }
    frontier = next;
    level += 1;
  }
  return out;
}

export function descendantIds(graph: FamilyGraph, personId: Id, depth = 32): Set<Id> {
  const out = new Set<Id>();
  let frontier = graph.childrenOf.get(personId) ?? [];
  let level = 0;
  while (frontier.length && level < depth) {
    const next: Id[] = [];
    for (const id of frontier) {
      if (out.has(id)) continue;
      out.add(id);
      next.push(...(graph.childrenOf.get(id) ?? []));
    }
    frontier = next;
    level += 1;
  }
  return out;
}

/**
 * Connected components (a project may hold several unrelated lineages).
 * Used by layout so separate family clusters never overlap.
 */
export function connectedComponents(graph: FamilyGraph): Id[][] {
  const seen = new Set<Id>();
  const components: Id[][] = [];
  for (const person of graph.people) {
    if (seen.has(person.id)) continue;
    const component: Id[] = [];
    const queue: Id[] = [person.id];
    seen.add(person.id);
    while (queue.length) {
      const current = queue.shift() as Id;
      component.push(current);
      const neighbours = new Set<Id>([
        ...(graph.parentsOf.get(current) ?? []),
        ...(graph.childrenOf.get(current) ?? []),
        ...(graph.spousesOf.get(current) ?? []),
        ...(graph.siblingsOf.get(current) ?? []),
      ]);
      for (const neighbour of neighbours) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component);
  }
  return components;
}

/** Membership counts for the dashboard, computed from live rows. */
export interface ProjectGraphStats {
  peopleCount: number;
  relationshipCount: number;
  generations: number;
  generationsKnown: boolean;
  earliestBirthYear: string | null;
}

export function graphStats(graph: FamilyGraph): ProjectGraphStats {
  const years = graph.people
    .map((person) => person.dateOfBirth?.slice(0, 4))
    .filter((year): year is string => Boolean(year && /^\d{4}$/.test(year)))
    .sort();
  return {
    peopleCount: graph.people.length,
    relationshipCount: graph.relationships.length,
    generations: 0,
    generationsKnown: false,
    earliestBirthYear: years[0] ?? null,
  };
}

export function latestActivity(graph: FamilyGraph): number {
  return graph.people.reduce((latest, person) => {
    const value = dateSortKey(person.updatedAt.slice(0, 10));
    return Number.isFinite(value) ? Math.max(latest, value) : latest;
  }, 0);
}
