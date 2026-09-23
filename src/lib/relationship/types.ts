import type { Gender, Id } from "@/lib/domain/types";

/**
 * The relationship engine's vocabulary.
 *
 * Relationships are FACTS, not labels. The only facts the application stores are
 * primitive bonds - parent, spouse, and (when parents are unknown) an asserted
 * sibling bond. Everything else ("uncle", "cousin", "mava", "chikkappa") is
 * *derived* by traversing the graph and then interpreted by the terminology
 * layer. Nothing in this file knows any kinship words.
 */

/** The primitive edge kinds the graph is made of. */
export type PrimitiveKind = "PARENT_OF" | "CHILD_OF" | "SPOUSE_OF" | "SIBLING_OF";

/** Where a step came from: a stored row, or inferred from shared parents. */
export type StepOrigin = "stored" | "derived";

export interface PathStep {
  kind: PrimitiveKind;
  fromPersonId: Id;
  toPersonId: Id;
  origin: StepOrigin;
  /** Stored relationship row backing this step, when one exists. */
  relationshipId?: Id;
  /**
   * For derived sibling steps: the shared parent that justifies the inference.
   * This is what makes the derivation auditable in the UI.
   */
  viaPersonId?: Id;
  /** Direction-aware token used by the terminology layer (F M s d H W b z). */
  token: string;
}

export interface RelationshipPath {
  sourcePersonId: Id;
  targetPersonId: Id;
  /** Person ids from source to target, inclusive (normalised path). */
  personIds: Id[];
  steps: PathStep[];
  /** Idiomatic tokens, one per step (father's son -> brother). */
  tokens: string[];
  /** Tokens as the raw walk produced them, before collapsing. */
  rawTokens: string[];
  /** Person ids as the raw walk produced them, before collapsing. */
  rawPersonIds: Id[];
  /** Stored relationship rows on the path - used to highlight edges. */
  edgeIds: Id[];
  /** Shared-parent derivations used by the path, for the explanation. */
  derivedSiblingPairs: { siblingId: Id; otherId: Id; viaPersonId: Id }[];
}

export type RelationshipConfidence = "exact" | "general" | "uncertain";

export type RelationshipKind =
  | "self"
  | "lineal"
  | "collateral"
  | "affinal"
  | "mixed"
  | "unrelated";

/** Graph-derived classification - no cultural assumptions. */
export interface RelationshipClassification {
  kind: RelationshipKind;
  /** True when the path never uses a marriage bond. */
  bloodRelated: boolean;
  /** Generation of the target minus the source: +1 = one generation above. */
  generationDelta: number;
  direction: "up" | "down" | "lateral" | "mixed" | "none";
  /** True when the path passes through a marriage. */
  hasMarriage: boolean;
  /** True when the path uses a sibling bond (derived or asserted). */
  hasSiblingBond: boolean;
  /** True when every seniority-dependent term could be resolved from dates. */
  seniorityResolved: boolean;
}

/** One language's answer for a path. */
export interface RelationshipTermMatch {
  language: LanguageCode;
  /** Transliteration of the term, e.g. "chikkappa", "tamma". Null when the
   * graph does not carry enough information to name the relationship. */
  term: string | null;
  /** Native script, when the language has one. */
  script?: string | null;
  /** Plain-English meaning, e.g. "father's younger brother". */
  englishMeaning: string;
  /** Why this term applies, in the user's words. */
  explanation: string;
  /** Generations from the source to the target (+1 = one generation above). */
  generationDelta: number;
  confidence: RelationshipConfidence;
  /** Caveats: regional usage, dual senses, orthography. */
  note?: string;
  /** What the graph is missing for an exact term (e.g. "dates of birth"). */
  missingContext?: string;
  /** Id of the rule that produced this match (or "generated"/"unresolved"). */
  ruleId: string;
}

export type LanguageCode = "en" | "hi" | "kn";

export interface TermContext {
  /** Normalised token path, e.g. "Fb". */
  tokens: string[];
  /** The people along the path, source first: length === tokens.length + 1. */
  personIds: Id[];
  peopleById: Map<Id, { id: Id; name: string; gender: Gender; dateOfBirth?: string | null }>;
  /** Resolved seniority per base length: "elder" | "younger" | "unknown". */
  seniority: Seniority;
  targetGender: Gender;
  sourceGender: Gender;
}

export type Seniority = "elder" | "younger" | "unknown";

/**
 * The full, explainable result. This is what the Relationship Finder returns -
 * never just a label.
 */
export interface RelationshipResult {
  found: boolean;
  sourcePersonId: Id;
  targetPersonId: Id;
  sourceName: string;
  targetName: string;
  path: RelationshipPath | null;
  /** Graph-derived classification (lineal / collateral / affinal / mixed). */
  relationshipType: RelationshipClassification;
  /** The term for the requested language, or null when it cannot be asserted. */
  relationshipTerm: RelationshipTermMatch | null;
  /** Matches from every language, so nothing is hidden behind a setting. */
  terms: RelationshipTermMatch[];
  /** "Raghavendra is Aarav's son's son." - the source read against the target. */
  explanation: string;
  /** "Aarav is Raghavendra's grandson." - the reverse reading. */
  forwardExplanation: string;
  /** Which branch of the family the link runs through. */
  branchSummary: string;
  /** Path phrase with the target relative to the source: "son's son". */
  literal: string;
  /** Path phrase with the source relative to the target. */
  inverseLiteral: string;
  confidence: RelationshipConfidence;
  seniorityUnknown: boolean;
}

export const TOKEN_WORDS = {
  F: "father",
  M: "mother",
  H: "husband",
  W: "wife",
  s: "son",
  d: "daughter",
  b: "brother",
  z: "sister",
} as const;
