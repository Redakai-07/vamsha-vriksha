import type {
  Id,
  Person,
  Relationship,
  RelationshipType,
  SpouseStatus,
} from "@/lib/domain/types";
import { nowIso } from "@/lib/utils/id";

/**
 * Relationship value semantics.
 *
 * A Relationship is an explicit, persisted record with two endpoints. Two
 * people standing next to each other on the canvas are NOT related until such a
 * record exists. This module owns every rule about how those records behave.
 */

export interface RelationshipTypeMeta {
  type: RelationshipType;
  label: string;
  /** Verb phrase used in buttons: "Add parent". */
  action: string;
  description: string;
  /** Symmetric bonds are stored once, with endpoints canonically ordered. */
  symmetric: boolean;
  /** CSS custom property name for this bond's colour. */
  colorVar: string;
}

export const RELATIONSHIP_TYPE_META: Record<RelationshipType, RelationshipTypeMeta> = {
  parent: {
    type: "parent",
    label: "Parent / Child",
    action: "parent",
    description: "One person is the parent, the other the child.",
    symmetric: false,
    colorVar: "--link-parent",
  },
  spouse: {
    type: "spouse",
    label: "Spouse",
    action: "spouse",
    description: "Marriage, partnership, or a past marriage.",
    symmetric: true,
    colorVar: "--link-spouse",
  },
  sibling: {
    type: "sibling",
    label: "Sibling",
    action: "sibling",
    description: "Brothers and sisters, useful when parents are unknown.",
    symmetric: true,
    colorVar: "--link-sibling",
  },
  other: {
    type: "other",
    label: "Other",
    action: "custom relationship",
    description: "Guru, godparent, guardian, ward, or any named bond.",
    symmetric: false,
    colorVar: "--link-other",
  },
};

export const SPOUSE_STATUS_LABELS: Record<SpouseStatus, string> = {
  married: "Married",
  partner: "Partners",
  divorced: "Divorced",
  widowed: "Widowed",
  unknown: "Unspecified",
};

export interface RelationshipInput {
  projectId: Id;
  type: RelationshipType;
  fromPersonId: Id;
  toPersonId: Id;
  status?: SpouseStatus;
  label?: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
  id?: Id;
}

export function createRelationship(input: RelationshipInput, id: string): Relationship {
  const stamp = nowIso();
  // Spouses are canonicalised by id (endpoints carry no meaning), but sibling
  // bonds keep the caller's order because it encodes seniority: the elder comes
  // first so relationship lists and layouts read chronologically. Duplicate
  // detection is unaffected - `relationshipKey` compares symmetric types in
  // canonical order regardless of how the row is stored.
  const pair =
    input.type === "spouse"
      ? canonicalPair(input.fromPersonId, input.toPersonId)
      : { from: input.fromPersonId, to: input.toPersonId };

  return {
    id,
    projectId: input.projectId,
    type: input.type,
    fromPersonId: pair.from,
    toPersonId: pair.to,
    status: input.type === "spouse" ? (input.status ?? "married") : undefined,
    label: input.type === "other" ? (input.label?.trim() || "Related") : undefined,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    notes: input.notes?.trim() || undefined,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Endpoints of a symmetric bond, ordered by id so duplicates match exactly. */
export function canonicalPair(a: Id, b: Id): { from: Id; to: Id } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Identity key of a bond. Two records with the same key are the same
 * relationship and must not both exist.
 */
export function relationshipKey(
  type: RelationshipType,
  a: Id,
  b: Id,
  label?: string,
): string {
  const meta = RELATIONSHIP_TYPE_META[type];
  const pair = meta.symmetric ? canonicalPair(a, b) : { from: a, to: b };
  const suffix = type === "other" ? `:${(label ?? "").trim().toLowerCase()}` : "";
  return `${type}:${pair.from}:${pair.to}${suffix}`;
}

/** Stable storage-level key for an existing row. */
export function relationshipKeyOf(relationship: Relationship): string {
  return relationshipKey(
    relationship.type,
    relationship.fromPersonId,
    relationship.toPersonId,
    relationship.label,
  );
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates a *new* bond against the existing set. Cycle detection walks the
 * ancestry chain of the prospective parent: a person can never become a
 * descendant of their own descendant.
 */
export function validateNewRelationship(
  input: Pick<RelationshipInput, "type" | "fromPersonId" | "toPersonId" | "label">,
  existing: readonly Relationship[],
): ValidationResult {
  const { type, fromPersonId, toPersonId } = input;

  if (fromPersonId === toPersonId) {
    return { ok: false, reason: "A person cannot be related to themselves." };
  }

  // A loop appears when the prospective parent is already a descendant of the
  // prospective child, i.e. the child can already reach the parent downwards.
  if (type === "parent" && reaches(toPersonId, fromPersonId, existing)) {
    return { ok: false, reason: "That would create a loop in the lineage." };
  }

  const candidateKey = relationshipKey(type, fromPersonId, toPersonId, input.label);
  if (existing.some((rel) => relationshipKeyOf(rel) === candidateKey)) {
    return { ok: false, reason: "That relationship already exists." };
  }

  // A parent edge between two people who are already spouses is meaningful in
  // some family structures but almost always a mistake: flag it.
  if (type === "spouse") {
    const isParentOfOther = existing.some(
      (rel) =>
        rel.type === "parent" &&
        ((rel.fromPersonId === fromPersonId && rel.toPersonId === toPersonId) ||
          (rel.fromPersonId === toPersonId && rel.toPersonId === fromPersonId)),
    );
    if (isParentOfOther) {
      return { ok: false, reason: "Those two are already recorded as parent and child." };
    }
  }

  return { ok: true };
}

/**
 * True when `target` is reachable by walking *down* the tree from `start`,
 * i.e. target is a descendant of start. Used for cycle checks: linking
 * parent -> child is only valid while the parent is not already a descendant
 * of that child.
 */
export function reaches(start: Id, target: Id, relationships: readonly Relationship[]): boolean {
  const childrenOf = new Map<Id, Id[]>();
  for (const rel of relationships) {
    if (rel.type !== "parent") continue;
    const list = childrenOf.get(rel.fromPersonId);
    if (list) list.push(rel.toPersonId);
    else childrenOf.set(rel.fromPersonId, [rel.toPersonId]);
  }

  const seen = new Set<Id>();
  const queue: Id[] = [start];
  while (queue.length) {
    const current = queue.shift() as Id;
    if (current === target && current !== start) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const child of childrenOf.get(current) ?? []) {
      if (child === target) return true;
      queue.push(child);
    }
  }
  return false;
}

/** Sibling bonds should keep the elder first so lists read naturally. */
export function orderSiblingsForStorage(
  a: Person | undefined,
  b: Person | undefined,
): { from: Id; to: Id } | null {
  if (!a || !b) return null;
  const aKey = a.dateOfBirth ?? "";
  const bKey = b.dateOfBirth ?? "";
  if (aKey && bKey && aKey !== bKey) {
    return aKey < bKey ? { from: a.id, to: b.id } : { from: b.id, to: a.id };
  }
  return null;
}

export interface PerspectiveLabel {
  /** How the relationship reads from `fromPersonId`'s point of view. */
  outgoing: string;
  /** How it reads from `toPersonId`'s point of view. */
  incoming: string;
  /** Shared term when the bond is symmetric. */
  symmetricLabel?: string;
}

export const PERSPECTIVE_LABELS: Record<RelationshipType, PerspectiveLabel> = {
  parent: { outgoing: "Parent of", incoming: "Child of" },
  spouse: { outgoing: "Spouse", incoming: "Spouse", symmetricLabel: "Spouse" },
  sibling: { outgoing: "Sibling of", incoming: "Sibling of", symmetricLabel: "Sibling" },
  other: { outgoing: "Related to", incoming: "Related to" },
};

export function describeRelationshipLabel(relationship: Relationship): string {
  if (relationship.type === "other") return relationship.label?.trim() || "Related";
  if (relationship.type === "spouse") {
    const status = relationship.status ?? "married";
    return status === "married" ? "Spouse" : SPOUSE_STATUS_LABELS[status];
  }
  return RELATIONSHIP_TYPE_META[relationship.type].label;
}
