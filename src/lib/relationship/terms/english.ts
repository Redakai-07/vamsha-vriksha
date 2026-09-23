import type { TermGap, TermRule } from "./types";

/**
 * English vocabulary.
 *
 * English is the app's lingua franca, so it carries a general word for almost
 * every relationship. Where English only has a broad term ("uncle", "cousin")
 * the rule is marked `general`, and the *specific* relationship is still
 * spelled out in the meaning - the UI always shows the path as well as the
 * word, so "uncle" is never the whole answer.
 */

function en(
  id: string,
  tokens: string,
  term: string,
  englishMeaning: string,
  rest: Partial<TermRule> = {},
): TermRule {
  return { id, language: "en", tokens, term, englishMeaning, ...rest };
}

export const ENGLISH_RULES: TermRule[] = [
  // Immediate family.
  en("en.F", "F", "father", "father"),
  en("en.M", "M", "mother", "mother"),
  en("en.H", "H", "husband", "husband"),
  en("en.W", "W", "wife", "wife"),
  en("en.s", "s", "son", "son"),
  en("en.d", "d", "daughter", "daughter"),

  // Siblings - English happily says "brother" without knowing who is older.
  en("en.b.elder", "b", "elder brother", "brother who is older than you", {
    seniority: "elder",
    targetGender: "male",
  }),
  en("en.b.younger", "b", "younger brother", "brother who is younger than you", {
    seniority: "younger",
    targetGender: "male",
  }),
  en("en.b", "b", "brother", "brother (older or younger)", {
    targetGender: "male",
    confidence: "general",
  }),
  en("en.z.elder", "z", "elder sister", "sister who is older than you", {
    seniority: "elder",
    targetGender: "female",
  }),
  en("en.z.younger", "z", "younger sister", "sister who is younger than you", {
    seniority: "younger",
    targetGender: "female",
  }),
  en("en.z", "z", "sister", "sister (older or younger)", {
    targetGender: "female",
    confidence: "general",
  }),

  // Grandparents.
  en("en.FF", "FF", "grandfather (paternal)", "father's father"),
  en("en.FM", "FM", "grandmother (paternal)", "father's mother"),
  en("en.MF", "MF", "grandfather (maternal)", "mother's father"),
  en("en.MM", "MM", "grandmother (maternal)", "mother's mother"),

  // Parents' siblings and their spouses - broad English words.
  en("en.Fb.elder", "Fb", "father's elder brother", "father's elder brother", {
    seniority: "elder",
  }),
  en("en.Fb.younger", "Fb", "father's younger brother", "father's younger brother", {
    seniority: "younger",
  }),
  en("en.Fb", "Fb", "uncle (father's brother)", "father's brother", { confidence: "general" }),
  en("en.FbW", "FbW", "aunt (father's brother's wife)", "father's brother's wife", {
    confidence: "general",
  }),
  en("en.Fz", "Fz", "aunt (father's sister)", "father's sister", { confidence: "general" }),
  en("en.FzH", "FzH", "uncle (father's sister's husband)", "father's sister's husband", {
    confidence: "general",
  }),
  en("en.Mb", "Mb", "uncle (mother's brother)", "mother's brother", { confidence: "general" }),
  en("en.MbW", "MbW", "aunt (mother's brother's wife)", "mother's brother's wife", {
    confidence: "general",
  }),
  en("en.Mz", "Mz", "aunt (mother's sister)", "mother's sister", { confidence: "general" }),
  en("en.MzH", "MzH", "uncle (mother's sister's husband)", "mother's sister's husband", {
    confidence: "general",
  }),

  // Cousins - English merges all four branches into one word.
  ...(
    [
      ["Fbs", "father's brother's son", "male"],
      ["Fbd", "father's brother's daughter", "female"],
      ["Fzs", "father's sister's son", "male"],
      ["Fzd", "father's sister's daughter", "female"],
      ["Mbs", "mother's brother's son", "male"],
      ["Mbd", "mother's brother's daughter", "female"],
      ["Mzs", "mother's sister's son", "male"],
      ["Mzd", "mother's sister's daughter", "female"],
    ] as const
  ).map(([tokens, meaning, gender]) =>
    en(`en.${tokens}`, tokens, `cousin (${meaning})`, meaning, {
      targetGender: gender,
      confidence: "general",
      assumptions: `the cousin is ${gender === "male" ? "a man" : "a woman"}`,
    }),
  ),

  // Siblings' children.
  en("en.bs", "bs", "nephew (brother's son)", "brother's son", { targetGender: "male" }),
  en("en.bd", "bd", "niece (brother's daughter)", "brother's daughter", { targetGender: "female" }),
  en("en.zs", "zs", "nephew (sister's son)", "sister's son", { targetGender: "male" }),
  en("en.zd", "zd", "niece (sister's daughter)", "sister's daughter", { targetGender: "female" }),

  // Siblings-in-law.
  en("en.bW", "bW", "sister-in-law (brother's wife)", "brother's wife", {
    confidence: "general",
  }),
  en("en.zH", "zH", "brother-in-law (sister's husband)", "sister's husband", {
    confidence: "general",
  }),

  // Children-in-law.
  en("en.sW", "sW", "daughter-in-law", "son's wife"),
  en("en.dH", "dH", "son-in-law", "daughter's husband"),

  // Grandchildren.
  en("en.ss", "ss", "grandson (son's son)", "son's son"),
  en("en.sd", "sd", "granddaughter (son's daughter)", "son's daughter"),
  en("en.ds", "ds", "grandson (daughter's son)", "daughter's son"),
  en("en.dd", "dd", "granddaughter (daughter's daughter)", "daughter's daughter"),

  // In-laws of the couple.
  en("en.HF", "HF", "father-in-law", "spouse's father"),
  en("en.HM", "HM", "mother-in-law", "spouse's mother"),
  en("en.WF", "WF", "father-in-law", "wife's father"),
  en("en.WM", "WM", "mother-in-law", "wife's mother"),
  en("en.Hb", "Hb", "brother-in-law (husband's brother)", "husband's brother", {
    confidence: "general",
  }),
  en("en.Hz", "Hz", "sister-in-law (husband's sister)", "husband's sister", {
    confidence: "general",
  }),
  en("en.Wb", "Wb", "brother-in-law (wife's brother)", "wife's brother", {
    confidence: "general",
  }),
  en("en.Wz", "Wz", "sister-in-law (wife's sister)", "wife's sister", {
    confidence: "general",
  }),
  en("en.HbW", "HbW", "co-sister (husband's brother's wife)", "husband's brother's wife", {
    confidence: "general",
  }),
  en("en.HzH", "HzH", "co-brother (husband's sister's husband)", "husband's sister's husband", {
    confidence: "general",
  }),
];

export const ENGLISH_GAPS: TermGap[] = [];
