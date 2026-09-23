import type { PlacementRelation } from "@/lib/canvas/placement";
import type { Id, RelationshipType, SpouseStatus } from "@/lib/domain/types";

/**
 * A "relative intent" is what the user asks for in human terms - "add a parent
 * for this person" - and it is deliberately separate from the stored record.
 * This module is the single translation point, so the canvas controls, the
 * details panel and the tests all create identical records.
 *
 * Direction rules (see `Relationship` in ./types for the storage contract):
 *   parent  -> the NEW person is the parent: (new) -> parent -> (anchor)
 *   child   -> the ANCHOR is the parent:     (anchor) -> parent -> (new)
 *   spouse / sibling / other -> anchor first, canonicalised on write
 */

export type RelativeIntent = "parent" | "child" | "spouse" | "sibling" | "other";

export interface IntentMeta {
  intent: RelativeIntent;
  label: string;
  /** What the action promises to do, in the user's words. */
  description: string;
  /** CSS custom property colouring this bond type. */
  colorVar: string;
  /** Where a brand new node should be placed relative to the anchor. */
  placement: PlacementRelation;
  /** Tooltip for the contextual node control. */
  control: string;
}

export const INTENT_META: Record<RelativeIntent, IntentMeta> = {
  parent: {
    intent: "parent",
    label: "Parent",
    description: "Record someone as the parent of this person.",
    colorVar: "--link-parent",
    placement: "parent",
    control: "Add parent",
  },
  child: {
    intent: "child",
    label: "Child",
    description: "Record someone as a child of this person.",
    colorVar: "--link-parent",
    placement: "child",
    control: "Add child",
  },
  spouse: {
    intent: "spouse",
    label: "Spouse",
    description: "Marriage, partnership or a past marriage.",
    colorVar: "--link-spouse",
    placement: "spouse",
    control: "Add spouse",
  },
  sibling: {
    intent: "sibling",
    label: "Sibling",
    description: "Brother or sister - use it when parents are unknown.",
    colorVar: "--link-sibling",
    placement: "sibling",
    control: "Add sibling",
  },
  other: {
    intent: "other",
    label: "Other",
    description: "Guru, godparent, guardian, or any named bond.",
    colorVar: "--link-other",
    placement: "other",
    control: "Add other relationship",
  },
};

export const RELATIVE_INTENTS: RelativeIntent[] = ["parent", "child", "spouse", "sibling", "other"];

export interface ResolvedIntent {
  type: RelationshipType;
  fromPersonId: Id;
  toPersonId: Id;
  label?: string;
  status?: SpouseStatus;
}

export function resolveIntent(
  intent: RelativeIntent,
  anchorPersonId: Id,
  otherPersonId: Id,
  options: { label?: string; status?: SpouseStatus } = {},
): ResolvedIntent {
  switch (intent) {
    case "parent":
      // The other person is the parent, the anchor is the child.
      return { type: "parent", fromPersonId: otherPersonId, toPersonId: anchorPersonId };
    case "child":
      return { type: "parent", fromPersonId: anchorPersonId, toPersonId: otherPersonId };
    case "spouse":
      return {
        type: "spouse",
        fromPersonId: anchorPersonId,
        toPersonId: otherPersonId,
        status: options.status ?? "married",
      };
    case "sibling":
      return { type: "sibling", fromPersonId: anchorPersonId, toPersonId: otherPersonId };
    default:
      return {
        type: "other",
        fromPersonId: anchorPersonId,
        toPersonId: otherPersonId,
        label: options.label?.trim() || "Related",
      };
  }
}

/** Human sentence describing what a link will create, for the confirm button. */
export function describeIntent(intent: RelativeIntent, anchorName: string, otherName: string): string {
  switch (intent) {
    case "parent":
      return `${otherName} becomes the parent of ${anchorName}.`;
    case "child":
      return `${otherName} becomes a child of ${anchorName}.`;
    case "spouse":
      return `${otherName} becomes the spouse of ${anchorName}.`;
    case "sibling":
      return `${otherName} becomes a sibling of ${anchorName}.`;
    default:
      return `${otherName} is linked to ${anchorName}.`;
  }
}
