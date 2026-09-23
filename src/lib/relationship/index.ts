import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, KinshipSystemId } from "@/lib/domain/types";
import { birthSortKey } from "@/lib/utils/date";

import { classifyPath } from "./classify";
import { buildExplanation, nameOf } from "./explain";
import {
  DEFAULT_MAX_DEPTH,
  findRawPath,
  findRawPaths,
  reverseRawPath,
  toRelationshipPath,
} from "./traverse";
import { normalizePath } from "./normalize";
import {
  ALL_LANGUAGES,
  languageForKinshipSystem,
  pickTerm,
  resolveTerms,
} from "./terms";
import type {
  LanguageCode,
  RelationshipPath,
  RelationshipResult,
  RelationshipTermMatch,
  Seniority,
  TermContext,
} from "./types";

export * from "./types";
export * from "./classify";
export * from "./explain";
export {
  ALL_LANGUAGES,
  LANGUAGE_GAPS,
  LANGUAGE_META,
  LANGUAGE_RULES,
  findTermRules,
  generationLabel,
  languageForKinshipSystem,
  languageName,
  listTerminology,
  listTerminologyGaps,
  searchTerminology,
  searchTerminologyGaps,
  toGapEntry,
  toGuideEntry,
} from "./terms";
export type { TerminologyEntry, TerminologyGapEntry } from "./terms";
export { directStep, neighboursOf, stepKindForToken } from "./primitives";

/**
 * The relationship engine's public API.
 *
 * Everything the UI needs to answer "how are these two people related, and
 * why?" comes from `describeRelationship`. It returns the path (for
 * highlighting), the classification, the terms for every supported language,
 * and human sentences that justify the answer. Nothing here invents a word: a
 * term is either matched by a rule with all the facts it needs, marked general,
 * or withheld.
 */

export interface DescribeOptions {
  /** Language the UI should present as primary (defaults to the project's). */
  language?: LanguageCode;
  /** Project vocabulary; used when `language` is not given. */
  system?: KinshipSystemId;
  maxDepth?: number;
  /** Languages to resolve terms for; defaults to all of them. */
  languages?: LanguageCode[];
}

/** Seniority of the relative at the end of the path, versus the linking person. */
export function seniorityOf(path: RelationshipPath, graph: FamilyGraph): Seniority {
  let end = path.tokens.length;
  while (end > 0 && (path.tokens[end - 1] === "H" || path.tokens[end - 1] === "W")) end -= 1;
  if (end === 0) return "unknown";
  const reference = graph.peopleById.get(path.personIds[end - 1] ?? "");
  const subject = graph.peopleById.get(path.personIds[end] ?? "");
  if (!reference || !subject) return "unknown";
  const referenceKey = reference.dateOfBirth ? birthSortKey(reference.dateOfBirth) : null;
  const subjectKey = subject.dateOfBirth ? birthSortKey(subject.dateOfBirth) : null;
  if (referenceKey === null || subjectKey === null) return "unknown";
  if (subjectKey < referenceKey) return "elder";
  if (subjectKey > referenceKey) return "younger";
  return "unknown";
}

export function buildTermContext(path: RelationshipPath, graph: FamilyGraph): TermContext {
  const peopleById: TermContext["peopleById"] = new Map();
  for (const person of graph.people) {
    peopleById.set(person.id, {
      id: person.id,
      name: person.displayName?.trim() || person.name,
      gender: person.gender,
      dateOfBirth: person.dateOfBirth ?? null,
    });
  }
  const targetId = path.personIds[path.personIds.length - 1];
  return {
    tokens: path.tokens,
    personIds: path.personIds,
    peopleById,
    seniority: seniorityOf(path, graph),
    targetGender: graph.peopleById.get(targetId ?? "")?.gender ?? "unknown",
    sourceGender: graph.peopleById.get(path.sourcePersonId)?.gender ?? "unknown",
  };
}

function emptyResult(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
): RelationshipResult {
  const sourceName = nameOf(graph, sourcePersonId);
  const targetName = nameOf(graph, targetPersonId);
  return {
    found: false,
    sourcePersonId,
    targetPersonId,
    sourceName,
    targetName,
    path: null,
    relationshipType: classifyPath(null),
    relationshipTerm: null,
    terms: [],
    explanation: `No relationship path connects ${sourceName} and ${targetName} in the recorded family graph.`,
    forwardExplanation: "",
    branchSummary: "",
    literal: "",
    inverseLiteral: "",
    confidence: "uncertain",
    seniorityUnknown: false,
  };
}

function assemble(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  path: RelationshipPath,
  options: DescribeOptions,
): RelationshipResult {
  const primaryLanguage =
    options.language ?? languageForKinshipSystem(options.system ?? undefined);
  const languages = options.languages ?? ALL_LANGUAGES;
  const context = buildTermContext(path, graph);
  const terms = resolveTerms(context, languages);
  const relationshipTerm = pickTerm(terms, primaryLanguage) ?? terms[0] ?? null;

  const inverseRaw = reverseRawPath(graph, {
    personIds: path.rawPersonIds,
    tokens: path.rawTokens,
  });
  const inverseTokens = normalizePath(graph, inverseRaw.personIds, inverseRaw.tokens).tokens;
  const explanationParts = buildExplanation(graph, path, inverseTokens);

  const confidence =
    relationshipTerm?.confidence ?? (path.tokens.length ? "general" : "exact");

  return {
    found: true,
    sourcePersonId,
    targetPersonId,
    sourceName: nameOf(graph, sourcePersonId),
    targetName: nameOf(graph, targetPersonId),
    path,
    relationshipType: classifyPath(path),
    relationshipTerm,
    terms,
    explanation: explanationParts.explanation,
    forwardExplanation: explanationParts.forwardExplanation,
    branchSummary: explanationParts.branchSummary,
    literal: explanationParts.literal,
    inverseLiteral: explanationParts.inverseLiteral,
    confidence,
    seniorityUnknown: context.seniority === "unknown",
  };
}

/** The headline call: how are these two people related, and why? */
export function describeRelationship(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  options: DescribeOptions = {},
): RelationshipResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const raw = findRawPath(graph, sourcePersonId, targetPersonId, maxDepth);
  if (!raw) return emptyResult(graph, sourcePersonId, targetPersonId);
  const path = toRelationshipPath(graph, sourcePersonId, targetPersonId, raw);
  return assemble(graph, sourcePersonId, targetPersonId, path, options);
}

/**
 * Every distinct way the two people are related (shortest first). A person can
 * be both a cousin and a brother-in-law; the finder shows the shortest path and
 * mentions that other connections exist.
 */
export function describeRelationshipAlternatives(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  options: DescribeOptions & { limit?: number } = {},
): RelationshipResult[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const raws = findRawPaths(graph, sourcePersonId, targetPersonId, {
    maxDepth,
    limit: options.limit ?? 3,
  });
  return raws.map((raw) =>
    assemble(
      graph,
      sourcePersonId,
      targetPersonId,
      toRelationshipPath(graph, sourcePersonId, targetPersonId, raw),
      options,
    ),
  );
}

/** Everyone in the graph related to `personId` within `maxDepth` steps. */
export function nearbyRelationships(
  graph: FamilyGraph,
  personId: Id,
  options: DescribeOptions = {},
): RelationshipResult[] {
  const maxDepth = options.maxDepth ?? 3;
  const results: RelationshipResult[] = [];
  for (const person of graph.people) {
    if (person.id === personId) continue;
    const result = describeRelationship(graph, personId, person.id, { ...options, maxDepth });
    if (result.found) results.push(result);
  }
  return results.sort((a, b) => (a.path?.tokens.length ?? 0) - (b.path?.tokens.length ?? 0));
}

/** Convenience for the badge components: the display words for one result. */
export function termDisplay(
  result: RelationshipResult,
  language: LanguageCode,
): RelationshipTermMatch | null {
  return pickTerm(result.terms, language);
}
