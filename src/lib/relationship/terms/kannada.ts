import type { TermGap, TermRule } from "./types";

/**
 * Kannada vocabulary (Kannada script + English transliteration).
 *
 * Two ground rules here, because Kannada kinship is genuinely regional:
 *
 *  1. A term is only registered when it is in common use across Karnataka, and
 *     is marked `general` whenever it is a secondary sense or a regional form.
 *  2. Where families disagree, the relationship is deliberately left unnamed
 *     (`KANNADA_GAPS`) and the app shows the graph path instead of a term. The
 *     guide lists these gaps, so "not asserted" is visible information rather
 *     than a silent omission.
 */

function kn(
  id: string,
  tokens: string,
  roman: string,
  englishMeaning: string,
  rest: Partial<TermRule> = {},
): TermRule {
  return {
    id,
    language: "kn",
    tokens,
    term: roman,
    englishMeaning,
    region: "Karnataka",
    ...rest,
  };
}

export const KANNADA_RULES: TermRule[] = [
  // Immediate family - the terms every Kannada speaker uses.
  kn("kn.F", "F", "appa", "father", { script: "ಅಪ್ಪ" }),
  kn("kn.M", "M", "amma", "mother", { script: "ಅಮ್ಮ" }),
  kn("kn.H", "H", "ganda", "husband", { script: "ಗಂಡ" }),
  kn("kn.W", "W", "hendathi", "wife", { script: "ಹೆಂಡತಿ" }),
  kn("kn.s", "s", "maga", "son", { script: "ಮಗ" }),
  kn("kn.d", "d", "magalu", "daughter", { script: "ಮಗಳು" }),

  // Siblings - Kannada names a sibling by relative age, so these need dates.
  kn("kn.b.elder", "b", "anna", "elder brother", { script: "ಅಣ್ಣ", seniority: "elder" }),
  kn("kn.b.younger", "b", "tamma", "younger brother", { script: "ತಮ್ಮ", seniority: "younger" }),
  kn("kn.z.elder", "z", "akka", "elder sister", { script: "ಅಕ್ಕ", seniority: "elder" }),
  kn("kn.z.younger", "z", "thangi", "younger sister", { script: "ತಂಗಿ", seniority: "younger" }),

  // Grandparents - one pair of words covers both sides of the family.
  kn("kn.FF", "FF", "ajja", "grandfather", {
    script: "ಅಜ್ಜ",
    note: "Kannada uses ajja / ajji for both the father's and the mother's parents",
  }),
  kn("kn.FM", "FM", "ajji", "grandmother", { script: "ಅಜ್ಜಿ" }),
  kn("kn.MF", "MF", "ajja", "grandfather (mother's father)", { script: "ಅಜ್ಜ" }),
  kn("kn.MM", "MM", "ajji", "grandmother (mother's mother)", { script: "ಅಜ್ಜಿ" }),

  // Parents' siblings.
  kn("kn.Fb.elder", "Fb", "doddappa", "father's elder brother", {
    script: "ದೊಡ್ಡಪ್ಪ",
    seniority: "elder",
  }),
  kn("kn.Fb.younger", "Fb", "chikkappa", "father's younger brother", {
    script: "ಚಿಕ್ಕಪ್ಪ",
    seniority: "younger",
  }),
  kn("kn.Fz", "Fz", "atte", "father's sister", {
    script: "ಅತ್ತೆ",
    confidence: "general",
    note: "ಅತ್ತೆ is the everyday word for the father's sister in many families, and also the word for the mother-in-law",
  }),
  kn("kn.Mz.elder", "Mz", "doddamma", "mother's elder sister", {
    script: "ದೊಡ್ಡಮ್ಮ",
    seniority: "elder",
    confidence: "general",
  }),
  kn("kn.Mz.younger", "Mz", "chikkamma", "mother's younger sister", {
    script: "ಚಿಕ್ಕಮ್ಮ",
    seniority: "younger",
    confidence: "general",
  }),

  // Siblings-in-law.
  kn("kn.zH", "zH", "bhava", "sister's husband", {
    script: "ಭಾವ",
    confidence: "general",
    note: "ಭಾವ is also used for the husband's elder brother in some regions",
  }),

  // Children-in-law and grandchildren.
  kn("kn.sW", "sW", "sose", "son's wife", { script: "ಸೊಸೆ" }),
  kn("kn.dH", "dH", "aliya", "daughter's husband", { script: "ಅಳಿಯ" }),
  kn("kn.ss", "ss", "mommaga", "son's son", { script: "ಮೊಮ್ಮಗ" }),
  kn("kn.sd", "sd", "mommagalu", "son's daughter", { script: "ಮೊಮ್ಮಗಳು" }),
  kn("kn.ds", "ds", "mommaga", "daughter's son", {
    script: "ಮೊಮ್ಮಗ",
    note: "Kannada uses the same word for a grandchild through a son or a daughter",
  }),
  kn("kn.dd", "dd", "mommagalu", "daughter's daughter", { script: "ಮೊಮ್ಮಗಳು" }),

  // In-laws of the couple.
  kn("kn.HF", "HF", "mava", "spouse's father", {
    script: "ಮಾವ",
    note: "ಮಾವ means father-in-law; in some regions it is also used for the maternal uncle",
  }),
  kn("kn.HM", "HM", "atte", "spouse's mother", { script: "ಅತ್ತೆ" }),
  kn("kn.WF", "WF", "mava", "wife's father", { script: "ಮಾವ" }),
  kn("kn.WM", "WM", "atte", "wife's mother", { script: "ಅತ್ತೆ" }),
  kn("kn.Hb.younger", "Hb", "devara", "husband's younger brother", {
    script: "ದೇವರ",
    seniority: "younger",
    confidence: "general",
    note: "usage varies by region and family",
  }),
  kn("kn.Wb.younger", "Wb", "maiduna", "wife's younger brother", {
    script: "ಮೈದುನ",
    seniority: "younger",
    assumptions: "the wife's brother is younger than the wife",
  }),
  kn("kn.Wz.younger", "Wz", "mydini", "wife's younger sister", {
    seniority: "younger",
    confidence: "general",
    note: "local usage; ಸಾಲಿ (sāli) is also heard, and many families simply say thangi",
  }),
  kn("kn.Wz", "Wz", "sali", "wife's sister", {
    script: "ಸಾಲಿ",
    confidence: "general",
    note: "regional form; many families use thangi or akka instead",
  }),

  // Four generations.
  kn("kn.FFF", "FFF", "muttajja", "father's father's father", {
    script: "ಮುತ್ತಜ್ಜ",
    confidence: "general",
  }),
  kn("kn.FFM", "FFM", "muttajji", "father's father's mother", {
    script: "ಮುತ್ತಜ್ಜಿ",
    confidence: "general",
  }),
];

/**
 * Relationships Kannada-family usage does not let the app name confidently.
 * These are shown in the guide, and the Relationship Finder prints the path
 * explanation instead of a term.
 */
export const KANNADA_GAPS: TermGap[] = [
  {
    id: "kn.Mb.gap",
    language: "kn",
    tokens: "Mb",
    variants: "ಸೋದರಮಾವ (sōdaramāva) or ಮಾವ (māva), depending on the region",
    reason:
      "ಮಾವ is the standard word for the father-in-law, and its use for the mother's brother differs across Karnataka, so no term is asserted. The path (mother's brother) is shown instead.",
  },
  {
    id: "kn.Wb.elder.gap",
    language: "kn",
    tokens: "Wb",
    variants: "the elder brother of the wife is often addressed by name, or as ಅಣ್ಣ (aṇṇa)",
    reason:
      "ಮೈದುನ (maiduna) is specifically the wife's younger brother. Kannada does not have an equally settled word for her elder brother.",
  },
  {
    id: "kn.Hb.elder.gap",
    language: "kn",
    tokens: "Hb",
    variants: "ಅಣ್ಣ (aṇṇa) or ಭಾವ (bhāva), depending on the region",
    reason:
      "For the husband's elder brother the app found no single term used consistently enough to assert.",
  },
  {
    id: "kn.bW.gap",
    language: "kn",
    tokens: "bW",
    variants: "ಅತ್ತಿಗೆ (attige) in some regions",
    reason:
      "Words for the brother's wife vary widely between communities in Karnataka; the app shows the path instead of choosing one.",
  },
  {
    id: "kn.siblingChildren.gap",
    language: "kn",
    tokens: "bs",
    variants: "ಸೋದರಳಿಯ (sōdaraḷiya) for a sister's son in some regions",
    reason:
      "Nephew and niece have no single widely agreed Kannada term; the path (brother's son, sister's daughter, ...) is shown instead.",
  },
  {
    id: "kn.cousins.gap",
    language: "kn",
    tokens: "Fbs",
    variants: "the cousin is usually named through the parent's sibling: chikkappa's son, sōdarana maga",
    reason:
      "Kannada describes a cousin through the linking uncle or aunt rather than with one word, so the app spells the path out.",
  },
];
