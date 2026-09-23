"use client";

import {
  ArrowLeftRight,
  BookOpen,
  CornerDownRight,
  Highlighter,
  Info,
  SearchX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PathChain } from "@/components/kinship/PathChain";
import { PersonAvatar } from "@/components/person/PersonAvatar";
import { PersonCombobox } from "@/components/person/PersonCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, KinshipSystemId, Person } from "@/lib/domain/types";
import {
  describeClassification,
  describeRelationship,
  describeRelationshipAlternatives,
  languageForKinshipSystem,
  nearbyRelationships,
  type RelationshipResult,
} from "@/lib/relationship";
import { cn } from "@/lib/utils/cn";

export interface RelationshipFinderProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  people: Person[];
  graph: FamilyGraph;
  system: KinshipSystemId;
  showCulturalTerms: boolean;
  initialPersonId?: Id | null;
  onOpenPerson(personId: Id): void;
  /** Highlight the result's path on the canvas. */
  onHighlightPath?(result: RelationshipResult | null): void;
  onOpenGuide?(): void;
}

/**
 * "How are these two related?" - the list-driven entry point.
 *
 * The answer is never a bare label. It shows the classified link, the path the
 * engine walked (with every hop named and inferences marked), the term in every
 * supported language with its confidence, and the sentences that explain why.
 * A term the graph cannot support is withheld and said so, rather than shown as
 * a guess.
 */
export function RelationshipFinder({
  open,
  onOpenChange,
  people,
  graph,
  system,
  showCulturalTerms,
  initialPersonId,
  onOpenPerson,
  onHighlightPath,
  onOpenGuide,
}: RelationshipFinderProps) {
  const [fromId, setFromId] = useState<Id | null>(initialPersonId ?? null);
  const [toId, setToId] = useState<Id | null>(null);
  const [reversed, setReversed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFromId(initialPersonId ?? people[0]?.id ?? null);
    setToId(null);
    setReversed(false);
  }, [initialPersonId, open, people]);

  const primaryLanguage = languageForKinshipSystem(system);

  const subjectId = reversed ? toId : fromId;
  const targetId = reversed ? fromId : toId;

  const result = useMemo(() => {
    if (!subjectId || !targetId) return null;
    return describeRelationship(graph, subjectId, targetId, { language: primaryLanguage });
  }, [graph, primaryLanguage, subjectId, targetId]);

  const alternatives = useMemo(() => {
    if (!subjectId || !targetId) return [];
    return describeRelationshipAlternatives(graph, subjectId, targetId, {
      language: primaryLanguage,
      limit: 4,
    }).slice(1);
  }, [graph, primaryLanguage, subjectId, targetId]);

  const nearby = useMemo(() => {
    if (!fromId) return [];
    return nearbyRelationships(graph, fromId, { language: primaryLanguage, maxDepth: 3 }).slice(0, 24);
  }, [fromId, graph, primaryLanguage]);

  const from = people.find((person) => person.id === fromId) ?? null;
  const to = people.find((person) => person.id === toId) ?? null;
  const subject = reversed ? to : from;
  const target = reversed ? from : to;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Find a relationship</DialogTitle>
          <DialogDescription>
            The engine walks the recorded relationship facts - parent, spouse, and sibling links
            inferred from shared parents - and explains the path it took. It never reads the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="grid gap-1.5">
            <Label>First person</Label>
            <PersonCombobox
              people={people}
              value={fromId}
              onChange={setFromId}
              placeholder="Choose someone"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Swap direction"
            className="mb-0.5 hidden sm:inline-flex"
            onClick={() => setReversed((value) => !value)}
          >
            <ArrowLeftRight />
          </Button>
          <div className="grid gap-1.5">
            <Label>Second person</Label>
            <PersonCombobox
              people={people}
              value={toId}
              onChange={setToId}
              excludeIds={fromId ? [fromId] : []}
              placeholder="Choose someone"
            />
          </div>
        </div>

        {result && subject && target ? (
          <ResultCard
            result={result}
            graph={graph}
            subject={subject}
            target={target}
            primaryLanguage={primaryLanguage}
            showCulturalTerms={showCulturalTerms}
            alternatives={alternatives}
            onOpenPerson={onOpenPerson}
            onSwap={() => setReversed((value) => !value)}
            onHighlightPath={onHighlightPath}
            onOpenGuide={onOpenGuide}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <SearchX className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">
              {fromId && toId
                ? "No relationship path connects them - they may sit in separate lineages, or a connecting record is still missing."
                : "Choose two people to see how they are related."}
            </p>
          </div>
        )}

        {from && (
          <section className="grid gap-2">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Everyone related to {from.displayName || from.name}
            </h3>
            {nearby.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Nothing recorded around this person yet.
              </p>
            ) : (
              <ScrollArea className="max-h-52">
                <ul className="grid gap-0.5 pr-2">
                  {nearby.map((entry) => {
                    const person = graph.peopleById.get(
                      entry.path!.personIds[entry.path!.personIds.length - 1],
                    );
                    const term = entry.terms.find((item) => item.language === primaryLanguage);
                    if (!person) return null;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setToId(person.id);
                            setReversed(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/70",
                            toId === person.id && "bg-secondary/70",
                          )}
                        >
                          <PersonAvatar person={person} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px]">
                              {person.displayName || person.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {entry.literal}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-baseline gap-1.5">
                            {term?.term ? (
                              <>
                                {term.script && (
                                  <span
                                    className={cn(
                                      "text-[12.5px]",
                                      term.language === "hi" ? "font-devanagari" : "font-kannada",
                                    )}
                                  >
                                    {term.script}
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                  {term.term}
                                </span>
                              </>
                            ) : (
                              <Badge variant="muted">path only</Badge>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </section>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          A relationship reads differently from each side - flip it with the swap button. For the
          vocabulary itself, open the{" "}
          {onOpenGuide ? (
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              onClick={onOpenGuide}
            >
              relationship guide
            </button>
          ) : (
            "relationship guide"
          )}
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** The result block, shared in shape with the on-canvas finder bar. */
export function ResultCard({
  result,
  graph,
  subject,
  target,
  primaryLanguage,
  showCulturalTerms,
  alternatives,
  onOpenPerson,
  onSwap,
  onHighlightPath,
  onOpenGuide,
}: {
  result: RelationshipResult;
  graph: FamilyGraph;
  subject: Person;
  target: Person;
  primaryLanguage: ReturnType<typeof languageForKinshipSystem>;
  showCulturalTerms: boolean;
  alternatives: RelationshipResult[];
  onOpenPerson(personId: Id): void;
  onSwap(): void;
  onHighlightPath?(result: RelationshipResult | null): void;
  onOpenGuide?(): void;
}) {
  const primary = result.terms.find((term) => term.language === primaryLanguage) ?? null;

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-secondary/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {subject.displayName || subject.name} → {target.displayName || target.name}
          </p>
          <p className="mt-1 text-[13.5px] leading-snug text-foreground">{result.explanation}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onSwap}>
            <ArrowLeftRight /> Swap
          </Button>
          {onHighlightPath && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onHighlightPath(result)}
            >
              <Highlighter /> Highlight
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{describeClassification(result.relationshipType)}</Badge>
        {result.path && <Badge variant="muted">{result.path.steps.length} hops</Badge>}
        <Badge
          variant={
            result.confidence === "exact"
              ? "accent"
              : result.confidence === "general"
                ? "muted"
                : "outline"
          }
        >
          {result.confidence === "exact"
            ? "exact term"
            : result.confidence === "general"
              ? "general term"
              : "term not asserted"}
        </Badge>
      </div>

      {primary && (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {primary.script && primary.term ? (
              <span
                className={cn(
                  "text-[26px] leading-tight",
                  primary.language === "hi" ? "font-devanagari" : "font-kannada",
                )}
              >
                {primary.script}
              </span>
            ) : null}
            {showCulturalTerms && primary.term ? (
              <span className="font-display text-[19px] italic text-muted-foreground">
                {primary.term}
              </span>
            ) : null}
            {!primary.term && (
              <span className="text-[14px] text-foreground">
                {result.literal}
                <span className="ml-1.5 text-[11.5px] text-muted-foreground">
                  (no term asserted)
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-foreground">{primary.explanation}</p>
          {primary.missingContext && (
            <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Not enough recorded detail: {primary.missingContext}.
            </p>
          )}
          {primary.note && (
            <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {primary.note}
            </p>
          )}
        </div>
      )}

      <section className="grid gap-1.5">
        <h4 className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          How the engine got there
        </h4>
        {result.path && (
          <PathChain path={result.path} graph={graph} onOpenPerson={onOpenPerson} compact />
        )}
        <p className="text-[12px] text-foreground">{result.forwardExplanation}</p>
        {result.branchSummary && (
          <p className="text-[11.5px] leading-snug text-muted-foreground">{result.branchSummary}</p>
        )}
      </section>

      <section className="grid gap-1.5">
        <h4 className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          In every supported vocabulary
        </h4>
        <ul className="grid gap-1">
          {result.terms.map((term) => (
            <li
              key={term.language}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-2.5 py-1.5"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {term.language === "en" ? "English" : term.language === "hi" ? "Hindi" : "Kannada"}
                </span>
                {term.term ? (
                  <span className="flex min-w-0 items-baseline gap-2">
                    {term.script && (
                      <span
                        className={cn(
                          "text-[15px]",
                          term.language === "hi" ? "font-devanagari" : "font-kannada",
                        )}
                      >
                        {term.script}
                      </span>
                    )}
                    <span className="truncate text-[12.5px]">{term.term}</span>
                  </span>
                ) : (
                  <span className="truncate text-[12px] text-muted-foreground">
                    {term.englishMeaning} · path only
                  </span>
                )}
              </span>
              <Badge
                variant={term.confidence === "exact" ? "accent" : "muted"}
                className="shrink-0"
              >
                {term.confidence}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {alternatives.length > 0 && (
        <section className="grid gap-1.5">
          <h4 className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Other recorded connections
          </h4>
          <ul className="grid gap-1">
            {alternatives.map((alternative, index) => (
              <li
                key={`${alternative.path?.tokens.join("") ?? "alt"}-${index}`}
                className="flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <CornerDownRight className="size-3.5 shrink-0" />
                <span className="truncate">
                  also {alternative.literal} ({alternative.path?.steps.length} hops)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onOpenGuide && (
        <>
          <Separator />
          <Button type="button" variant="outline" size="sm" onClick={onOpenGuide}>
            <BookOpen /> Open the relationship guide
          </Button>
        </>
      )}
    </div>
  );
}

