import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id } from "@/lib/domain/types";

import { TOKEN_WORDS, type RelationshipPath } from "./types";

/**
 * Explanation.
 *
 * The finder must never answer with a bare label. Every result carries the path
 * phrased in words ("A is B's mother's brother's son"), a summary of which part
 * of the family the link runs through, and - where a sibling link was inferred
 * rather than recorded - the shared parent that justified it.
 */

export function nameOf(graph: FamilyGraph, personId: Id | undefined): string {
  if (!personId) return "someone";
  const person = graph.peopleById.get(personId);
  return person?.displayName?.trim() || person?.name || "someone";
}

/** "mother's brother's son" - every token that is not the last becomes possessive. */
export function compositionalEnglish(tokens: readonly string[]): string {
  if (!tokens.length) return "self";
  return tokens
    .map((token, index) => {
      const word = TOKEN_WORDS[token as keyof typeof TOKEN_WORDS] ?? token;
      return index === tokens.length - 1 ? word : `${word}'s`;
    })
    .join(" ");
}

export function tokenWords(tokens: readonly string[]): string[] {
  return tokens.map((token) => TOKEN_WORDS[token as keyof typeof TOKEN_WORDS] ?? token);
}

export interface ExplanationParts {
  literal: string;
  inverseLiteral: string;
  explanation: string;
  forwardExplanation: string;
  branchSummary: string;
}

const FIRST_STEP_PHRASE: Record<string, string> = {
  PARENT_OF: "parent",
  CHILD_OF: "child",
  SPOUSE_OF: "spouse",
  SIBLING_OF: "sibling",
};

export function buildExplanation(
  graph: FamilyGraph,
  path: RelationshipPath,
  inverseTokens: readonly string[],
): ExplanationParts {
  const sourceName = nameOf(graph, path.sourcePersonId);
  const targetName = nameOf(graph, path.targetPersonId);
  const literal = compositionalEnglish(path.tokens);
  const inverseLiteral = compositionalEnglish(inverseTokens);

  if (!path.tokens.length) {
    return {
      literal: "same person",
      inverseLiteral: "same person",
      explanation: `${sourceName} and ${targetName} are the same person.`,
      forwardExplanation: `${sourceName} and ${targetName} are the same person.`,
      branchSummary: "",
    };
  }

  // The spec's reading: the source read against the target. The forward reading
  // is included too, since a panel often shows one and a badge the other.
  const explanation = `${sourceName} is ${targetName}'s ${inverseLiteral}.`;
  const forwardExplanation = `${targetName} is ${sourceName}'s ${literal}.`;

  return {
    literal,
    inverseLiteral,
    explanation,
    forwardExplanation,
    branchSummary: buildBranchSummary(graph, path, sourceName),
  };
}

function buildBranchSummary(
  graph: FamilyGraph,
  path: RelationshipPath,
  sourceName: string,
): string {
  const firstStep = path.steps[0];
  if (!firstStep) return "";

  const hopName = nameOf(graph, firstStep.toPersonId);
  const phrase = FIRST_STEP_PHRASE[firstStep.kind] ?? "relative";
  const sentences: string[] = [`The path leaves ${sourceName} through their ${phrase}, ${hopName}.`];

  const marriage = path.steps.find((step) => step.kind === "SPOUSE_OF");
  if (marriage) {
    sentences.push(
      `It passes through a marriage: ${nameOf(graph, marriage.fromPersonId)} and ${nameOf(graph, marriage.toPersonId)}.`,
    );
  }

  const derived = path.derivedSiblingPairs[0];
  if (derived) {
    sentences.push(
      `A sibling link between ${nameOf(graph, derived.siblingId)} and ${nameOf(graph, derived.otherId)} is inferred from their shared parent, ${nameOf(graph, derived.viaPersonId)}.`,
    );
  }

  return sentences.join(" ");
}
