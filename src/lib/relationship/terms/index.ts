import type { KinshipSystemId } from "@/lib/domain/types";
import { generationDeltaOf } from "@/lib/relationship/classify";
import { compositionalEnglish } from "@/lib/relationship/explain";
import type {
  LanguageCode,
  RelationshipConfidence,
  RelationshipTermMatch,
  TermContext,
} from "@/lib/relationship/types";

import { ENGLISH_GAPS, ENGLISH_RULES } from "./english";
import { HINDI_GAPS, HINDI_RULES } from "./hindi";
import { KANNADA_GAPS, KANNADA_RULES } from "./kannada";
import type { TermGap, TermRule } from "./types";

export type { TermGap, TermRule } from "./types";

/**
 * The terminology registry.
 *
 * One place that knows kinship words. The resolver below turns a normalised
 * token path into a term - or refuses to, which is the important half:
 *
 *   exact      a rule matched with every fact it needs (gender, seniority).
 *   general    a broader word matched, or the term is a documented regional/
 *              secondary usage. Clearly flagged in the UI.
 *   uncertain  the path is known but no term can be asserted. The UI shows the
 *              graph-derived explanation instead of inventing a word.
 */

export const LANGUAGE_META: Record<
  LanguageCode,
  { name: string; native: string; note: string }
> = {
  en: { name: "English", native: "English", note: "Descriptive terms; always available." },
  hi: { name: "Hindi", native: "हिन्दी", note: "Devanagari with transliteration." },
  kn: { name: "Kannada", native: "ಕನ್ನಡ", note: "Kannada script with transliteration." },
};

export const LANGUAGE_RULES: Record<LanguageCode, TermRule[]> = {
  en: ENGLISH_RULES,
  hi: HINDI_RULES,
  kn: KANNADA_RULES,
};

export const LANGUAGE_GAPS: Record<LanguageCode, TermGap[]> = {
  en: ENGLISH_GAPS,
  hi: HINDI_GAPS,
  kn: KANNADA_GAPS,
};

export const ALL_LANGUAGES: LanguageCode[] = ["en", "hi", "kn"];

const KINSHIP_SYSTEM_LANGUAGE: Record<KinshipSystemId, LanguageCode> = {
  english: "en",
  hindi: "hi",
  kannada: "kn",
};

export function languageForKinshipSystem(system: KinshipSystemId | undefined): LanguageCode {
  return KINSHIP_SYSTEM_LANGUAGE[system ?? "english"] ?? "en";
}

export function languageName(language: LanguageCode): string {
  return LANGUAGE_META[language]?.name ?? language;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function genderAllows(rule: TermRule, ctx: TermContext): boolean {
  if (!rule.targetGender) return true;
  // Nothing to filter on: the path token already encodes the relative's gender.
  if (ctx.targetGender === "unknown") return true;
  return rule.targetGender === ctx.targetGender;
}

function pathLiteral(tokens: readonly string[]): string {
  return compositionalEnglish(tokens);
}

function withConfidence(match: RelationshipTermMatch, confidence: RelationshipConfidence): RelationshipTermMatch {
  return { ...match, confidence };
}

function unresolvedTerm(
  language: LanguageCode,
  ctx: TermContext,
  missingContext: string,
  extraExplanation?: string,
): RelationshipTermMatch {
  const literal = pathLiteral(ctx.tokens);
  const gap = LANGUAGE_GAPS[language].find((entry) => entry.tokens === ctx.tokens.join(""));
  const explanationBase = `The path is known from the family graph: ${literal}.`;
  return {
    language,
    term: null,
    script: null,
    englishMeaning: literal,
    confidence: "uncertain",
    explanation: extraExplanation
      ? `${explanationBase} ${extraExplanation}`
      : `${explanationBase} No ${languageName(language)} term is asserted for it.`,
    generationDelta: generationDeltaOf(ctx.tokens),
    missingContext,
    note: gap
      ? `${gap.reason}${gap.variants ? ` Some families say: ${gap.variants}.` : ""}`
      : undefined,
    ruleId: "unresolved",
  };
}

function ruleToMatch(rule: TermRule, ctx: TermContext): RelationshipTermMatch {
  const scriptNote = rule.script ? ` (${rule.script})` : "";
  return {
    language: rule.language,
    term: rule.term,
    script: rule.script ?? null,
    englishMeaning: rule.englishMeaning,
    confidence: rule.confidence ?? "exact",
    explanation:
      rule.explanation ??
      `"${rule.term}"${scriptNote} is the ${rule.englishMeaning}.`,
    generationDelta: generationDeltaOf(ctx.tokens),
    note: rule.note,
    ruleId: rule.id,
  };
}

/** The literal English path, used as the "general" tier where English has a word. */
function generatedEnglish(ctx: TermContext): RelationshipTermMatch {
  const literal = pathLiteral(ctx.tokens);
  return {
    language: "en",
    term: literal,
    script: null,
    englishMeaning: literal,
    confidence: "general",
    explanation: `Generated from the relationship path: ${literal}.`,
    generationDelta: generationDeltaOf(ctx.tokens),
    note: "no single English word; the path itself is the term",
    ruleId: "generated.en",
  };
}

function ancestorMatch(language: LanguageCode, ctx: TermContext): RelationshipTermMatch | null {
  const depth = ctx.tokens.length;
  const side = ctx.tokens[0] === "M" ? "maternal" : "paternal";
  const isFemale = ctx.tokens[depth - 1] === "M";
  const greats = Math.max(0, depth - 2);

  if (language === "en") {
    const prefix = "great-".repeat(Math.max(1, depth - 2));
    const term = `${prefix}${isFemale ? "grandmother" : "grandfather"} (${side})`;
    return {
      language,
      term,
      script: null,
      englishMeaning: `${depth} generations above, on the ${side} side`,
      confidence: "general",
      explanation: `Generated from the path: ${depth} generations above.`,
      generationDelta: depth,
      note: "generated term, not a single-word kinship noun",
      ruleId: "generated.ancestor",
    };
  }

  if (language === "hi") {
    const deva = isFemale ? (side === "maternal" ? "परनानी" : "परदादी") : side === "maternal" ? "परनाना" : "परदादा";
    const roman = isFemale ? (side === "maternal" ? "parnani" : "pardadi") : side === "maternal" ? "parnana" : "pardada";
    const prefix = "पर".repeat(Math.max(0, greats - 1));
    const romanPrefix = "par ".repeat(Math.max(0, greats - 1));
    return {
      language,
      term: `${romanPrefix}${roman}`.trim(),
      script: `${prefix}${deva}`,
      englishMeaning: `${depth} generations above, on the ${side} side`,
      confidence: "general",
      explanation: `Generated from the path: ${depth} generations above.`,
      generationDelta: depth,
      note: "generated term; पर- forms extend the same way",
      ruleId: "generated.ancestor",
    };
  }

  if (depth === 3) {
    return {
      language,
      term: isFemale ? "muttajji" : "muttajja",
      script: isFemale ? "ಮುತ್ತಜ್ಜಿ" : "ಮುತ್ತಜ್ಜ",
      englishMeaning: `${isFemale ? "great-grandmother" : "great-grandfather"} (${depth} generations above)`,
      confidence: "general",
      explanation: "Generated from the path: three generations above.",
      generationDelta: depth,
      note: "beyond muttajja / muttajji Kannada usage is not settled",
      ruleId: "generated.ancestor",
    };
  }

  return unresolvedTerm(
    language,
    ctx,
    "Kannada does not have a settled word this far up the line",
    `Kannada names this as an ancestor ${depth} generations above, but the app does not assert a single word for it.`,
  );
}

function descendantMatch(language: LanguageCode, ctx: TermContext): RelationshipTermMatch | null {
  if (!ctx.tokens.every((token) => token === "s" || token === "d")) return null;
  const depth = ctx.tokens.length;
  if (depth < 3) return null;
  const isFemale = ctx.tokens[depth - 1] === "d";

  if (language === "en") {
    return {
      language,
      term: `great-${"great-".repeat(depth - 3)}${isFemale ? "granddaughter" : "grandson"}`,
      script: null,
      englishMeaning: `${depth} generations below`,
      confidence: "general",
      explanation: `Generated from the path: ${depth} generations below.`,
      generationDelta: -depth,
      note: "generated term, not a single-word kinship noun",
      ruleId: "generated.descendant",
    };
  }

  if (language === "hi") {
    return {
      language,
      term: isFemale ? "padpoti" : "padpota",
      script: isFemale ? "पड़पोती" : "पड़पोता",
      englishMeaning: `${depth} generations below`,
      confidence: "general",
      explanation: `Generated from the path: ${depth} generations below.`,
      generationDelta: -depth,
      note: "generated term; पड़- forms extend the same way",
      ruleId: "generated.descendant",
    };
  }

  return unresolvedTerm(
    language,
    ctx,
    "Kannada does not have a settled word this far down the line",
    `Kannada names this as a descendant ${depth} generations below, but the app does not assert a single word for it.`,
  );
}

/** Resolves one language's term for a normalised token path. */
export function resolveTerm(language: LanguageCode, ctx: TermContext): RelationshipTermMatch {
  if (!ctx.tokens.length) {
    const selfTerm: Record<LanguageCode, { term: string; script?: string }> = {
      en: { term: "self" },
      hi: { term: "swayam", script: "स्वयं" },
      kn: { term: "swayam", script: "ಸ್ವಯಂ" },
    };
    const picked = selfTerm[language];
    return {
      language,
      term: picked.term,
      script: picked.script ?? null,
      englishMeaning: "the same person",
      confidence: "exact",
      explanation: "Same person.",
      generationDelta: 0,
      ruleId: "identity",
    };
  }

  const key = ctx.tokens.join("");
  const candidates = LANGUAGE_RULES[language].filter(
    (rule) => rule.tokens === key && genderAllows(rule, ctx),
  );

  if (candidates.length) {
    const variants = candidates.filter((rule) => rule.seniority);
    const neutral = candidates.find((rule) => !rule.seniority);

    if (variants.length) {
      if (ctx.seniority !== "unknown") {
        const exact = variants.find((rule) => rule.seniority === ctx.seniority);
        if (exact) return ruleToMatch(exact, ctx);
      }
      if (neutral) {
        return withConfidence(
          {
            ...ruleToMatch(neutral, ctx),
            note: [
              neutral.note,
              "birth dates are missing, so elder / younger could not be determined",
            ]
              .filter(Boolean)
              .join("; "),
            missingContext: "dates of birth (elder / younger)",
          },
          "general",
        );
      }
      return unresolvedTerm(
        language,
        ctx,
        "dates of birth (elder / younger)",
        `Which word applies depends on who is older, and no birth date on record settles it.`,
      );
    }

    if (neutral) return ruleToMatch(neutral, ctx);
    return ruleToMatch(candidates[0], ctx);
  }

  // Generated terms for deep ancestor / descendant lines.
  const ancestor = ctx.tokens.every((token) => token === "F" || token === "M")
    ? ancestorMatch(language, ctx)
    : null;
  if (ancestor) return ancestor;

  const descendant = descendantMatch(language, ctx);
  if (descendant) return descendant;

  if (language === "en") return generatedEnglish(ctx);

  return unresolvedTerm(language, ctx, "no term in this vocabulary for this path");
}

export function resolveTerms(ctx: TermContext, languages: readonly LanguageCode[] = ALL_LANGUAGES) {
  return languages.map((language) => resolveTerm(language, ctx));
}

export function pickTerm(
  matches: readonly RelationshipTermMatch[],
  language: LanguageCode,
): RelationshipTermMatch | null {
  return matches.find((match) => match.language === language) ?? null;
}

// ---------------------------------------------------------------------------
// Relationship guide
// ---------------------------------------------------------------------------

export interface TerminologyEntry {
  ruleId: string;
  language: LanguageCode;
  languageName: string;
  term: string;
  script?: string;
  englishMeaning: string;
  /** "father's brother" - the path in words. */
  pathPhrase: string;
  tokens: string;
  /** Example relationship path built from the tokens. */
  example: string;
  generationDelta: number;
  generationLabel: string;
  genderAssumption?: string;
  seniorityLabel?: string;
  confidence: RelationshipConfidence;
  note?: string;
  region?: string;
}

export interface TerminologyGapEntry {
  id: string;
  language: LanguageCode;
  languageName: string;
  tokens: string;
  pathPhrase: string;
  example: string;
  reason: string;
  variants?: string;
}

export function generationLabel(delta: number): string {
  if (delta === 0) return "same generation";
  const magnitude = Math.abs(delta);
  return `${magnitude} generation${magnitude === 1 ? "" : "s"} ${delta > 0 ? "above" : "below"}`;
}

function seniorityLabel(rule: TermRule): string | undefined {
  if (rule.seniority === "elder") return "the relative is older than the person the path branches from";
  if (rule.seniority === "younger") return "the relative is younger than the person the path branches from";
  return undefined;
}

export function toGuideEntry(rule: TermRule): TerminologyEntry {
  const pathPhrase = pathLiteral(rule.tokens.split(""));
  return {
    ruleId: rule.id,
    language: rule.language,
    languageName: languageName(rule.language),
    term: rule.term,
    script: rule.script,
    englishMeaning: rule.englishMeaning,
    pathPhrase,
    tokens: rule.tokens,
    example: `Person A is Person B's ${pathPhrase}.`,
    generationDelta: generationDeltaOf(rule.tokens.split("")),
    generationLabel: generationLabel(generationDeltaOf(rule.tokens.split(""))),
    genderAssumption: rule.targetGender
      ? rule.targetGender === "male"
        ? "the relative is male"
        : "the relative is female"
      : rule.assumptions,
    seniorityLabel: seniorityLabel(rule),
    confidence: rule.confidence ?? "exact",
    note: rule.note,
    region: rule.region,
  };
}

export function toGapEntry(gap: TermGap): TerminologyGapEntry {
  const pathPhrase = pathLiteral(gap.tokens.split(""));
  return {
    id: gap.id,
    language: gap.language,
    languageName: languageName(gap.language),
    tokens: gap.tokens,
    pathPhrase,
    example: `Person A is Person B's ${pathPhrase}.`,
    reason: gap.reason,
    variants: gap.variants,
  };
}

/** All guide entries, optionally for one language. */
export function listTerminology(language?: LanguageCode): TerminologyEntry[] {
  const languages = language ? [language] : ALL_LANGUAGES;
  return languages.flatMap((code) => LANGUAGE_RULES[code].map(toGuideEntry));
}

export function listTerminologyGaps(language?: LanguageCode): TerminologyGapEntry[] {
  const languages = language ? [language] : ALL_LANGUAGES;
  return languages.flatMap((code) => LANGUAGE_GAPS[code].map(toGapEntry));
}

/**
 * Free-text search over the guide: terms, transliterations, meanings, paths,
 * token strings, regions and notes. "mother's brother" and "Mb" both work.
 */
export function searchTerminology(
  query: string,
  options: { language?: LanguageCode; limit?: number } = {},
): TerminologyEntry[] {
  const limit = options.limit ?? 60;
  const needle = query.trim().toLowerCase();
  const entries = listTerminology(options.language);
  if (!needle) return entries.slice(0, limit);

  const normalised = needle.replace(/\s+/g, " ");
  const scored = entries
    .map((entry) => {
      const haystacks: [string, number][] = [
        [entry.term.toLowerCase(), 6],
        [(entry.script ?? "").toLowerCase(), 5],
        [entry.englishMeaning.toLowerCase(), 4],
        [entry.pathPhrase.toLowerCase(), 4],
        [entry.tokens.toLowerCase(), 3],
        [entry.note?.toLowerCase() ?? "", 2],
        [entry.region?.toLowerCase() ?? "", 1],
        [entry.languageName.toLowerCase(), 1],
      ];
      let score = 0;
      for (const [text, weight] of haystacks) {
        if (!text) continue;
        if (text === normalised) score += weight * 3;
        else if (text.includes(normalised)) score += weight * 2;
        else if (normalised.split(" ").every((part) => text.includes(part))) score += weight;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.tokens.length - b.entry.tokens.length);

  return scored.slice(0, limit).map((item) => item.entry);
}

/** Gaps matching a query - shown alongside results so silence is explained. */
export function searchTerminologyGaps(
  query: string,
  options: { language?: LanguageCode } = {},
): TerminologyGapEntry[] {
  const needle = query.trim().toLowerCase();
  const gaps = listTerminologyGaps(options.language);
  if (!needle) return gaps;
  return gaps.filter((gap) =>
    [gap.pathPhrase, gap.tokens, gap.reason, gap.variants ?? "", gap.languageName]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function findTermRules(tokens: string, language?: LanguageCode): TermRule[] {
  const languages = language ? [language] : ALL_LANGUAGES;
  return languages.flatMap((code) => LANGUAGE_RULES[code].filter((rule) => rule.tokens === tokens));
}
