"use client";

import { Crosshair, MoreHorizontal, Pencil, Share2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { BiodataSection } from "@/components/person/BiodataSection";
import { PersonAvatar } from "@/components/person/PersonAvatar";
import { RelationshipsSection } from "@/components/person/RelationshipsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { Biodata, Id, KinshipSystemId, Person, Relationship } from "@/lib/domain/types";
import { describeAge, formatLifespan, formatPartialDate } from "@/lib/utils/date";
import { GENDER_LABELS } from "@/lib/utils/person";

export interface PersonDetailsPanelProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  person: Person | null;
  biodata?: Biodata;
  graph: FamilyGraph;
  system: KinshipSystemId;
  showCulturalTerms: boolean;
  onEdit(): void;
  onCenter(): void;
  onSpotlight(): void;
  onDelete(): void;
  onAddRelationship(): void;
  onOpenPerson(personId: Id): void;
  onRemoveRelationship(relationship: Relationship): void;
  onExportPerson(): void;
}

/**
 * The details panel is a side sheet, never a modal: the canvas stays visible
 * behind it so the user keeps their place in the family while reading.
 */
export function PersonDetailsPanel({
  open,
  onOpenChange,
  person,
  biodata,
  graph,
  system,
  showCulturalTerms,
  onEdit,
  onCenter,
  onSpotlight,
  onDelete,
  onAddRelationship,
  onOpenPerson,
  onRemoveRelationship,
  onExportPerson,
}: PersonDetailsPanelProps) {
  const [tab, setTab] = useState("biodata");

  if (!person) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            No person selected.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const lifespan = formatLifespan(person.dateOfBirth ?? null, person.dateOfDeath ?? null);
  const age = describeAge(person.dateOfBirth ?? null, person.dateOfDeath ?? null);
  const deceased = Boolean(person.dateOfDeath);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[29rem] p-0">
        <header className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-start gap-4">
            <PersonAvatar person={person} size="lg" />

            <div className="min-w-0 flex-1 pt-0.5">
              <SheetTitle className="font-display text-[20px] leading-tight font-medium tracking-tight">
                {person.name}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-[12px]">
                {person.displayName ? `Known as ${person.displayName}` : GENDER_LABELS[person.gender]}
              </SheetDescription>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {lifespan && <Badge variant="muted">{lifespan}</Badge>}
                {age && <Badge variant="outline">{age}</Badge>}
                {deceased ? (
                  <Badge variant="outline">Remembered</Badge>
                ) : (
                  <Badge variant="sibling">Living</Badge>
                )}
                {biodata?.occupation && <Badge variant="accent">{biodata.occupation}</Badge>}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Person actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onCenter}>
                  <Crosshair /> Centre on canvas
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onSpotlight}>
                  <Sparkles /> Highlight lineage
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportPerson}>
                  <Share2 /> Export this person
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 /> Delete person
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-5 pt-4">
            <TabsList>
              <TabsTrigger value="biodata">Biodata</TabsTrigger>
              <TabsTrigger value="relationships">Relationships</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-5 py-5">
              <TabsContent value="biodata">
                <div className="grid gap-5">
                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-[12px]">
                    <Fact label="Born" value={formatPartialDate(person.dateOfBirth ?? null) || "Unknown"} />
                    <Fact label="Died" value={formatPartialDate(person.dateOfDeath ?? null) || "—"} />
                    <Fact label="Place of birth" value={biodata?.placeOfBirth || "Unknown"} />
                    <Fact label="Gender" value={GENDER_LABELS[person.gender]} />
                  </dl>
                  <BiodataSection person={person} biodata={biodata} />
                </div>
              </TabsContent>

              <TabsContent value="relationships">
                <RelationshipsSection
                  person={person}
                  graph={graph}
                  system={system}
                  showCulturalTerms={showCulturalTerms}
                  onAddRelationship={onAddRelationship}
                  onOpenPerson={onOpenPerson}
                  onRemoveRelationship={onRemoveRelationship}
                  onHighlight={onCenter}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={onCenter}>
            <Crosshair /> Locate
          </Button>
          <Button type="button" size="sm" className="flex-1" onClick={onAddRelationship}>
            Add relationship
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}
