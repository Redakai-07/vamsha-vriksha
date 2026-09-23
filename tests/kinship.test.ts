import { beforeEach, describe, expect, it } from "vitest";

import { describeRelationship, languageForKinshipSystem } from "@/lib/relationship";
import { termView } from "@/lib/relationship/view";
import { makeGraph, makePerson, makeRelationship, resetFixtures } from "./helpers";

beforeEach(resetFixtures);

/**
 * A dense north-Indian family, used to check the whole engine end to end:
 *
 *   dada + dadi ──┬── papa (1970) + maa (1972)
 *                 ├── tau (1965)
 *                 └── chacha (1978)
 *   papa ──┬── me (1995) + wife (1996)
 *   maa ───┘        └── son (2020)
 *   nana + nani ──┬── maa (1972)
 *                 └── mama (1968)
 *
 * Note that \u091b\u091a\u093e/chacha, tau, mama, devar and jeth all have to be derived - the
 * fixture stores only parent and spouse rows.
 */
function family() {
  const dada = makePerson({ name: "Dada", gender: "male", dateOfBirth: "1938" });
  const dadi = makePerson({ name: "Dadi", gender: "female", dateOfBirth: "1941" });
  const papa = makePerson({ name: "Papa", gender: "male", dateOfBirth: "1970" });
  const chacha = makePerson({ name: "Chacha", gender: "male", dateOfBirth: "1978" });
  const tau = makePerson({ name: "Tau", gender: "male", dateOfBirth: "1965" });
  const maa = makePerson({ name: "Maa", gender: "female", dateOfBirth: "1972" });
  const me = makePerson({ name: "Me", gender: "male", dateOfBirth: "1995" });
  const wife = makePerson({ name: "Wife", gender: "female", dateOfBirth: "1996" });
  const son = makePerson({ name: "Son", gender: "male", dateOfBirth: "2020" });
  const nana = makePerson({ name: "Nana", gender: "male", dateOfBirth: "1940" });
  const nani = makePerson({ name: "Nani", gender: "female", dateOfBirth: "1944" });
  const mama = makePerson({ name: "Mama", gender: "male", dateOfBirth: "1968" });

  const people = [dada, dadi, papa, chacha, tau, maa, me, wife, son, nana, nani, mama];

  const relationships = [
    makeRelationship("spouse", dada.id, dadi.id),
    makeRelationship("parent", dada.id, papa.id),
    makeRelationship("parent", dadi.id, papa.id),
    makeRelationship("parent", dada.id, chacha.id),
    makeRelationship("parent", dadi.id, chacha.id),
    makeRelationship("parent", dada.id, tau.id),
    makeRelationship("parent", dadi.id, tau.id),
    makeRelationship("spouse", papa.id, maa.id),
    makeRelationship("parent", papa.id, me.id),
    makeRelationship("parent", maa.id, me.id),
    makeRelationship("spouse", me.id, wife.id),
    makeRelationship("parent", me.id, son.id),
    makeRelationship("parent", wife.id, son.id),
    makeRelationship("spouse", nana.id, nani.id),
    makeRelationship("parent", nana.id, maa.id),
    makeRelationship("parent", nani.id, maa.id),
    makeRelationship("parent", nana.id, mama.id),
    makeRelationship("parent", nani.id, mama.id),
  ];

  return {
    people,
    relationships,
    dada,
    dadi,
    papa,
    chacha,
    tau,
    maa,
    me,
    wife,
    son,
    nana,
    nani,
    mama,
  };
}

type Family = ReturnType<typeof family>;

function graphOf(f: Family | ReturnType<typeof familyWithAunts>) {
  return makeGraph(f.people, f.relationships);
}

/** Hindi, as the project vocabulary. */
function hindi(graph: ReturnType<typeof graphOf>, from: string, to: string) {
  return describeRelationship(graph, from, to, { system: "hindi" });
}

/** Kannada, as the project vocabulary. */
function kannada(graph: ReturnType<typeof graphOf>, from: string, to: string) {
  return describeRelationship(graph, from, to, { system: "kannada" });
}

function familyWithAunts() {
  const f = family();
  const bhai = makePerson({ name: "Bhai", gender: "male", dateOfBirth: "1998" });
  const bahan = makePerson({ name: "Bahan", gender: "female", dateOfBirth: "2000" });
  const bhatija = makePerson({ name: "Bhatija", gender: "male", dateOfBirth: "2024" });
  const bhanja = makePerson({ name: "Bhanja", gender: "male", dateOfBirth: "2023" });
  const beti = makePerson({ name: "Beti", gender: "female", dateOfBirth: "2016" });
  const nati = makePerson({ name: "Nati", gender: "male", dateOfBirth: "2040" });
  const devar = makePerson({ name: "Devar", gender: "male", dateOfBirth: "1998" });
  const jeth = makePerson({ name: "Jeth", gender: "male", dateOfBirth: "1990" });

  const people = [...f.people, bhai, bahan, bhatija, bhanja, beti, nati, devar, jeth];
  const relationships = [
    ...f.relationships,
    makeRelationship("parent", f.papa.id, bhai.id),
    makeRelationship("parent", f.maa.id, bhai.id),
    makeRelationship("parent", f.papa.id, bahan.id),
    makeRelationship("parent", f.maa.id, bahan.id),
    makeRelationship("parent", bhai.id, bhatija.id),
    makeRelationship("parent", bahan.id, bhanja.id),
    makeRelationship("parent", f.me.id, beti.id),
    makeRelationship("parent", f.wife.id, beti.id),
    makeRelationship("parent", beti.id, nati.id),
    makeRelationship("parent", f.papa.id, devar.id),
    makeRelationship("parent", f.maa.id, devar.id),
    makeRelationship("parent", f.papa.id, jeth.id),
    makeRelationship("parent", f.maa.id, jeth.id),
  ];

  return { ...f, people, relationships, bhai, bahan, bhatija, bhanja, beti, nati, devar, jeth };
}

describe("relationship finding", () => {
  it("walks the records to find a path", () => {
    const f = family();
    const graph = graphOf(f);
    const result = describeRelationship(graph, f.me.id, f.dada.id);
    expect(result.found).toBe(true);
    expect(result.path?.tokens).toEqual(["F", "F"]);
    expect(result.relationshipType.kind).toBe("lineal");
  });

  it("reports no relationship for people in separate lineages", () => {
    const f = family();
    const stranger = makePerson({ name: "Stranger", gender: "other" });
    const graph = makeGraph([...f.people, stranger], f.relationships);
    const result = describeRelationship(graph, f.me.id, stranger.id);
    expect(result.found).toBe(false);
    expect(result.path).toBeNull();
  });

  it("recognises a person against themselves", () => {
    const f = family();
    const graph = graphOf(f);
    const result = describeRelationship(graph, f.me.id, f.me.id);
    expect(result.found).toBe(true);
    expect(result.relationshipType.kind).toBe("self");
    expect(result.literal).toBe("same person");
    expect(result.explanation).toContain("same person");
  });
});

describe("cultural kinship terms end to end", () => {
  it("names the immediate family", () => {
    const f = family();
    const graph = graphOf(f);

    expect(hindi(graph, f.me.id, f.papa.id).relationshipTerm?.term).toBe("pita");
    expect(hindi(graph, f.me.id, f.maa.id).relationshipTerm?.term).toBe("mata");
    expect(hindi(graph, f.me.id, f.wife.id).relationshipTerm?.term).toBe("patni");
    expect(hindi(graph, f.me.id, f.son.id).relationshipTerm?.term).toBe("putra");
  });

  it("distinguishes paternal and maternal grandparents", () => {
    const f = family();
    const graph = graphOf(f);

    expect(hindi(graph, f.me.id, f.dada.id).relationshipTerm?.term).toBe("dada");
    expect(hindi(graph, f.me.id, f.dadi.id).relationshipTerm?.term).toBe("dadi");
    expect(hindi(graph, f.me.id, f.nana.id).relationshipTerm?.term).toBe("nana");
    expect(hindi(graph, f.me.id, f.nani.id).relationshipTerm?.term).toBe("nani");

    // Kannada uses one pair of words for both sides of the family.
    expect(kannada(graph, f.me.id, f.dada.id).relationshipTerm?.term).toBe("ajja");
    expect(kannada(graph, f.me.id, f.nani.id).relationshipTerm?.term).toBe("ajji");
    expect(kannada(graph, f.me.id, f.dada.id).relationshipTerm?.note).toContain("both");
  });

  it("uses birth dates to choose between seniority variants", () => {
    const f = family();
    const graph = graphOf(f);

    const younger = hindi(graph, f.me.id, f.chacha.id);
    expect(younger.path?.tokens).toEqual(["F", "b"]);
    expect(younger.path?.steps[1].origin).toBe("derived");
    expect(younger.relationshipTerm?.term).toBe("chacha");
    expect(younger.literal).toBe("father's brother");

    const elder = hindi(graph, f.me.id, f.tau.id);
    expect(elder.relationshipTerm?.term).toBe("tau");

    // The same two uncles in Kannada.
    expect(kannada(graph, f.me.id, f.chacha.id).relationshipTerm?.term).toBe("chikkappa");
    expect(kannada(graph, f.me.id, f.chacha.id).relationshipTerm?.script).toBe("ಚಿಕ್ಕಪ್ಪ");
    expect(kannada(graph, f.me.id, f.tau.id).relationshipTerm?.term).toBe("doddappa");
  });

  it("names the maternal uncle in Hindi and refuses to guess in Kannada", () => {
    const f = family();
    const graph = graphOf(f);

    const mama = hindi(graph, f.me.id, f.mama.id);
    expect(mama.path?.tokens).toEqual(["M", "b"]);
    expect(mama.relationshipTerm?.term).toBe("mama");
    expect(mama.literal).toBe("mother's brother");

    const kannadaMama = kannada(graph, f.me.id, f.mama.id);
    expect(kannadaMama.relationshipTerm?.term).toBeNull();
    expect(kannadaMama.relationshipTerm?.confidence).toBe("uncertain");
    expect(kannadaMama.relationshipTerm?.explanation).toContain("mother's brother");
    expect(kannadaMama.relationshipTerm?.note).toContain("father-in-law");
    // English still has a general word, and says it is general.
    expect(kannadaMama.terms.find((term) => term.language === "en")?.term).toBe(
      "uncle (mother's brother)",
    );
  });

  it("names a brother's son as bhatija and a sister's son as bhanja", () => {
    const f = familyWithAunts();
    const graph = graphOf(f);

    const bhatija = hindi(graph, f.me.id, f.bhatija.id);
    expect(bhatija.path?.tokens).toEqual(["b", "s"]);
    expect(bhatija.relationshipTerm?.term).toBe("bhatija");

    const bhanja = hindi(graph, f.me.id, f.bhanja.id);
    expect(bhanja.path?.tokens).toEqual(["z", "s"]);
    expect(bhanja.relationshipTerm?.term).toBe("bhanja");
  });

  it("uses seniority terms for the husband's brothers, as his wife would", () => {
    const f = familyWithAunts();
    const graph = graphOf(f);

    const devar = hindi(graph, f.wife.id, f.devar.id);
    expect(devar.path?.tokens).toEqual(["H", "b"]);
    expect(devar.relationshipTerm?.term).toBe("devar");

    const jeth = hindi(graph, f.wife.id, f.jeth.id);
    expect(jeth.relationshipTerm?.term).toBe("jeth");

    // Kannada names the younger one and stays silent about the elder one.
    expect(kannada(graph, f.wife.id, f.devar.id).relationshipTerm?.term).toBe("devara");
    expect(kannada(graph, f.wife.id, f.jeth.id).relationshipTerm?.term).toBeNull();
  });

  it("names son's and daughter's children differently", () => {
    const f = familyWithAunts();
    const graph = graphOf(f);

    expect(hindi(graph, f.me.id, f.son.id).relationshipTerm?.term).toBe("putra");
    expect(hindi(graph, f.me.id, f.nati.id).relationshipTerm?.term).toBe("nati");
    expect(hindi(graph, f.me.id, f.nati.id).path?.tokens).toEqual(["d", "s"]);
  });

  it("refuses to guess seniority when birth dates are missing", () => {
    const me = makePerson({ name: "Me", gender: "male" });
    const pa = makePerson({ name: "Pa", gender: "male" });
    const dada = makePerson({ name: "Dada", gender: "male" });
    const dadi = makePerson({ name: "Dadi", gender: "female" });
    const uncle = makePerson({ name: "Uncle", gender: "male" });
    const graph = makeGraph(
      [me, pa, dada, dadi, uncle],
      [
        makeRelationship("parent", pa.id, me.id),
        makeRelationship("parent", dada.id, pa.id),
        makeRelationship("parent", dadi.id, pa.id),
        makeRelationship("parent", dada.id, uncle.id),
        makeRelationship("parent", dadi.id, uncle.id),
      ],
    );

    const result = describeRelationship(graph, me.id, uncle.id, { system: "hindi" });
    expect(result.seniorityUnknown).toBe(true);
    expect(result.literal).toBe("father's brother");
    expect(result.relationshipTerm?.term).toBeNull();
    expect(result.relationshipTerm?.missingContext).toContain("dates of birth");
    expect(result.confidence).toBe("uncertain");
  });

  it("generates ancestor terms beyond great-grandparents", () => {
    const people = [makePerson({ name: "G1", gender: "male" })];
    const relationships = [];
    for (let i = 0; i < 4; i += 1) {
      const child = makePerson({ name: `G${i + 2}`, gender: "male" });
      relationships.push(makeRelationship("parent", people[people.length - 1].id, child.id));
      people.push(child);
    }
    const graph = makeGraph(people, relationships);
    const result = describeRelationship(graph, people[people.length - 1].id, people[0].id, {
      system: "hindi",
    });

    expect(result.path?.tokens).toEqual(["F", "F", "F", "F"]);
    expect(result.terms.find((term) => term.language === "en")?.term).toContain(
      "great-great-grandfather",
    );
    expect(result.relationshipTerm?.script).toContain("पर");
  });
});

describe("relationship views for the UI", () => {
  it("gives every component the same honest shape", () => {
    const f = family();
    const graph = graphOf(f);
    const result = describeRelationship(graph, f.me.id, f.dada.id, { system: "kannada" });
    const view = termView(result.relationshipTerm, result, "kn");

    expect(view.term).toBe("ajja");
    expect(view.script).toBe("ಅಜ್ಜ");
    expect(view.literal).toBe("father's father");
    expect(view.confidence).toBe("exact");
    expect(view.explanation).toContain("ajja");
    expect(view.generationDelta).toBe(2);
  });

  it("maps a project vocabulary to a language code", () => {
    expect(languageForKinshipSystem("kannada")).toBe("kn");
    expect(languageForKinshipSystem("hindi")).toBe("hi");
    expect(languageForKinshipSystem("english")).toBe("en");
  });
});
