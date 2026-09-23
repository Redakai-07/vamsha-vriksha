import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id } from "@/lib/domain/types";

import { childToken, directStep, parentToken, spouseToken } from "./primitives";
import type { PathStep } from "./types";

/**
 * Path normalisation.
 *
 * A breadth-first walk of the raw facts often produces a path that is correct
 * but not how a family would describe it - "father's wife" when that wife is
 * simply the mother, or "father's son" for a half-brother. Each rule below
 * rewrites one such pattern into the idiomatic hop, which is what makes the
 * generated term match what a family would actually say.
 *
 * Rules only fire when the graph *proves* the shortcut (the spouse really is a
 * parent, the two people really are siblings through a shared parent). Nothing
 * is assumed from names or positions.
 */

export interface NormalizedPath {
  personIds: Id[];
  tokens: string[];
  steps: PathStep[];
  /** What the traversal produced, before collapsing. Kept for transparency. */
  rawPersonIds: Id[];
  rawTokens: string[];
  /** Number of raw steps removed by collapsing (>= 0). */
  collapsedHops: number;
}

function isParentToken(token: string) {
  return token === "F" || token === "M";
}
function isChildToken(token: string) {
  return token === "s" || token === "d";
}
function isSpouseToken(token: string) {
  return token === "H" || token === "W";
}
function isSiblingToken(token: string) {
  return token === "b" || token === "z";
}

export function normalizePath(
  graph: FamilyGraph,
  rawPersonIds: readonly Id[],
  rawTokens: readonly string[],
): NormalizedPath {
  let tokens = [...rawTokens];
  let people = [...rawPersonIds];
  let changed = true;
  let guard = 0;

  const isParentOf = (parentId: Id, childId: Id) =>
    (graph.childrenOf.get(parentId) ?? []).includes(childId);
  const isSpouseOf = (a: Id, b: Id) => (graph.spousesOf.get(a) ?? []).includes(b);
  const genderOf = (id: Id | undefined) => graph.peopleById.get(id ?? "")?.gender;

  const drop = (index: number, replacement: string) => {
    tokens = [...tokens.slice(0, index), replacement, ...tokens.slice(index + 2)];
    people = [...people.slice(0, index + 1), ...people.slice(index + 2)];
    changed = true;
  };

  while (changed && guard < 64) {
    changed = false;
    guard += 1;

    for (let i = 0; i < tokens.length - 1; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      const junction = people[i + 2];
      if (!junction) continue;

      // parent -> child  ===  sibling (also covers half-siblings)
      if (isParentToken(a) && isChildToken(b)) {
        drop(i, b === "d" ? "z" : "b");
        break;
      }

      // parent -> their spouse  ===  the person's other parent
      if (isParentToken(a) && isSpouseToken(b) && isParentOf(junction, people[i])) {
        drop(i, parentToken(genderOf(junction)));
        break;
      }

      // child -> their parent  ===  spouse (when the two are recorded as married)
      if (isChildToken(a) && isParentToken(b) && isSpouseOf(junction, people[i])) {
        drop(i, spouseToken(genderOf(junction)));
        break;
      }

      // spouse -> child  ===  the person's own child
      if (isSpouseToken(a) && isChildToken(b) && isParentOf(people[i], junction)) {
        drop(i, childToken(genderOf(junction)));
        break;
      }

      // sibling -> shared parent  ===  the person's own parent
      if (isSiblingToken(a) && isParentToken(b) && isParentOf(junction, people[i])) {
        drop(i, parentToken(genderOf(junction)));
        break;
      }

      // sibling -> sibling  ===  sibling (sibling of my sibling is my sibling)
      if (isSiblingToken(a) && isSiblingToken(b)) {
        drop(i, b);
        break;
      }
    }
  }

  return {
    personIds: people,
    tokens,
    steps: rebuildSteps(graph, people, tokens),
    rawPersonIds: [...rawPersonIds],
    rawTokens: [...rawTokens],
    collapsedHops: Math.max(0, rawTokens.length - tokens.length),
  };
}

/**
 * Rebuilds explicit steps for a (possibly collapsed) person chain. Each step is
 * looked up in the graph so the UI can highlight the exact rows that make up
 * the path, and so derived sibling links keep naming their shared parent.
 */
export function rebuildSteps(
  graph: FamilyGraph,
  personIds: readonly Id[],
  tokens: readonly string[],
): PathStep[] {
  const steps: PathStep[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const fromPersonId = personIds[i];
    const toPersonId = personIds[i + 1];
    if (!fromPersonId || !toPersonId) continue;
    const step = directStep(graph, fromPersonId, toPersonId);
    if (step) {
      steps.push(step);
      continue;
    }
    // A collapsed hop that the graph cannot resolve directly (rare): keep the
    // token truthful and mark the step as derived rather than dropping it.
    steps.push({
      kind: tokenToKind(tokens[i]),
      fromPersonId,
      toPersonId,
      origin: "derived" as const,
      token: tokens[i],
    });
  }
  return steps;
}

function tokenToKind(token: string): PathStep["kind"] {
  if (isParentToken(token)) return "PARENT_OF";
  if (isChildToken(token)) return "CHILD_OF";
  if (isSpouseToken(token)) return "SPOUSE_OF";
  return "SIBLING_OF";
}
