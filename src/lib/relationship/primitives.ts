import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id } from "@/lib/domain/types";

import type { PathStep, PrimitiveKind, StepOrigin } from "./types";

/**
 * Primitive graph facts.
 *
 * The stored graph is tiny: PARENT_OF (one row per parent/child pair),
 * SPOUSE_OF (one row per couple) and, only where parents are unknown, an
 * asserted SIBLING_OF. Siblinghood is otherwise *derived* from a shared parent
 * - two people with the same father have no sibling row and need none.
 *
 * Every traversal walks these facts, and every fact records where it came from
 * (`origin`), so the explanation can say "inferred from a shared parent"
 * instead of quietly inventing a bond.
 */

export interface Neighbour {
  personId: Id;
  token: string;
  kind: PrimitiveKind;
  origin: StepOrigin;
  relationshipId?: Id;
  viaPersonId?: Id;
}

export function parentToken(gender: string | undefined): "F" | "M" {
  return gender === "female" ? "M" : "F";
}

export function childToken(gender: string | undefined): "s" | "d" {
  return gender === "female" ? "d" : "s";
}

export function siblingToken(gender: string | undefined): "b" | "z" {
  return gender === "female" ? "z" : "b";
}

export function spouseToken(gender: string | undefined): "H" | "W" {
  return gender === "female" ? "W" : "H";
}

export function tokenGender(token: string): "male" | "female" {
  return token === "M" || token === "W" || token === "d" || token === "z" ? "female" : "male";
}

export function stepKindForToken(token: string): PrimitiveKind {
  switch (token) {
    case "F":
    case "M":
      return "PARENT_OF";
    case "s":
    case "d":
      return "CHILD_OF";
    case "H":
    case "W":
      return "SPOUSE_OF";
    default:
      return "SIBLING_OF";
  }
}

/**
 * Neighbours of a person, in a fixed priority order (spouse, parent, child,
 * sibling) so that equally short paths resolve deterministically: a recorded
 * marriage is reported as "wife" rather than "child's mother".
 */
export function neighboursOf(graph: FamilyGraph, personId: Id): Neighbour[] {
  const out: Neighbour[] = [];
  const seen = new Set<Id>();

  const add = (neighbour: Neighbour) => {
    if (neighbour.personId === personId || seen.has(neighbour.personId)) return;
    seen.add(neighbour.personId);
    out.push(neighbour);
  };

  for (const rel of graph.relationshipsByPerson.get(personId) ?? []) {
    const otherId = rel.fromPersonId === personId ? rel.toPersonId : rel.fromPersonId;
    if (otherId === personId) continue;
    const gender = graph.peopleById.get(otherId)?.gender;
    if (rel.type === "spouse") {
      add({ personId: otherId, token: spouseToken(gender), kind: "SPOUSE_OF", origin: "stored", relationshipId: rel.id });
    } else if (rel.type === "parent" && rel.fromPersonId === personId) {
      add({ personId: otherId, token: childToken(gender), kind: "CHILD_OF", origin: "stored", relationshipId: rel.id });
    } else if (rel.type === "parent" && rel.toPersonId === personId) {
      add({ personId: otherId, token: parentToken(gender), kind: "PARENT_OF", origin: "stored", relationshipId: rel.id });
    }
  }

  // Derived and asserted siblings. A sibling whose bond is *also* implied by a
  // shared parent is reported as derived (the stored row is redundant, and the
  // derivation is what the explanation should cite).
  const siblingIds = (graph.siblingsOf.get(personId) ?? []).filter((id) => graph.peopleById.has(id));
  for (const siblingId of siblingIds) {
    if (seen.has(siblingId)) continue;
    const gender = graph.peopleById.get(siblingId)?.gender;
    const sharedParent = sharedParentOf(graph, personId, siblingId);
    const assertedRow = (graph.relationshipsByPerson.get(personId) ?? []).find(
      (rel) =>
        rel.type === "sibling" &&
        (rel.fromPersonId === siblingId || rel.toPersonId === siblingId),
    );
    add({
      personId: siblingId,
      token: siblingToken(gender),
      kind: "SIBLING_OF",
      origin: sharedParent ? "derived" : "stored",
      relationshipId: assertedRow?.id,
      viaPersonId: sharedParent,
    });
  }

  return out;
}

/** The parent two people share, if any - the justification for siblinghood. */
export function sharedParentOf(graph: FamilyGraph, a: Id, b: Id): Id | undefined {
  const parentsOfA = graph.parentsOf.get(a) ?? [];
  if (!parentsOfA.length) return undefined;
  const parentsOfB = new Set(graph.parentsOf.get(b) ?? []);
  return parentsOfA.find((parentId) => parentsOfB.has(parentId));
}

/**
 * How `toId` relates to `fromId`, using only stored and derivable facts. Used
 * to walk a path *backwards* (for the reverse reading of a relationship) and to
 * re-derive steps after path collapsing.
 */
export function directStep(graph: FamilyGraph, fromId: Id, toId: Id): PathStep | null {
  if (fromId === toId) return null;
  const gender = graph.peopleById.get(toId)?.gender;

  const parentRow = (graph.relationshipsByPerson.get(fromId) ?? []).find(
    (rel) => rel.type === "parent" && rel.toPersonId === fromId && rel.fromPersonId === toId,
  );
  if (parentRow) {
    return {
      kind: "PARENT_OF",
      fromPersonId: fromId,
      toPersonId: toId,
      origin: "stored",
      relationshipId: parentRow.id,
      token: parentToken(gender),
    };
  }

  const childRow = (graph.relationshipsByPerson.get(fromId) ?? []).find(
    (rel) => rel.type === "parent" && rel.fromPersonId === fromId && rel.toPersonId === toId,
  );
  if (childRow) {
    return {
      kind: "CHILD_OF",
      fromPersonId: fromId,
      toPersonId: toId,
      origin: "stored",
      relationshipId: childRow.id,
      token: childToken(gender),
    };
  }

  if ((graph.spousesOf.get(fromId) ?? []).includes(toId)) {
    const row = (graph.relationshipsByPerson.get(fromId) ?? []).find(
      (rel) => rel.type === "spouse" && (rel.fromPersonId === toId || rel.toPersonId === toId),
    );
    return {
      kind: "SPOUSE_OF",
      fromPersonId: fromId,
      toPersonId: toId,
      origin: "stored",
      relationshipId: row?.id,
      token: spouseToken(gender),
    };
  }

  if ((graph.siblingsOf.get(fromId) ?? []).includes(toId)) {
    const sharedParent = sharedParentOf(graph, fromId, toId);
    const assertedRow = (graph.relationshipsByPerson.get(fromId) ?? []).find(
      (rel) => rel.type === "sibling" && (rel.fromPersonId === toId || rel.toPersonId === toId),
    );
    return {
      kind: "SIBLING_OF",
      fromPersonId: fromId,
      toPersonId: toId,
      origin: sharedParent ? "derived" : "stored",
      relationshipId: assertedRow?.id,
      viaPersonId: sharedParent,
      token: siblingToken(gender),
    };
  }

  return null;
}

/** Stored relationship rows that justify a step (parent rows for a derivation). */
export function relationshipIdsForStep(graph: FamilyGraph, step: PathStep): Id[] {
  const ids: Id[] = [];
  if (step.relationshipId) ids.push(step.relationshipId);
  if (step.kind === "SIBLING_OF" && step.viaPersonId) {
    for (const siblingId of [step.fromPersonId, step.toPersonId]) {
      const row = (graph.relationshipsByPerson.get(step.viaPersonId) ?? []).find(
        (rel) => rel.type === "parent" && rel.fromPersonId === step.viaPersonId && rel.toPersonId === siblingId,
      );
      if (row) ids.push(row.id);
    }
  }
  return ids;
}
