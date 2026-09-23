"use client";

import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Crosshair,
  List,
  MousePointerClick,
  Sparkles,
  X,
} from "lucide-react";

import { PathChain } from "@/components/kinship/PathChain";
import { PersonAvatar } from "@/components/person/PersonAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id, KinshipSystemId } from "@/lib/domain/types";
import {
  describeClassification,
  type RelationshipResult,
} from "@/lib/relationship";
import { cn } from "@/lib/utils/cn";
import type { FinderState } from "@/stores/workspaceStore";

export interface RelationshipFinderBarProps {
  state: FinderState;
  graph: FamilyGraph;
  system: KinshipSystemId;
  showCulturalTerms: boolean;
  /** The computed result, when the user has asked for it. */
  result: RelationshipResult | null;
  /** Further recorded connections beyond the shortest path. */
  alternatives: RelationshipResult[];
  systemLanguageLabel: string;
  onCompute(): void;
  onSwap(): void;
  onClear(): void;
  onClose(): void;
  onOpenPerson(personId: Id): void;
  onFocusPath(): void;
  onOpenListPicker(): void;
  onOpenGuide(): void;
  className?: string;
}

/**
 * Relationship Finder mode.
 *
 * The flow the brief asks for: select person A on the canvas, ask for the
 * relationship, select person B, ask again - the engine then walks the graph,
 * highlights the whole path and explains it. Nothing is inferred from where the
 * nodes happen to sit.
 */
export function RelationshipFinderBar({
  state,
  graph,
  system,
  showCulturalTerms,
  result,
  alternatives,
  systemLanguageLabel,
  onCompute,
  onSwap,
  onClear,
  onClose,
  onOpenPerson,
  onFocusPath,
  onOpenListPicker,
  onOpenGuide,
  className,
}: RelationshipFinderBarProps) {
  const source = state.sourcePersonId ? graph.peopleById.get(state.sourcePersonId) : null;
  const target = state.targetPersonId ? graph.peopleById.get(state.targetPersonId) : null;
  const ready = Boolean(source && target);

  const instruction = !source
    ? "Click person A on the canvas."
    : !target
      ? `Now click person B - the other side of ${source.displayName || source.name}'s relationship.`
      : state.computed
        ? "Path highlighted on the canvas."
        : "Both chosen - ask for the relationship.";

  return (
    <div
      data-canvas-ui
      className={cn(
        "pointer-events-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-card/97 shadow-[0_18px_44px_-28px_rgba(15,10,30,0.55)] backdrop-blur-[2px]",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Crosshair className="size-3.5 text-accent" />
        <p className="text-[12px] font-medium">Relationship finder</p>
        <Badge variant="muted" className="ml-1">
          {systemLanguageLabel}
        </Badge>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close the relationship finder"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className="grid gap-2.5 px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
          {instruction}
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <Slot label="A" personId={state.sourcePersonId} graph={graph} onOpenPerson={onOpenPerson} />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Swap the two people"
            disabled={!ready}
            onClick={onSwap}
          >
            <ArrowLeftRight />
          </Button>
          <Slot label="B" personId={state.targetPersonId} graph={graph} onOpenPerson={onOpenPerson} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!ready}
            onClick={onCompute}
          >
            <Sparkles /> Find relationship
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onOpenListPicker}>
            <List /> Pick from a list
          </Button>
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={!source}>
            <X /> Clear
          </Button>
        </div>
      </div>

      {state.computed && result && (
        <div className="border-t border-border px-3 py-2.5">
          {result.confidence !== "exact" && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Check className="size-3" />
              {result.confidence === "general"
                ? "A general term applies here - see the notes."
                : "This relationship is unnamed: the path is shown instead of a term."}
            </p>
          )}

          <ScrollArea className="max-h-64">
            <div className="grid gap-2 pr-2">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {result.relationshipTerm?.script && result.relationshipTerm.term && (
                  <span
                    className={cn(
                      "text-[22px] leading-tight",
                      result.relationshipTerm.language === "hi" ? "font-devanagari" : "font-kannada",
                    )}
                  >
                    {result.relationshipTerm.script}
                  </span>
                )}
                {showCulturalTerms && result.relationshipTerm?.term ? (
                  <span className="font-display text-[17px] italic text-muted-foreground">
                    {result.relationshipTerm.term}
                  </span>
                ) : null}
                {!result.relationshipTerm?.term && (
                  <span className="text-[13px]">{result.literal}</span>
                )}
                <span className="flex-1" />
                <Badge
                  variant={
                    result.confidence === "exact"
                      ? "accent"
                      : result.confidence === "general"
                        ? "muted"
                        : "outline"
                  }
                >
                  {result.confidence}
                </Badge>
              </div>

              <p className="text-[12.5px] leading-snug">{result.explanation}</p>

              {result.path && (
                <PathChain
                  path={result.path}
                  graph={graph}
                  onOpenPerson={onOpenPerson}
                  compact
                />
              )}

              <p className="text-[11.5px] leading-snug text-muted-foreground">
                {describeClassification(result.relationshipType)}
                {/* Seniority only matters where the vocabulary distinguishes it,
                    which is exactly when the path uses a sibling link. */}
                {result.seniorityUnknown &&
                  result.relationshipType.hasSiblingBond &&
                  " · elder/younger not settled by the recorded dates"}
              </p>

              {result.branchSummary && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {result.branchSummary}
                </p>
              )}

              {result.relationshipTerm?.missingContext && (
                <p className="text-[11px] leading-snug text-accent">
                  Needs: {result.relationshipTerm.missingContext}.
                </p>
              )}

              {alternatives.length > 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Also connected: {alternatives.map((item) => item.literal).join(", ")}.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="outline" size="xs" onClick={onFocusPath}>
                  <Crosshair /> Frame the path
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={onOpenGuide}>
                  <BookOpen /> Relationship guide
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function Slot({
  label,
  personId,
  graph,
  onOpenPerson,
}: {
  label: "A" | "B";
  personId: Id | null;
  graph: FamilyGraph;
  onOpenPerson(personId: Id): void;
}) {
  const person = personId ? graph.peopleById.get(personId) : null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5",
        person ? "border-accent/45 bg-accent/6" : "border-dashed border-border",
      )}
    >
      {person ? (
        <>
          <button
            type="button"
            onClick={() => onOpenPerson(person.id)}
            className="shrink-0"
            aria-label={`Open ${person.name}`}
          >
            <PersonAvatar person={person} size="xs" />
          </button>
          <span className="min-w-0 flex-1 truncate text-[12px]">
            {person.displayName || person.name}
          </span>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          Waiting for a click…
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          person ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}
