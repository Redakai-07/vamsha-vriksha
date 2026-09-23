import { buildFamilyGraph, type FamilyGraph } from "@/lib/domain/graph";
import { createRelationship } from "@/lib/domain/relationship";
import type { Gender, Person, Relationship, RelationshipType } from "@/lib/domain/types";

let personCounter = 0;

export function makePerson(partial: Partial<Person> & { name: string }): Person {
  personCounter += 1;
  return {
    id: partial.id ?? `p${personCounter}`,
    projectId: partial.projectId ?? "project",
    name: partial.name,
    displayName: partial.displayName,
    gender: (partial.gender ?? "unknown") as Gender,
    dateOfBirth: partial.dateOfBirth ?? null,
    dateOfDeath: partial.dateOfDeath ?? null,
    profilePhoto: null,
    notes: partial.notes,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

let relationshipCounter = 0;

export function makeRelationship(
  type: RelationshipType,
  fromPersonId: string,
  toPersonId: string,
  extra: Partial<Relationship> = {},
): Relationship {
  relationshipCounter += 1;
  return createRelationship(
    {
      projectId: "project",
      type,
      fromPersonId,
      toPersonId,
      ...extra,
    },
    `r${relationshipCounter}`,
  );
}

export function makeGraph(
  people: Person[],
  relationships: Relationship[],
): FamilyGraph {
  return buildFamilyGraph(people, relationships);
}

export function resetFixtures() {
  personCounter = 0;
  relationshipCounter = 0;
}
