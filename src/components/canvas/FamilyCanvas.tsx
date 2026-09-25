"use client";

import { X } from "lucide-react";

import { CanvasDock } from "@/components/canvas/CanvasDock";
import { EdgeLayer } from "@/components/canvas/EdgeLayer";
import {
  FirstPersonWelcome,
  WELCOME_HEIGHT,
  WELCOME_WIDTH,
} from "@/components/canvas/FirstPersonWelcome";
import { Minimap } from "@/components/canvas/Minimap";
import { NodeQuickActions, type RelationshipDraftMode } from "@/components/canvas/NodeQuickActions";
import { PersonNode, type NodeRelationshipCounts } from "@/components/canvas/PersonNode";
import { StructureLayer } from "@/components/canvas/StructureLayer";
import { Button } from "@/components/ui/button";
import { type NodeRects } from "@/lib/canvas/geometry";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { RelativeIntent } from "@/lib/domain/relativeIntent";
import { INTENT_META } from "@/lib/domain/relativeIntent";
import type { Id, Person, Point } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import type { RelationshipDraft } from "@/stores/workspaceStore";

export interface FamilyCanvasProps {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  gridRef: React.RefObject<HTMLDivElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  surfaceProps: React.ComponentProps<"div">;
  people: Person[];
  graph: FamilyGraph;
  rects: NodeRects;
  positions: Map<Id, Point>;
  countsByPerson: Map<Id, NodeRelationshipCounts>;
  selectedPersonId: Id | null;
  hoveredPersonId: Id | null;
  spotlightPersonId: Id | null;
  draft: RelationshipDraft | null;
  showMinimap: boolean;
  surfaceSize: { width: number; height: number };
  /** Bonds already implied by another record - drawn dotted. */
  impliedRelationshipIds: Set<string>;
  /** Relationship Finder: the path being explained, if any. */
  finderPath: {
    personIds: Set<Id>;
    relationshipIds: Set<Id>;
    sourcePersonId: Id | null;
    targetPersonId: Id | null;
  } | null;
  /** True while the finder is open, so nodes invite a click. */
  finderPicking: boolean;
  onIntent(personId: Id, intent: RelativeIntent, mode: RelationshipDraftMode): void;
  onSelectPerson(personId: Id): void;
  onOpenDetails(personId: Id): void;
  onRemoveRelationship(relationshipId: string): void;
  onMovePerson(personId: Id, position: Point): void;
  onHoverPerson(personId: Id | null): void;
  onCreateFirstPerson(): void;
  onCancelDraft(): void;
  onMinimapJump(point: Point): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  /** Recentre the camera on whoever is selected, if anyone is. */
  onFocusSelected(): void;
  focusTargetAvailable: boolean;
  onTidyUp(): void;
  onToggleMinimap(): void;
  isEmptyProject: boolean;
  /** Generation plates behind the rows (a reading aid, toggleable). */
  showStructure?: boolean;
  /**
   * One short, dismissible pointer for someone who has just added their first
   * person. Contextual help instead of a manual.
   */
  coachMark?: { title: string; body: string } | null;
  onDismissCoachMark?(): void;
}

/**
 * The canvas view. It is pure presentation and gestures - every piece of state
 * it shows comes from props, and every action leaves through a callback, which
 * keeps the graph engine, the database and the DOM independent of each other.
 */
export function FamilyCanvas({
  surfaceRef,
  gridRef,
  layerRef,
  surfaceProps,
  people,
  graph,
  rects,
  positions,
  countsByPerson,
  selectedPersonId,
  hoveredPersonId,
  spotlightPersonId,
  draft,
  showMinimap,
  surfaceSize,
  impliedRelationshipIds,
  finderPath,
  finderPicking,
  onIntent,
  onSelectPerson,
  onOpenDetails,
  onRemoveRelationship,
  onMovePerson,
  onHoverPerson,
  onCreateFirstPerson,
  onCancelDraft,
  onMinimapJump,
  onZoomIn,
  onZoomOut,
  onFit,
  onFocusSelected,
  focusTargetAvailable,
  onTidyUp,
  onToggleMinimap,
  isEmptyProject,
  showStructure = true,
  coachMark = null,
  onDismissCoachMark,
}: FamilyCanvasProps) {
  const emphasised = new Set<Id>();
  if (finderPath) {
    for (const id of finderPath.personIds) emphasised.add(id);
    if (finderPath.sourcePersonId) emphasised.add(finderPath.sourcePersonId);
    if (finderPath.targetPersonId) emphasised.add(finderPath.targetPersonId);
  }
  if (spotlightPersonId) {
    emphasised.add(spotlightPersonId);
    for (const id of graph.parentsOf.get(spotlightPersonId) ?? []) emphasised.add(id);
    for (const id of graph.childrenOf.get(spotlightPersonId) ?? []) emphasised.add(id);
    for (const id of graph.spousesOf.get(spotlightPersonId) ?? []) emphasised.add(id);
    for (const id of graph.siblingsOf.get(spotlightPersonId) ?? []) emphasised.add(id);
  }
  if (selectedPersonId) emphasised.add(selectedPersonId);

  /*
   * Intelligence, not decoration: whoever the user is studying (hovered wins
   * over selected, so brushing across the canvas previews families) brings
   * their parents, spouse, children and siblings forward and lets the rest of
   * the tree step back. The finder and the lineage spotlight own dimming while
   * they are active, so this only fills the gap where nothing else is guiding
   * the eye.
   */
  const focusPersonId = hoveredPersonId ?? selectedPersonId;
  const guiding = Boolean(finderPath) || Boolean(spotlightPersonId);
  const neighbourhood = new Set<Id>();
  if (focusPersonId && !guiding && !draft) {
    neighbourhood.add(focusPersonId);
    const parents = graph.parentsOf.get(focusPersonId) ?? [];
    for (const id of parents) neighbourhood.add(id);
    for (const id of graph.childrenOf.get(focusPersonId) ?? []) neighbourhood.add(id);
    for (const id of graph.spousesOf.get(focusPersonId) ?? []) neighbourhood.add(id);
    for (const id of graph.siblingsOf.get(focusPersonId) ?? []) neighbourhood.add(id);
    // A parent's spouse belongs to the same circle: someone standing under a
    // couple would otherwise see the other parent fade out, which reads as a
    // mistake rather than as a hint.
    for (const parentId of parents) {
      for (const spouseId of graph.spousesOf.get(parentId) ?? []) neighbourhood.add(spouseId);
    }
  }
  const neighbourhoodActive = neighbourhood.size > 0;

  return (
    <div
      ref={surfaceRef}
      {...surfaceProps}
      className={cn(
        "vv-canvas relative min-h-0 flex-1 overflow-hidden bg-[var(--canvas-surface)]",
        "cursor-grab",
      )}
    >
      <div ref={gridRef} aria-hidden className="pointer-events-none absolute inset-0" />

      <div
        ref={layerRef}
        data-lod="near"
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{ width: 0, height: 0 }}
      >
        {!isEmptyProject && (
          <StructureLayer
            rects={rects}
            relationships={graph.relationships}
            showRows={showStructure}
          />
        )}

        <EdgeLayer
          relationships={graph.relationships}
          rects={rects}
          impliedRelationshipIds={impliedRelationshipIds}
          emphasised={emphasised}
          dimUnrelated={Boolean(spotlightPersonId) || Boolean(finderPath)}
          pathRelationshipIds={finderPath?.relationshipIds}
          focusPersonIds={neighbourhoodActive ? neighbourhood : undefined}
          onSelectRelationship={onRemoveRelationship}
        />

        {people.map((person) => {
          const position = positions.get(person.id);
          if (!position) return null;
          const selected = person.id === selectedPersonId;
          const pathRole: "none" | "on-path" | "source" | "target" = finderPath
            ? person.id === finderPath.sourcePersonId
              ? "source"
              : person.id === finderPath.targetPersonId
                ? "target"
                : finderPath.personIds.has(person.id)
                  ? "on-path"
                  : "none"
            : "none";
          return (
            <PersonNode
              key={person.id}
              person={person}
              position={position}
              counts={
                countsByPerson.get(person.id) ?? { parents: 0, spouses: 0, siblings: 0, children: 0 }
              }
              selected={selected}
              hovered={person.id === hoveredPersonId}
              pathRole={pathRole}
              dimmed={
                (Boolean(spotlightPersonId) && !emphasised.has(person.id)) ||
                (Boolean(finderPath) && finderPath!.personIds.size > 0 && pathRole === "none")
              }
              receded={neighbourhoodActive && !neighbourhood.has(person.id)}
              spotlighted={person.id === spotlightPersonId}
              // While a bond is being drafted, only the card under the cursor is
              // offered as the target: ringing every node would shout, and the
              // banner above the canvas already explains what to do.
              relationTarget={Boolean(draft) && person.id === hoveredPersonId}
              onSelect={() => onSelectPerson(person.id)}
              onOpenDetails={() => onOpenDetails(person.id)}
              onHoverChange={(hovering) => onHoverPerson(hovering ? person.id : null)}
              onDragStart={() => undefined}
              onDragEnd={(next) => onMovePerson(person.id, next)}
            >
              <NodeQuickActions
                person={person}
                onIntent={(intent, mode) => onIntent(person.id, intent, mode)}
              />
            </PersonNode>
          );
        })}

        {isEmptyProject && (
          <FirstPersonWelcome
            position={{ x: -WELCOME_WIDTH / 2, y: -WELCOME_HEIGHT / 2 }}
            onCreate={onCreateFirstPerson}
            scale={Math.max(
              0.6,
              Math.min(1, (surfaceSize.width - 40) / WELCOME_WIDTH),
            )}
          />
        )}
      </div>

      {finderPicking && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 ring-1 ring-inset ring-accent/25"
        />
      )}

      {draft && (
        <div
          data-canvas-ui
          className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card/95 px-3.5 py-1.5 shadow-[0_10px_30px_-18px_rgba(15,10,30,0.45)]"
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: `var(${INTENT_META[draft.placement].colorVar})` }}
          />
          <span className="text-[12px]">
            Choose the person to record as {INTENT_META[draft.placement].label.toLowerCase()} - or
            press Esc.
          </span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Cancel" onClick={onCancelDraft}>
            <X />
          </Button>
        </div>
      )}

      <CanvasDock
        className="vv-safe-bottom absolute bottom-0 left-4 z-20 max-sm:left-1/2 max-sm:-translate-x-1/2"
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFit={onFit}
        onFocusSelected={onFocusSelected}
        focusSelectedDisabled={!focusTargetAvailable}
        onTidyUp={onTidyUp}
        onToggleMinimap={onToggleMinimap}
        minimapOpen={showMinimap}
      />

      {/* Phones show the dock instead: 184px of overview beside a 390px canvas
          would cover the very thing it is meant to orient. */}
      {showMinimap && (
        <Minimap
          className="vv-safe-bottom absolute bottom-0 right-4 z-20 hidden sm:block"
          rects={rects}
          surfaceSize={surfaceSize}
          selectedPersonId={selectedPersonId}
          onJump={onMinimapJump}
        />
      )}

      {coachMark && !isEmptyProject && (
        <div
          data-canvas-ui
          className="vv-rise vv-safe-bottom absolute bottom-0 left-1/2 z-20 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-border bg-card/97 px-3.5 py-3 shadow-[0_14px_38px_-24px_rgba(15,10,30,0.5)] max-sm:mb-16"
        >
          <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium">{coachMark.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {coachMark.body}
            </p>
          </div>
          <Button type="button" variant="ghost" size="xs" onClick={onDismissCoachMark}>
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}
