"use client";

import { Plus, X } from "lucide-react";
import { useMemo } from "react";

import { KinshipTermBadge } from "@/components/kinship/KinshipTermBadge";
import { PersonAvatar } from "@/components/person/PersonAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  childrenOf,
  isExplicitSibling,
  parentsOf,
  siblingsOf,
  spousesOf,
  type FamilyGraph,
} from "@/lib/domain/graph";
import { SPOUSE_STATUS_LABELS } from "@/lib/domain/relationship";
import type { Id, KinshipSystemId, Person, Relationship } from "@/lib/domain/types";
import { describeRelationship } from "@/lib/relationship";
import { termView } from "@/lib/relationship/view";
import { languageForKinshipSystem } from "@/lib/relationship/terms";
import { cn } from "@/lib/utils/cn";

interface Entry {
  person: Person;
  relationship?: Relationship;
  note?: string;
}

export interface RelationshipsSectionProps {
  person: Person;
  graph: FamilyGraph;
  system: KinshipSystemId;
  showCulturalTerms: boolean;
  onAddRelationship(): void;
  onOpenPerson(personId: Id): void;
  onRemoveRelationship(relationship: Relationship): void;
  onHighlight(personId: Id): void;
}

/**
 * Every relative of this person, grouped the way a family thinks about itself
 * and labelled with the culturally correct term for *this* direction
 * (father's younger brother => chacha, husband's younger brother => devar).
 */
export function RelationshipsSection({
  person,
  graph,
  system,
  showCulturalTerms,
  onAddRelationship,
  onOpenPerson,
  onRemoveRelationship,
  onHighlight,
}: RelationshipsSectionProps) {
  const groups = useMemo(() => {
    const relationshipsFor = (otherId: Id, type?: Relationship["type"]): Relationship | undefined =>
      graph.relationships.find(
        (rel) =>
          (!type || rel.type === type) &&
          ((rel.fromPersonId === person.id && rel.toPersonId === otherId) ||
            (rel.fromPersonId === otherId && rel.toPersonId === person.id)),
      );

    const parents: Entry[] = parentsOf(graph, person.id).map((parent) => ({
      person: parent,
      relationship: relationshipsFor(parent.id, "parent"),
    }));

    const spouses: Entry[] = spousesOf(graph, person.id).map((spouse) => ({
      person: spouse,
      relationship: relationshipsFor(spouse.id, "spouse"),
    }));

    const children: Entry[] = childrenOf(graph, person.id).map((child) => ({
      person: child,
      relationship: relationshipsFor(child.id, "parent"),
    }));

    const siblings: Entry[] = siblingsOf(graph, person.id).map((sibling) => {
      const explicit = isExplicitSibling(graph, person.id, sibling.id);
      return {
        person: sibling,
        relationship: explicit ? relationshipsFor(sibling.id, "sibling") : undefined,
        note: explicit ? undefined : "via shared parents",
      };
    });

    const others: Entry[] = graph.relationships
      .filter(
        (rel) =>
          rel.type === "other" &&
          (rel.fromPersonId === person.id || rel.toPersonId === person.id),
      )
      .flatMap((rel): Entry[] => {
        const otherId = rel.fromPersonId === person.id ? rel.toPersonId : rel.fromPersonId;
        const other = graph.peopleById.get(otherId);
        if (!other) return [];
        return [{ person: other, relationship: rel, note: rel.label || "custom bond" }];
      });

    return [
      { key: "parents", label: "Parents", entries: parents },
      { key: "spouses", label: "Spouses & partners", entries: spouses },
      { key: "siblings", label: "Siblings", entries: siblings },
      { key: "children", label: "Children", entries: children },
      { key: "other", label: "Other relationships", entries: others },
    ];
  }, [graph, person.id]);

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-[15px] font-medium">Relationships</h3>
          <p className="text-[12px] text-muted-foreground">
            {total
              ? `${total} recorded relationship${total === 1 ? "" : "s"}`
              : "No relationships yet"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onAddRelationship}>
          <Plus /> Add
        </Button>
      </div>

      {total === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
          Connect this person to the rest of the family - parents, spouse, siblings or children.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.key} className="grid gap-2">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
            {group.entries.length > 0 && <span className="ml-1.5 opacity-70">{group.entries.length}</span>}
          </h4>

          {group.entries.length === 0 ? (
            <p className="pl-1 text-[12px] text-muted-foreground/70">None recorded</p>
          ) : (
            <ul className="grid gap-1">
              {group.entries.map((entry) => {
                const language = languageForKinshipSystem(system);
                const relation = describeRelationship(graph, person.id, entry.person.id, {
                  language,
                  maxDepth: 4,
                });
                const kinship = relation.found
                  ? termView(
                      relation.terms.find((term) => term.language === language) ?? null,
                      relation,
                      language,
                    )
                  : null;
                const status =
                  entry.relationship?.type === "spouse" && entry.relationship.status
                    ? SPOUSE_STATUS_LABELS[entry.relationship.status]
                    : undefined;

                return (
                  <li
                    key={`${group.key}-${entry.person.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-secondary/40"
                  >
                    <button
                      type="button"
                      className="shrink-0"
                      onClick={() => onOpenPerson(entry.person.id)}
                      aria-label={`Open ${entry.person.name}`}
                    >
                      <PersonAvatar person={entry.person} size="sm" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenPerson(entry.person.id)}
                        className="block max-w-full truncate text-left text-[13px] font-medium hover:underline"
                      >
                        {entry.person.displayName || entry.person.name}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {kinship ? (
                          <KinshipTermBadge view={kinship} showCultural={showCulturalTerms} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{entry.note}</span>
                        )}
                        {status && (
                          <Badge variant="spouse" className="ml-0.5">
                            {status}
                          </Badge>
                        )}
                        {entry.note && kinship && (
                          <span className="text-[11px] text-muted-foreground/80">{entry.note}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onHighlight(entry.person.id)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
                        "hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      Locate
                    </button>

                    {entry.relationship && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove relationship"
                        onClick={() => onRemoveRelationship(entry.relationship!)}
                      >
                        <X className="text-muted-foreground" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
