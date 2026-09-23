import type { TermGap, TermRule } from "./types";

/**
 * Hindi vocabulary (Devanagari + transliteration).
 *
 * Hindi distinguishes seniority for some relationships and not others. Where a
 * neutral word exists (भाई / बहन) it is registered as a `general` rule, so an
 * unknown birth date degrades to a truthful word instead of a guess. Where
 * Hindi has no neutral word (ताऊ vs चाचा, जेठ vs देवर) there is no such rule,
 * and the resolver reports an uncertain term.
 */

function hi(
  id: string,
  tokens: string,
  roman: string,
  deva: string,
  englishMeaning: string,
  rest: Partial<TermRule> = {},
): TermRule {
  return { id, language: "hi", tokens, term: roman, script: deva, englishMeaning, ...rest };
}

export const HINDI_RULES: TermRule[] = [
  // Immediate family.
  hi("hi.F", "F", "pita", "पिता", "father", { note: "पापा / बाप are the everyday forms" }),
  hi("hi.M", "M", "mata", "माता", "mother", { note: "माँ is the everyday form" }),
  hi("hi.H", "H", "pati", "पति", "husband"),
  hi("hi.W", "W", "patni", "पत्नी", "wife"),
  hi("hi.s", "s", "putra", "पुत्र", "son", { note: "बेटा is the everyday form" }),
  hi("hi.d", "d", "putri", "पुत्री", "daughter", { note: "बेटी is the everyday form" }),

  // Siblings.
  hi("hi.b.elder", "b", "bade bhai", "बड़े भाई", "elder brother", { seniority: "elder" }),
  hi("hi.b.younger", "b", "chhote bhai", "छोटे भाई", "younger brother", { seniority: "younger" }),
  hi("hi.b", "b", "bhai", "भाई", "brother", { confidence: "general" }),
  hi("hi.z.elder", "z", "didi", "दीदी", "elder sister", { seniority: "elder" }),
  hi("hi.z.younger", "z", "chhoti bahan", "छोटी बहन", "younger sister", { seniority: "younger" }),
  hi("hi.z", "z", "bahan", "बहन", "sister", { confidence: "general" }),

  // Grandparents.
  hi("hi.FF", "FF", "dada", "दादा", "father's father"),
  hi("hi.FM", "FM", "dadi", "दादी", "father's mother"),
  hi("hi.MF", "MF", "nana", "नाना", "mother's father"),
  hi("hi.MM", "MM", "nani", "नानी", "mother's mother"),

  // Parents' siblings.
  hi("hi.Fb.elder", "Fb", "tau", "ताऊ", "father's elder brother", { seniority: "elder" }),
  hi("hi.Fb.younger", "Fb", "chacha", "चाचा", "father's younger brother", { seniority: "younger" }),
  hi("hi.FbW.elder", "FbW", "tai", "ताई", "wife of the father's elder brother", { seniority: "elder" }),
  hi("hi.FbW.younger", "FbW", "chachi", "चाची", "wife of the father's younger brother", {
    seniority: "younger",
  }),
  hi("hi.Fz", "Fz", "bua", "बुआ", "father's sister"),
  hi("hi.FzH", "FzH", "phupha", "फूफा", "father's sister's husband"),
  hi("hi.Mb", "Mb", "mama", "मामा", "mother's brother"),
  hi("hi.MbW", "MbW", "mami", "मामी", "mother's brother's wife"),
  hi("hi.Mz", "Mz", "mausi", "मौसी", "mother's sister"),
  hi("hi.MzH", "MzH", "mausa", "मौसा", "mother's sister's husband"),

  // Cousins.
  hi("hi.Fbs", "Fbs", "chachera bhai", "चचेरा भाई", "father's brother's son", { targetGender: "male" }),
  hi("hi.Fbd", "Fbd", "chacheri bahan", "चचेरी बहन", "father's brother's daughter", {
    targetGender: "female",
  }),
  hi("hi.Fzs", "Fzs", "phuphera bhai", "फुफेरा भाई", "father's sister's son", { targetGender: "male" }),
  hi("hi.Fzd", "Fzd", "phupheri bahan", "फुफेरी बहन", "father's sister's daughter", {
    targetGender: "female",
  }),
  hi("hi.Mbs", "Mbs", "mamera bhai", "ममेरा भाई", "mother's brother's son", { targetGender: "male" }),
  hi("hi.Mbd", "Mbd", "mameri bahan", "ममेरी बहन", "mother's brother's daughter", {
    targetGender: "female",
  }),
  hi("hi.Mzs", "Mzs", "mausera bhai", "मौसेरा भाई", "mother's sister's son", { targetGender: "male" }),
  hi("hi.Mzd", "Mzd", "mauseri bahan", "मौसेरी बहन", "mother's sister's daughter", {
    targetGender: "female",
  }),

  // Siblings' children.
  hi("hi.bs", "bs", "bhatija", "भतीजा", "brother's son", { targetGender: "male" }),
  hi("hi.bd", "bd", "bhatiji", "भतीजी", "brother's daughter", { targetGender: "female" }),
  hi("hi.zs", "zs", "bhanja", "भांजा", "sister's son", { targetGender: "male" }),
  hi("hi.zd", "zd", "bhanji", "भांजी", "sister's daughter", { targetGender: "female" }),

  // Siblings-in-law.
  hi("hi.bW", "bW", "bhabhi", "भाभी", "brother's wife"),
  hi("hi.zH", "zH", "bahanoi", "बहनोई", "sister's husband"),

  // Children-in-law.
  hi("hi.sW", "sW", "bahu", "बहू", "son's wife"),
  hi("hi.dH", "dH", "damad", "दामाद", "daughter's husband"),

  // Grandchildren.
  hi("hi.ss", "ss", "pota", "पोता", "son's son", { targetGender: "male" }),
  hi("hi.sd", "sd", "poti", "पोती", "son's daughter", { targetGender: "female" }),
  hi("hi.ds", "ds", "nati", "नाती", "daughter's son", { targetGender: "male" }),
  hi("hi.dd", "dd", "natin", "नातिन", "daughter's daughter", { targetGender: "female" }),

  // In-laws of the couple.
  hi("hi.HF", "HF", "sasur", "ससुर", "spouse's father"),
  hi("hi.HM", "HM", "saas", "सास", "spouse's mother"),
  hi("hi.WF", "WF", "sasur", "ससुर", "wife's father"),
  hi("hi.WM", "WM", "saas", "सास", "wife's mother"),
  hi("hi.Hb.elder", "Hb", "jeth", "जेठ", "husband's elder brother", { seniority: "elder" }),
  hi("hi.Hb.younger", "Hb", "devar", "देवर", "husband's younger brother", { seniority: "younger" }),
  hi("hi.HbW.elder", "HbW", "jethani", "जेठानी", "husband's elder brother's wife", {
    seniority: "elder",
  }),
  hi("hi.HbW.younger", "HbW", "devrani", "देवरानी", "husband's younger brother's wife", {
    seniority: "younger",
  }),
  hi("hi.Hz", "Hz", "nanad", "ननद", "husband's sister"),
  hi("hi.Wb", "Wb", "sala", "साला", "wife's brother", {
    note: "साला covers the wife's brother whether older or younger",
  }),
  hi("hi.Wz", "Wz", "sali", "साली", "wife's sister", {
    note: "साली covers the wife's sister whether older or younger",
  }),

  // Three generations up / down.
  hi("hi.FFF", "FFF", "pardada", "परदादा", "father's father's father"),
  hi("hi.FFM", "FFM", "pardadi", "परदादी", "father's father's mother"),
  hi("hi.sss", "sss", "padpota", "पड़पोता", "son's son's son"),
  hi("hi.ssd", "ssd", "padpoti", "पड़पोती", "son's son's daughter"),
];

export const HINDI_GAPS: TermGap[] = [
  {
    id: "hi.Fb.gap",
    language: "hi",
    tokens: "Fb",
    variants: "ताऊ (tau) when elder, चाचा (chacha) when younger",
    reason:
      "Hindi has no neutral word for the father's brother: the term depends on whether he is older or younger than your father. Add birth dates to get an exact term.",
  },
  {
    id: "hi.Hb.gap",
    language: "hi",
    tokens: "Hb",
    variants: "जेठ (jeth) when elder, देवर (devar) when younger",
    reason:
      "The husband's brother is named by his seniority relative to the husband; without birth dates the term cannot be chosen.",
  },
];
