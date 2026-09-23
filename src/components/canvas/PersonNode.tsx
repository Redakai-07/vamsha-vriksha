"use client";

import { useCallback, useRef } from "react";

import { PersonAvatar } from "@/components/person/PersonAvatar";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/canvas/constants";
import type { Person, Point } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { personSubtitle } from "@/lib/utils/person";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface NodeRelationshipCounts {
  parents: number;
  spouses: number;
  siblings: number;
  children: number;
}

export interface PersonNodeProps {
  person: Person;
  position: Point;
  counts: NodeRelationshipCounts;
  selected: boolean;
  hovered: boolean;
  /** Dimmed because another person's lineage is spotlighted. */
  dimmed: boolean;
  spotlighted: boolean;
  relationTarget: boolean;
  /**
   * Where this person sits in a highlighted relationship path: on the path, or
   * at one of its two ends. Used by the Relationship Finder.
   */
  pathRole?: "none" | "on-path" | "source" | "target";
  onSelect(): void;
  onOpenDetails(): void;
  onHoverChange(hovered: boolean): void;
  onDragStart(): void;
  onDragEnd(position: Point): void;
  children?: React.ReactNode;
}

/**
 * A person on the canvas.
 *
 * Visual rules that keep a large family readable:
 *  - the node shows only identity (photo, name, lifespan) - biodata lives in the
 *    details panel, never on the node,
 *  - relationship counts are shown as three quiet indicators, and
 *  - birth/death detail fades out when zoomed away (driven by the `data-lod`
 *    attribute on the world layer, so zooming never re-renders nodes).
 *
 * Dragging is handled here (not by the surface) so the canvas never has to
 * guess what the user grabbed. The position updates come from the workspace
 * store while dragging and are persisted once, on release.
 */
export function PersonNode({
  person,
  position,
  counts,
  selected,
  hovered,
  dimmed,
  spotlighted,
  relationTarget,
  pathRole = "none",
  onSelect,
  onOpenDetails,
  onHoverChange,
  onDragStart,
  onDragEnd,
  children,
}: PersonNodeProps) {
  const dragPosition = useWorkspaceStore((state) =>
    state.drag?.personId === person.id ? state.drag.position : null,
  );
  const startRef = useRef<{ pointerX: number; pointerY: number; origin: Point; moved: boolean } | null>(
    null,
  );

  const effective = dragPosition ?? position;
  const subtitle = personSubtitle(person);
  const deceased = Boolean(person.dateOfDeath);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      startRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: position,
        moved: false,
      };
      onSelect();
    },
    [onSelect, position],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const zoom = useWorkspaceStore.getState().viewport.zoom;
      const dx = (event.clientX - start.pointerX) / zoom;
      const dy = (event.clientY - start.pointerY) / zoom;
      if (!start.moved && Math.hypot(dx, dy) < 3) return;
      if (!start.moved) {
        start.moved = true;
        onDragStart();
      }
      useWorkspaceStore.getState().updateDrag({
        x: Math.round(start.origin.x + dx),
        y: Math.round(start.origin.y + dy),
      });
    },
    [onDragStart],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const start = startRef.current;
      startRef.current = null;
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
      if (!start) return;
      const drag = useWorkspaceStore.getState().drag;
      if (start.moved && drag) {
        onDragEnd(drag.position);
        useWorkspaceStore.getState().endDrag();
      } else if (!start.moved) {
        onOpenDetails();
      }
    },
    [onDragEnd, onOpenDetails],
  );

  return (
    <div
      data-canvas-node
      data-person-id={person.id}
      role="button"
      tabIndex={0}
      aria-label={`${person.name}${subtitle ? `, ${subtitle}` : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
          onOpenDetails();
        }
      }}
      className={cn(
        "vw-node absolute flex touch-none select-none items-center gap-3 rounded-xl border bg-[var(--canvas-node)] px-3 transition-[box-shadow,border-color,opacity] duration-150",
        "shadow-[0_1px_2px_rgba(15,10,30,0.06)]",
        selected
          ? "border-primary/60 shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_28%,transparent),0_6px_18px_-10px_rgba(15,10,30,0.4)]"
          : hovered
            ? "border-border shadow-[0_4px_14px_-8px_rgba(15,10,30,0.32)]"
            : "border-border",
        spotlighted && !selected && "border-accent/70",
        relationTarget && "border-accent ring-2 ring-accent/40",
        pathRole === "on-path" && "border-accent/70 ring-2 ring-accent/35",
        (pathRole === "source" || pathRole === "target") &&
          "border-accent ring-2 ring-accent/60 shadow-[0_8px_22px_-12px_rgba(15,10,30,0.5)]",
        dimmed && "opacity-35",
        dragPosition ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        left: effective.x,
        top: effective.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
    >
      <PersonAvatar
        person={person}
        size="md"
        className={cn("vv-node-avatar", deceased && "saturate-[0.85]")}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14.5px] font-medium leading-tight tracking-tight">
          {person.displayName || person.name}
        </p>
        {person.displayName && (
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">{person.name}</p>
        )}
        {subtitle && (
          <p className="vv-node-detail mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {subtitle}
          </p>
        )}

        <div className="vv-node-detail vv-node-counts mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
          {counts.parents > 0 && <Indicator label="parents" symbol="↑" count={counts.parents} />}
          {counts.spouses > 0 && <Indicator label="spouses" symbol="⚭" count={counts.spouses} />}
          {counts.children > 0 && <Indicator label="children" symbol="↓" count={counts.children} />}
          {counts.siblings > 0 && <Indicator label="siblings" symbol="≡" count={counts.siblings} />}
        </div>
      </div>

      {deceased && (
        <span
          aria-hidden
          className="absolute inset-x-3 bottom-0 h-px bg-accent/50"
          title="Remembered"
        />
      )}

      {(pathRole === "source" || pathRole === "target") && (
        <span
          aria-hidden
          className="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full border border-accent/60 bg-card text-[10.5px] font-medium text-accent"
          style={{ transform: "scale(var(--vv-inv-zoom, 1))" }}
        >
          {pathRole === "source" ? "A" : "B"}
        </span>
      )}

      {(hovered || selected) && children}
    </div>
  );
}

function Indicator({ symbol, count, label }: { symbol: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${count} ${label}`}>
      <span aria-hidden className="text-[11px] leading-none">
        {symbol}
      </span>
      {count}
    </span>
  );
}
