import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, Person, Relationship } from "@/lib/domain/types";
import { birthSortKey } from "@/lib/utils/date";

/**
 * Generation assignment.
 *
 * Two rules make the result readable:
 *  1. A couple shares one generation (spouses are never drawn on different
 *     rows), so spouses are merged into a single level *group* first.
 *  2. A child is one generation below *every* parent, so a group's level is
 *     `max(parentLevel) + 1`. Marriage across generations (or a record that
 *     would imply a cycle) is handled by iterating to a fixed point instead of
 *     throwing - real family data is messy and the app must not fight it.
 */

export interface GenerationAssignment {
  /** personId -> generation index, normalised so the oldest is 0. */
  levels: Map<Id, number>;
  /** personId -> couple-group id (a person with no spouse is their own group). */
  groupOf: Map<Id, string>;
  /** groupId -> member person ids, in stable order. */
  membersOf: Map<string, Id[]>;
}

class UnionFind {
  private parent = new Map<string, string>();

  find(key: string): string {
    const current = this.parent.get(key);
    if (current === undefined) {
      this.parent.set(key, key);
      return key;
    }
    if (current === key) return key;
    const root = this.find(current);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    // Deterministic merge direction keeps layouts reproducible.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }
}

export function coupleGroups(
  people: readonly Person[],
  relationships: readonly Relationship[],
): { groupOf: Map<Id, string>; membersOf: Map<string, Id[]> } {
  const union = new UnionFind();
  for (const person of people) union.find(person.id);
  for (const rel of relationships) {
    if (rel.type === "spouse") union.union(rel.fromPersonId, rel.toPersonId);
  }

  const groupOf = new Map<Id, string>();
  const membersOf = new Map<string, Id[]>();
  for (const person of people) {
    const group = union.find(person.id);
    groupOf.set(person.id, group);
    const members = membersOf.get(group);
    if (members) members.push(person.id);
    else membersOf.set(group, [person.id]);
  }

  // Order couples so the elder is on the left: reads like a family tree.
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const [group, members] of membersOf) {
    membersOf.set(
      group,
      [...members].sort((a, b) => {
        const personA = peopleById.get(a);
        const personB = peopleById.get(b);
        const delta =
          birthSortKey(personA?.dateOfBirth ?? null) - birthSortKey(personB?.dateOfBirth ?? null);
        if (delta !== 0) return delta;
        return (personA?.name ?? "").localeCompare(personB?.name ?? "");
      }),
    );
  }

  return { groupOf, membersOf };
}

export function assignGenerations(
  graph: FamilyGraph,
  options: { maxIterations?: number } = {},
): GenerationAssignment {
  const maxIterations = options.maxIterations ?? 128;
  const { groupOf, membersOf } = coupleGroups(graph.people, graph.relationships);

  // group -> set of parent groups
  const parentGroups = new Map<string, Set<string>>();
  for (const group of membersOf.keys()) parentGroups.set(group, new Set());
  for (const rel of graph.relationships) {
    if (rel.type !== "parent") continue;
    const parentGroup = groupOf.get(rel.fromPersonId);
    const childGroup = groupOf.get(rel.toPersonId);
    if (!parentGroup || !childGroup || parentGroup === childGroup) continue;
    parentGroups.get(childGroup)?.add(parentGroup);
  }

  const levels = new Map<string, number>();
  for (const group of membersOf.keys()) levels.set(group, 0);

  // Fixed-point relaxation: level(child) >= level(parent) + 1.
  let changed = true;
  let iteration = 0;
  while (changed && iteration < maxIterations) {
    changed = false;
    iteration += 1;
    for (const [group, parents] of parentGroups) {
      let required = 0;
      for (const parent of parents) required = Math.max(required, (levels.get(parent) ?? 0) + 1);
      if (required > (levels.get(group) ?? 0)) {
        levels.set(group, required);
        changed = true;
      }
    }
  }

  // Degenerate cycle: fall back to BFS depth so we still render something sane.
  if (iteration >= maxIterations) {
    const depth = new Map<string, number>();
    const queue: string[] = [...membersOf.keys()].filter(
      (group) => (parentGroups.get(group)?.size ?? 0) === 0,
    );
    for (const group of queue) depth.set(group, 0);
    while (queue.length) {
      const group = queue.shift() as string;
      const current = depth.get(group) ?? 0;
      for (const member of membersOf.get(group) ?? []) {
        for (const childId of graph.childrenOf.get(member) ?? []) {
          const childGroup = groupOf.get(childId);
          if (!childGroup || childGroup === group) continue;
          if ((depth.get(childGroup) ?? 0) < current + 1) {
            depth.set(childGroup, current + 1);
            queue.push(childGroup);
          }
        }
      }
    }
    for (const [group, value] of depth) levels.set(group, value);
  }

  const minLevel = Math.min(0, ...levels.values());
  const personLevels = new Map<Id, number>();
  for (const [personId, group] of groupOf) {
    personLevels.set(personId, (levels.get(group) ?? 0) - minLevel);
  }

  return { levels: personLevels, groupOf, membersOf };
}
