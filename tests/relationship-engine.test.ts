import { describe, expect, it } from "vitest";

import { buildFamilyGraph, type FamilyGraph } from "@/lib/domain/graph";
import type { Person, Relationship } from "@/lib/domain/types";
import { createRelationship } from "@/lib/domain/relationship";
import {
  describeRelationship,
  describeRelationshipAlternatives,
  languageForKinshipSystem,
  searchTerminology,
  searchTerminologyGaps,
} from "@/lib/relationship";
import { neighboursOf, sharedParentOf, stepKindForToken } from "@/lib/relationship/primitives";
import { findRawPath, findRawPaths, reverseRawPath } from "@/lib/relationship/traverse";
import { normalizePath } from "@/lib/relationship/normalize";
import { generationDeltaOf } from "@/lib/relationship/classify";
import { compositionalEnglish } from "@/lib/relationship/explain";
import { resolveTerm } from "@/lib/relationship/terms";
import type { TermContext } from "@/lib/relationship/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;
function person(
  name: string,
  gender: Person["gender"],
  dateOfBirth: string | null = null,
): Person {
  seq += 1;
  return {
    id: `p${seq}`,
    projectId: "proj",
    name,
    gender,
    dateOfBirth,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

interface Fixture {
  graph: FamilyGraph;
  people: Record<string, Person>;
}

/** Builds a graph: people plus parent/spouse / sibling tuples. */
function build(
  people: Record<string, Person>,
  bonds: (
    | { type: "parent" | "spouse" | "sibling"; from: string; to: string }
    | ["parent" | "spouse" | "sibling", string, string]
  )[] = [],
): Fixture {
  const ids: Record<string, string> = {};
  for (const [key, value] of Object.entries(people)) {
    ids[key] = value.id;
  }
  const relationships: Relationship[] = bonds.map((bond, index) => {
    const [type, from, to] = Array.isArray(bond)
      ? bond
      : [bond.type, bond.from, bond.to];
    return createRelationship(
      {
        projectId: "proj",
        type,
        fromPersonId: ids[from],
        toPersonId: ids[to],
      },
      `r${index}`,
    );
  });
  return {
    graph: buildFamilyGraph(Object.values(people), relationships),
    people,
  };
}

/**
 * A small three-generation family:
 *
 *   Rama ── Sita
 *     │
 *   ├── Krishna (son)  ── Radha
 *   └── Lakshmi (daughter)
 *
 *   Krishna ── Radha
 *     │
 *   └── Arjuna (son)
 */
function threeGenerationFamily(): Fixture {
  const people = {
    rama: person("Rama", "male", "1940-01-01"),
    sita: person("Sita", "female", "1944-01-01"),
    krishna: person("Krishna", "male", "1968-01-01"),
    lakshmi: person("Lakshmi", "female", "1971-01-01"),
    radha: person("Radha", "female", "1970-01-01"),
    arjuna: person("Arjuna", "male", "1996-01-01"),
  };
  return build(people, [
    ["parent", "rama", "krishna"],
    ["parent", "sita", "krishna"],
    ["parent", "rama", "lakshmi"],
    ["parent", "sita", "lakshmi"],
    ["spouse", "krishna", "radha"],
    ["parent", "krishna", "arjuna"],
    ["parent", "radha", "arjuna"],
  ]);
}

// ---------------------------------------------------------------------------
// Primitive facts
// ---------------------------------------------------------------------------

describe("primitive relationship facts", () => {
  it("derives siblinghood from a shared parent without storing a sibling row", () => {
    const { graph, people } = threeGenerationFamily();
    expect(graph.relationships.some((rel) => rel.type === "sibling")).toBe(false);
    expect(graph.siblingsOf.get(people.krishna.id)).toContain(people.lakshmi.id);
    expect(sharedParentOf(graph, people.krishna.id, people.lakshmi.id)).toBe(people.rama.id);
  });

  it("marks a derived sibling step as derived and names the shared parent", () => {
    const { graph, people } = threeGenerationFamily();
    const sibling = neighboursOf(graph, people.krishna.id).find(
      (neighbour) => neighbour.personId === people.lakshmi.id,
    );
    expect(sibling).toBeDefined();
    expect(sibling?.kind).toBe("SIBLING_OF");
    expect(sibling?.origin).toBe("derived");
    expect(sibling?.viaPersonId).toBe(people.rama.id);
  });

  it("uses an asserted sibling bond only when no parent justifies the link", () => {
    const people = {
      a: person("A", "female"),
      b: person("B", "male"),
    };
    const { graph } = build(people, [["sibling", "a", "b"]]);
    const sibling = neighboursOf(graph, people.a.id).find(
      (neighbour) => neighbour.personId === people.b.id,
    );
    expect(sibling?.kind).toBe("SIBLING_OF");
    expect(sibling?.origin).toBe("stored");
    expect(sibling?.viaPersonId).toBeUndefined();
  });

  it("keeps child and parent tokens gender-aware", () => {
    expect(stepKindForToken("M")).toBe("PARENT_OF");
    expect(stepKindForToken("d")).toBe("CHILD_OF");
    expect(stepKindForToken("W")).toBe("SPOUSE_OF");
    expect(stepKindForToken("b")).toBe("SIBLING_OF");
  });
});

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

describe("path finding", () => {
  it("finds the shortest path downwards through a marriage", () => {
    const { graph, people } = threeGenerationFamily();
    const raw = findRawPath(graph, people.rama.id, people.arjuna.id);
    expect(raw).not.toBeNull();
    // Rama -> Krishna (son) -> Arjuna (son): two steps, no marriage needed.
    expect(raw?.tokens).toEqual(["s", "s"]);
  });

  it("protects against cycles in parent links", () => {
    const people = { a: person("A", "male"), b: person("B", "male") };
    // Deliberately contradictory data: a is b's parent and b is a's parent.
    const { graph } = build(people, [
      ["parent", "a", "b"],
      ["parent", "b", "a"],
    ]);
    const raw = findRawPath(graph, people.a.id, people.b.id);
    expect(raw?.tokens.length).toBe(1);
    // The reverse direction must also terminate, not loop forever.
    expect(findRawPath(graph, people.b.id, people.a.id)?.tokens.length).toBe(1);
  });

  it("returns null for people who are not connected", () => {
    const people = { a: person("A", "male"), b: person("B", "female") };
    const { graph } = build(people);
    expect(findRawPath(graph, people.a.id, people.b.id)).toBeNull();
  });

  it("enumerates several distinct paths, shortest first", () => {
    // Radha is both Arjuna's mother and, through her sister, a relative twice over.
    const people = {
      radha: person("Radha", "female"),
      meera: person("Meera", "female"),
      arjuna: person("Arjuna", "male"),
    };
    const { graph } = build(people, [
      ["parent", "radha", "arjuna"],
      ["sibling", "radha", "meera"],
      ["parent", "meera", "arjuna"],
    ]);
    const paths = findRawPaths(graph, people.radha.id, people.arjuna.id, { limit: 3 });
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths[0].tokens.length).toBeLessThanOrEqual(paths[1].tokens.length);
  });

  it("reads a path backwards with re-derived tokens", () => {
    const { graph, people } = threeGenerationFamily();
    const raw = findRawPath(graph, people.krishna.id, people.arjuna.id);
    expect(raw).not.toBeNull();
    const reversed = reverseRawPath(graph, raw!);
    expect(reversed.personIds[0]).toBe(people.arjuna.id);
    expect(reversed.tokens).toEqual(["F"]);
  });

  it("yields no tokens for the same person", () => {
    const { graph, people } = threeGenerationFamily();
    expect(findRawPath(graph, people.rama.id, people.rama.id)?.tokens).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

describe("path normalisation", () => {
  it("collapses father -> son into a sibling when the graph proves it", () => {
    const { graph, people } = threeGenerationFamily();
    // Lakshmi -> Rama (F) -> Krishna (s): mother's... father's son.
    const raw = { personIds: [people.lakshmi.id, people.rama.id, people.krishna.id], tokens: ["F", "s"] };
    const normalized = normalizePath(graph, raw.personIds, raw.tokens);
    expect(normalized.tokens).toEqual(["b"]);
    expect(normalized.personIds).toEqual([people.lakshmi.id, people.krishna.id]);
  });

  it("collapses wife -> child into the person's own child", () => {
    const { graph, people } = threeGenerationFamily();
    // Krishna -> Radha (W) -> Arjuna (s) becomes "son".
    const raw = {
      personIds: [people.krishna.id, people.radha.id, people.arjuna.id],
      tokens: ["W", "s"],
    };
    expect(normalizePath(graph, raw.personIds, raw.tokens).tokens).toEqual(["s"]);
  });

  it("keeps a stepmother as father -> wife when she is not the parent", () => {
    const people = {
      father: person("Father", "male"),
      stepmother: person("Stepmother", "female"),
      child: person("Child", "male"),
      mother: person("Mother", "female"),
    };
    const { graph } = build(people, [
      ["parent", "father", "child"],
      ["parent", "mother", "child"],
      ["spouse", "father", "stepmother"],
    ]);
    // Walk: child -> father (F) -> father's wife (W). Because the wife is not a
    // parent of the child, this must NOT collapse into "M".
    const normalized = normalizePath(
      graph,
      [people.child.id, people.father.id, people.stepmother.id],
      ["F", "W"],
    );
    expect(normalized.tokens).toEqual(["F", "W"]);
  });

  it("rebuilds steps that point at the stored rows", () => {
    const { graph, people } = threeGenerationFamily();
    const normalized = normalizePath(
      graph,
      [people.lakshmi.id, people.rama.id, people.krishna.id],
      ["F", "s"],
    );
    expect(normalized.steps).toHaveLength(1);
    expect(normalized.steps[0].kind).toBe("SIBLING_OF");
    expect(normalized.steps[0].origin).toBe("derived");
    expect(normalized.steps[0].viaPersonId).toBe(people.rama.id);
  });
});

// ---------------------------------------------------------------------------
// Classification + explanation
// ---------------------------------------------------------------------------

describe("classification", () => {
  it("counts generations up and down", () => {
    expect(generationDeltaOf(["F"])).toBe(1);
    expect(generationDeltaOf(["s", "s"])).toBe(-2);
    expect(generationDeltaOf(["M", "b", "s"])).toBe(0);
    expect(generationDeltaOf(["W"])).toBe(0);
  });

  it("classifies each kind of family link", () => {
    const { graph, people } = threeGenerationFamily();

    const lineal = describeRelationship(graph, people.rama.id, people.arjuna.id);
    expect(lineal.relationshipType.kind).toBe("lineal");
    expect(lineal.relationshipType.generationDelta).toBe(-2);
    expect(lineal.relationshipType.bloodRelated).toBe(true);

    const collateral = describeRelationship(graph, people.krishna.id, people.lakshmi.id);
    expect(collateral.relationshipType.kind).toBe("collateral");
    expect(collateral.relationshipType.hasSiblingBond).toBe(true);

    const affinal = describeRelationship(graph, people.rama.id, people.radha.id);
    expect(affinal.relationshipType.hasMarriage).toBe(true);
    expect(["affinal", "mixed"]).toContain(affinal.relationshipType.kind);
  });

  it("says so when there is no path", () => {
    const people = { a: person("A", "male"), b: person("B", "female") };
    const { graph } = build(people);
    const result = describeRelationship(graph, people.a.id, people.b.id);
    expect(result.found).toBe(false);
    expect(result.path).toBeNull();
    expect(result.confidence).toBe("uncertain");
    expect(result.relationshipType.kind).toBe("unrelated");
    expect(result.explanation).toContain("No relationship path");
  });
});

describe("explanation", () => {
  it("spells the path out in words, both ways round", () => {
    const { graph, people } = threeGenerationFamily();
    const result = describeRelationship(graph, people.arjuna.id, people.lakshmi.id);
    // Arjuna -> Krishna (F) -> Lakshmi (z): father's sister.
    expect(result.literal).toBe("father's sister");
    expect(result.explanation).toBe("Arjuna is Lakshmi's brother's son.");
    expect(result.forwardExplanation).toBe("Lakshmi is Arjuna's father's sister.");
  });

  it("mentions the branch the link runs through", () => {
    const { graph, people } = threeGenerationFamily();
    const result = describeRelationship(graph, people.rama.id, people.radha.id);
    expect(result.branchSummary).toContain("leaves Rama");
    expect(result.branchSummary).toContain("marriage");
  });

  it("names the shared parent behind an inferred sibling link", () => {
    const { graph, people } = threeGenerationFamily();
    const result = describeRelationship(graph, people.krishna.id, people.lakshmi.id);
    expect(result.branchSummary).toContain("inferred from their shared parent");
    expect(result.branchSummary).toContain("Rama");
  });

  it("compositional English handles one and many steps", () => {
    expect(compositionalEnglish([])).toBe("self");
    expect(compositionalEnglish(["M"])).toBe("mother");
    expect(compositionalEnglish(["M", "b", "s"])).toBe("mother's brother's son");
  });

  it("exposes the paths for highlighting", () => {
    const { graph, people } = threeGenerationFamily();
    const result = describeRelationship(graph, people.rama.id, people.radha.id);
    expect(result.path?.personIds.length).toBeGreaterThan(1);
    expect(result.path?.edgeIds.length).toBeGreaterThan(0);
    expect(result.path?.steps.every((step) => result.path?.personIds.includes(step.fromPersonId))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Terminology
// ---------------------------------------------------------------------------

function contextFor(
  tokens: string[],
  people: { id: string; name: string; gender: Person["gender"]; dateOfBirth?: string | null }[],
  seniority: TermContext["seniority"] = "unknown",
): TermContext {
  const peopleById: TermContext["peopleById"] = new Map();
  for (const entry of people) {
    peopleById.set(entry.id, {
      id: entry.id,
      name: entry.name,
      gender: entry.gender,
      dateOfBirth: entry.dateOfBirth ?? null,
    });
  }
  return {
    tokens,
    personIds: people.map((entry) => entry.id),
    peopleById,
    seniority,
    targetGender: people[people.length - 1]?.gender ?? "unknown",
    sourceGender: people[0]?.gender ?? "unknown",
  };
}

describe("terminology resolution", () => {
  const male = { id: "m", name: "M", gender: "male" as const };
  const female = { id: "f", name: "F", gender: "female" as const };

  it("resolves exact terms when the path is fully known", () => {
    const father = resolveTerm("en", contextFor(["F"], [male, male]));
    expect(father.term).toBe("father");
    expect(father.confidence).toBe("exact");

    const kannadaMother = resolveTerm("kn", contextFor(["M"], [male, female]));
    expect(kannadaMother.term).toBe("amma");
    expect(kannadaMother.script).toBe("ಅಮ್ಮ");
    expect(kannadaMother.confidence).toBe("exact");

    const hindiMother = resolveTerm("hi", contextFor(["M"], [male, female]));
    expect(hindiMother.term).toBe("mata");
    expect(hindiMother.script).toBe("माता");
  });

  it("picks the elder/younger variant when a birth date settles it", () => {
    const older = resolveTerm("kn", contextFor(["b"], [male, male], "elder"));
    const younger = resolveTerm("kn", contextFor(["b"], [male, male], "younger"));
    expect(older.term).toBe("anna");
    expect(younger.term).toBe("tamma");
    expect(older.script).toBe("ಅಣ್ಣ");
    expect(younger.script).toBe("ತಮ್ಮ");
    expect(older.confidence).toBe("exact");
  });

  it("falls back to a general word when seniority is unknown but one exists", () => {
    const brother = resolveTerm("en", contextFor(["b"], [male, male], "unknown"));
    expect(brother.term).toBe("brother");
    expect(brother.confidence).toBe("general");
    expect(brother.note).toContain("elder / younger");

    const hindiBrother = resolveTerm("hi", contextFor(["b"], [male, male], "unknown"));
    expect(hindiBrother.term).toBe("bhai");
    expect(hindiBrother.confidence).toBe("general");
  });

  it("refuses to name a relationship the data cannot settle", () => {
    // Kannada has no neutral word for the father's brother: doddappa vs chikkappa.
    const kannadaUncle = resolveTerm("kn", contextFor(["F", "b"], [male, male, male], "unknown"));
    expect(kannadaUncle.term).toBeNull();
    expect(kannadaUncle.confidence).toBe("uncertain");
    expect(kannadaUncle.missingContext).toContain("dates of birth");
    expect(kannadaUncle.explanation).toContain("father's brother");

    const hindiUncle = resolveTerm("hi", contextFor(["F", "b"], [male, male, male], "unknown"));
    expect(hindiUncle.term).toBeNull();
    expect(hindiUncle.englishMeaning).toBe("father's brother");
  });

  it("marks secondary and regional usages as general, never exact", () => {
    const atthe = resolveTerm("kn", contextFor(["F", "z"], [male, male, female]));
    expect(atthe.term).toBe("atte");
    expect(atthe.confidence).toBe("general");
    expect(atthe.note).toContain("mother-in-law");

    const motherInLaw = resolveTerm("kn", contextFor(["W", "M"], [male, female, female]));
    expect(motherInLaw.term).toBe("atte");
    expect(motherInLaw.confidence).toBe("exact");
  });

  it("names the Kannada in-law terms from the graph", () => {
    const fatherInLaw = resolveTerm("kn", contextFor(["W", "F"], [male, female, male]));
    expect(fatherInLaw.term).toBe("mava");
    expect(fatherInLaw.script).toBe("ಮಾವ");

    const wifeYoungerBrother = resolveTerm(
      "kn",
      contextFor(["W", "b"], [male, female, male], "younger"),
    );
    expect(wifeYoungerBrother.term).toBe("maiduna");
    expect(wifeYoungerBrother.script).toBe("ಮೈದುನ");

    const wifeYoungerSister = resolveTerm(
      "kn",
      contextFor(["W", "z"], [male, female, female], "younger"),
    );
    expect(wifeYoungerSister.term).toBe("mydini");
    expect(wifeYoungerSister.confidence).toBe("general");
  });

  it("explains every term it returns", () => {
    const match = resolveTerm("kn", contextFor(["s"], [male, male]));
    expect(match.explanation).toContain("maga");
    expect(match.explanation).toContain("son");
    expect(match.generationDelta).toBe(-1);
  });

  it("generates deep ancestor terms instead of giving up", () => {
    const greatGreat = resolveTerm(
      "en",
      contextFor(["F", "F", "F"], [male, male, male, male]),
    );
    expect(greatGreat.term).toContain("great-grandfather");

    const kannadaGreat = resolveTerm("kn", contextFor(["F", "F", "F"], [male, male, male, male]));
    expect(kannadaGreat.term).toBe("muttajja");

    const farUp = resolveTerm(
      "kn",
      contextFor(["F", "F", "F", "F"], [male, male, male, male, male]),
    );
    expect(farUp.confidence).toBe("uncertain");
    expect(farUp.term).toBeNull();
  });

  it("resolves English broad words as general, with the path as the meaning", () => {
    const uncle = resolveTerm("en", contextFor(["M", "b"], [male, female, male]));
    expect(uncle.term).toBe("uncle (mother's brother)");
    expect(uncle.confidence).toBe("general");
    expect(uncle.englishMeaning).toBe("mother's brother");
  });
});

describe("describeRelationship terminology", () => {
  it("returns a term for every supported language, plus the requested one", () => {
    const { graph, people } = threeGenerationFamily();
    const result = describeRelationship(graph, people.krishna.id, people.rama.id, {
      language: "kn",
    });
    expect(result.relationshipTerm?.language).toBe("kn");
    expect(result.relationshipTerm?.term).toBe("appa");
    expect(result.terms.map((term) => term.language).sort()).toEqual(["en", "hi", "kn"]);
    expect(result.confidence).toBe("exact");
  });

  it("reports uncertainty through the result, not as a fake term", () => {
    // Two brothers with no dates: Hindi/Kannada terms need seniority.
    const people = {
      a: person("A", "male"),
      b: person("B", "male"),
      c: person("C", "male"),
    };
    const { graph } = build(people, [
      ["parent", "a", "b"],
      ["parent", "a", "c"],
    ]);
    const result = describeRelationship(graph, people.b.id, people.c.id, { language: "kn" });
    expect(result.path?.tokens).toEqual(["b"]);
    expect(result.relationshipTerm?.confidence).toBe("uncertain");
    expect(result.relationshipTerm?.term).toBeNull();
    expect(result.confidence).toBe("uncertain");
    expect(result.seniorityUnknown).toBe(true);
    // The English reading is still available.
    expect(result.terms.find((term) => term.language === "en")?.term).toBe("brother");
  });

  it("uses birth dates to resolve seniority when they exist", () => {
    const people = {
      father: person("Father", "male", "1940-01-01"),
      elder: person("Elder", "male", "1965-01-01"),
      younger: person("Younger", "male", "1972-01-01"),
    };
    const { graph } = build(people, [
      ["parent", "father", "elder"],
      ["parent", "father", "younger"],
    ]);
    const result = describeRelationship(graph, people.younger.id, people.elder.id, {
      language: "kn",
    });
    expect(result.path?.tokens).toEqual(["b"]);
    expect(result.seniorityUnknown).toBe(false);
    expect(result.relationshipTerm?.term).toBe("anna");
    expect(result.relationshipTerm?.confidence).toBe("exact");
  });

  it("maps a project's vocabulary to a language", () => {
    expect(languageForKinshipSystem("kannada")).toBe("kn");
    expect(languageForKinshipSystem("hindi")).toBe("hi");
    expect(languageForKinshipSystem(undefined)).toBe("en");
  });

  it("lists alternative relationship paths when a family is connected twice", () => {
    const people = {
      radha: person("Radha", "female"),
      meera: person("Meera", "female"),
      arjuna: person("Arjuna", "male"),
    };
    const { graph } = build(people, [
      ["parent", "radha", "arjuna"],
      ["sibling", "radha", "meera"],
      ["parent", "meera", "arjuna"],
    ]);
    const alternatives = describeRelationshipAlternatives(
      graph,
      people.radha.id,
      people.arjuna.id,
      { limit: 3 },
    );
    expect(alternatives.length).toBeGreaterThanOrEqual(2);
    expect(alternatives[0].path!.tokens.length).toBeLessThanOrEqual(
      alternatives[1].path!.tokens.length,
    );
  });
});

describe("relationship guide data", () => {
  it("searches by meaning, transliteration and path", () => {
    const byMeaning = searchTerminology("mother's brother");
    expect(byMeaning.some((entry) => entry.tokens === "Mb")).toBe(true);

    const byTerm = searchTerminology("chikkappa");
    expect(byTerm[0].tokens).toBe("Fb");
    expect(byTerm[0].language).toBe("kn");

    const byScript = searchTerminology("ಅಮ್ಮ");
    expect(byScript[0].term).toBe("amma");
  });

  it("carries the facts the guide needs to be trustworthy", () => {
    const [entry] = searchTerminology("tamma");
    expect(entry.term).toBe("tamma");
    expect(entry.englishMeaning).toBe("younger brother");
    expect(entry.pathPhrase).toBe("brother");
    expect(entry.generationLabel).toBe("same generation");
    expect(entry.seniorityLabel).toContain("younger");
    expect(entry.example).toContain("Person A is Person B's");
  });

  it("documents the relationships it refuses to name", () => {
    const gaps = searchTerminologyGaps("mother's brother");
    expect(gaps.some((gap) => gap.language === "kn")).toBe(true);
    expect(gaps[0].reason.length).toBeGreaterThan(20);
  });
});
