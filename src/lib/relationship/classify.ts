import type { RelationshipClassification, RelationshipPath } from "./types";

/**
 * Relationship classification.
 *
 * Purely structural: it says WHAT KIND of link a path is (lineal, collateral,
 * affinal, mixed) and how many generations apart the two people are. No
 * cultural vocabulary is involved - that is the terminology layer's job - which
 * is why the same classification can be rendered in English, Hindi or Kannada.
 */

const UP_TOKENS = new Set(["F", "M"]);
const DOWN_TOKENS = new Set(["s", "d"]);
const MARRIAGE_TOKENS = new Set(["H", "W"]);
const SIBLING_TOKENS = new Set(["b", "z"]);

/** +1 per generation up, -1 per generation down. Marriage and siblings are flat. */
export function generationDeltaOf(tokens: readonly string[]): number {
  let delta = 0;
  for (const token of tokens) {
    if (UP_TOKENS.has(token)) delta += 1;
    else if (DOWN_TOKENS.has(token)) delta -= 1;
  }
  return delta;
}

export function classifyPath(path: RelationshipPath | null): RelationshipClassification {
  if (!path) {
    return {
      kind: "unrelated",
      bloodRelated: false,
      generationDelta: 0,
      direction: "none",
      hasMarriage: false,
      hasSiblingBond: false,
      seniorityResolved: true,
    };
  }

  const tokens = path.tokens;
  if (!tokens.length) {
    return {
      kind: "self",
      bloodRelated: true,
      generationDelta: 0,
      direction: "none",
      hasMarriage: false,
      hasSiblingBond: false,
      seniorityResolved: true,
    };
  }

  const hasMarriage = tokens.some((token) => MARRIAGE_TOKENS.has(token));
  const hasSiblingBond = tokens.some((token) => SIBLING_TOKENS.has(token));
  const generationDelta = generationDeltaOf(tokens);
  const allUp = tokens.every((token) => UP_TOKENS.has(token));
  const allDown = tokens.every((token) => DOWN_TOKENS.has(token));
  const allLateral = tokens.every((token) => SIBLING_TOKENS.has(token) || MARRIAGE_TOKENS.has(token));

  const direction: RelationshipClassification["direction"] = allUp
    ? "up"
    : allDown
      ? "down"
      : allLateral
        ? "lateral"
        : "mixed";

  let kind: RelationshipClassification["kind"];
  if (hasMarriage && (hasSiblingBond || tokens.some((token) => UP_TOKENS.has(token) || DOWN_TOKENS.has(token)))) {
    kind = "mixed";
  } else if (hasMarriage) {
    kind = "affinal";
  } else if (allUp || allDown) {
    kind = "lineal";
  } else {
    kind = "collateral";
  }

  return {
    kind,
    bloodRelated: !hasMarriage,
    generationDelta,
    direction,
    hasMarriage,
    hasSiblingBond,
    seniorityResolved: true,
  };
}

export function describeClassification(classification: RelationshipClassification): string {
  switch (classification.kind) {
    case "self":
      return "Same person";
    case "lineal":
      return classification.generationDelta > 0
        ? `Direct ancestor, ${classification.generationDelta} generation${classification.generationDelta === 1 ? "" : "s"} above`
        : `Direct descendant, ${Math.abs(classification.generationDelta)} generation${Math.abs(classification.generationDelta) === 1 ? "" : "s"} below`;
    case "collateral":
      return "Blood relative in a side branch";
    case "affinal":
      return "Related only through marriage";
    case "mixed":
      return "Blood relative and relative by marriage combined";
    default:
      return "No relationship path found";
  }
}
