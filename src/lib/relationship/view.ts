import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, KinshipSystemId } from "@/lib/domain/types";

import { describeRelationship, type DescribeOptions } from "./index";
import { languageName } from "./terms";
import type {
  LanguageCode,
  RelationshipConfidence,
  RelationshipResult,
  RelationshipTermMatch,
} from "./types";

/**
 * The presentation view of a relationship result.
 *
 * Components render this and nothing else: whether a term exists, how strong
 * the claim is, and what to show *instead* of a term when the graph does not
 * support one. Keeping that decision here means no component can accidentally
 * present an uncertain relationship as an authoritative word.
 */
export interface TermView {
  language: LanguageCode;
  languageName: string;
  /** The term as the family says it, or null when it cannot be asserted. */
  term: string | null;
  /** Native script (Devanagari / Kannada), when the term has one. */
  script: string | null;
  englishMeaning: string;
  /** "father's brother" - always available, even without a term. */
  literal: string;
  confidence: RelationshipConfidence;
  note?: string;
  missingContext?: string;
  /** Full sentence explaining why this term applies. */
  explanation: string;
  generationDelta: number;
  /** True when an elder/younger distinction could not be resolved. */
  seniorityUnknown: boolean;
}

export function termView(
  match: RelationshipTermMatch | null,
  result: RelationshipResult,
  language: LanguageCode,
): TermView {
  return {
    language,
    languageName: languageName(language),
    term: match?.term ?? null,
    script: match?.script ?? null,
    englishMeaning: match?.englishMeaning ?? result.literal,
    literal: result.literal,
    confidence: match?.confidence ?? "uncertain",
    note: match?.note,
    missingContext: match?.missingContext,
    explanation: match?.explanation ?? result.explanation,
    generationDelta: match?.generationDelta ?? result.relationshipType.generationDelta,
    seniorityUnknown: result.seniorityUnknown,
  };
}

export interface RelationshipView {
  result: RelationshipResult;
  /** The term in the language the UI asked for. */
  view: TermView;
  /** Every language's term, for the "what would this family call them" rows. */
  views: TermView[];
}

export function relationshipView(
  result: RelationshipResult,
  language: LanguageCode,
): RelationshipView {
  return {
    result,
    view: termView(
      result.relationshipTerm ??
        result.terms.find((term) => term.language === language) ??
        null,
      result,
      language,
    ),
    views: result.terms.map((match) => termView(match, result, match.language)),
  };
}

/**
 * Describe two people without thinking about languages: the caller passes the
 * project's vocabulary and gets back both the raw result and the views.
 */
export function describeRelationshipView(
  graph: FamilyGraph,
  sourcePersonId: Id,
  targetPersonId: Id,
  options: DescribeOptions & { system?: KinshipSystemId } = {},
): RelationshipView {
  const result = describeRelationship(graph, sourcePersonId, targetPersonId, options);
  const language = options.language ?? result.relationshipTerm?.language ?? "en";
  return relationshipView(result, language);
}
