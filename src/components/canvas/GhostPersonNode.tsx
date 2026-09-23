"use client";

import { Plus } from "lucide-react";

import { GHOST_NODE_SIZE } from "@/lib/canvas/constants";
import type { Point } from "@/lib/domain/types";

/**
 * The first thing you see in a brand new lineage: an almost-empty canvas with a
 * single "+" node at its centre that says what it does.
 */
export function GhostPersonNode({
  position,
  onCreate,
  label = "Add first person",
  hint = "Start with anyone - a parent, a grandparent, or yourself.",
}: {
  position: Point;
  onCreate(): void;
  label?: string;
  hint?: string;
}) {
  return (
    <div
      data-canvas-node
      className="absolute flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-[var(--canvas-node)]/70 text-center transition-colors hover:border-accent/60 hover:bg-[var(--canvas-node)]"
      style={{ left: position.x, top: position.y, width: GHOST_NODE_SIZE + 76, height: GHOST_NODE_SIZE }}
    >
      <button
        type="button"
        onClick={onCreate}
        aria-label={label}
        className="group flex size-11 items-center justify-center rounded-full border border-border bg-card shadow-[0_2px_8px_-4px_rgba(15,10,30,0.3)] transition-colors hover:border-accent/70 hover:bg-accent/10"
      >
        <Plus className="size-5 text-muted-foreground transition-colors group-hover:text-accent" />
      </button>
      <div className="px-3">
        <p className="font-display text-[13.5px] font-medium leading-tight">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
