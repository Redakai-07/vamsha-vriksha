import type { Gender } from "@/lib/domain/types";
import type { LanguageCode, RelationshipConfidence } from "@/lib/relationship/types";

/**
 * Terminology rules - one declarative table per language.
 *
 * A rule says: "when the normalised path is exactly these tokens, and the
 * relative is this gender and this seniority, the family word is X". The
 * resolver (see ./index.ts) matches rules against a path; nothing else in the
 * app contains kinship words, so a new language is a new file, not a rewrite.
 *
 * Two rules with the same tokens but different `seniority` are variants
 * (elder/younger brother). A variant-less rule that leaves `seniority` unset
 * makes the same claim for either, which is how a language offers a *general*
 * term when the birth dates are missing. When a language has no general form,
 * the resolver refuses to name the relationship instead of guessing.
 */
export interface TermRule {
  id: string;
  language: LanguageCode;
  /** Normalised token path, e.g. "Fb", "Fbs", "HF". */
  tokens: string;
  /** Transliteration / the word itself, e.g. "chikkappa", "tamma", "uncle". */
  term: string;
  /** Native script when the language writes one (Devanagari, Kannada). */
  script?: string;
  /** Plain English meaning, e.g. "father's younger brother". */
  englishMeaning: string;
  /** Gender the *relative* must have for this term to apply. */
  targetGender?: Gender;
  /** Seniority variant. Omitted/undefined rules apply to either. */
  seniority?: "elder" | "younger";
  /** Curated cultural caveat, surfaced to the user, never hidden. */
  note?: string;
  /** Longer "why this term" sentence for the guide and the result panel. */
  explanation?: string;
  /** Gender/age assumptions the term makes, for the guide. */
  assumptions?: string;
  /** Force a weaker confidence than "exact" (regional or secondary usage). */
  confidence?: RelationshipConfidence;
  /** Where the term is used, e.g. "Karnataka". */
  region?: string;
}

/** A relationship the terminology deliberately does NOT name, with the reason. */
export interface TermGap {
  id: string;
  language: LanguageCode;
  tokens: string;
  /** What families say instead, when anything is documented. */
  variants?: string;
  reason: string;
}
