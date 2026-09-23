"use client";

import { X } from "lucide-react";

import { CanvasDock } from "@/components/canvas/CanvasDock";
import { EdgeLayer } from "@/components/canvas/EdgeLayer";
import { GhostPersonNode } from "@/components/canvas/GhostPersonNode";
import { Minimap } from "@/components/canvas/Minimap";
import { NodeQuickActions, type RelationshipDraftMode } from "@/components/canvas/NodeQuickActions";
import { PersonNode, type NodeRelationshipCounts } from "@/components/canvas/PersonNode";
import { Button } from "@/components/ui/button";
import { GHOST_NODE_SIZE } from "@/lib/canvas/constants";
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
  draftTargetIds: Set<Id>;
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
  onTidyUp(): void;
  onToggleMinimap(): void;
  isEmptyProject: boolean;
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
  draftTargetIds,
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
  onTidyUp,
  onToggleMinimap,
  isEmptyProject,
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
        <EdgeLayer
          relationships={graph.relationships}
          rects={rects}
          impliedRelationshipIds={impliedRelationshipIds}
          emphasised={emphasised}
          dimUnrelated={Boolean(spotlightPersonId) || Boolean(finderPath)}
          pathRelationshipIds={finderPath?.relationshipIds}
          onSelectRelationship={(relationship) => onRemoveRelationship(relationship.id)}
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
              spotlighted={person.id === spotlightPersonId}
              relationTarget={draftTargetIds.has(person.id)}
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
          <GhostPersonNode
            position={{ x: -(GHOST_NODE_SIZE + 76) / 2, y: -GHOST_NODE_SIZE / 2 }}
            onCreate={onCreateFirstPerson}
            label="Add first person"
            hint="Start with anyone - a grandparent, a parent, or yourself. Everything is optional except a name."
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
        className="absolute bottom-4 left-4 z-20"
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFit={onFit}
        onTidyUp={onTidyUp}
        onToggleMinimap={onToggleMinimap}
        minimapOpen={showMinimap}
      />

      {showMinimap && (
        <Minimap
          className="absolute bottom-4 right-4 z-20"
          rects={rects}
          surfaceSize={surfaceSize}
          selectedPersonId={selectedPersonId}
          onJump={onMinimapJump}
        />
      )}

      {isEmptyProject && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-center text-[11.5px] text-muted-foreground">
          Drag to pan · scroll to zoom · double-click empty space to add someone
        </p>
      )}
    </div>
  );
}
