"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Point } from "@/lib/domain/types";

/** Width of the welcome card in world units, so it can be centred on origin. */
export const WELCOME_WIDTH = 460;
export const WELCOME_HEIGHT = 208;

/**
 * The whole first-use experience, in one card.
 *
 * A brand new lineage is the only moment the app gets to explain itself, and a
 * wall of instructions is the wrong way to spend it. So the empty canvas holds
 * a single statement of what this place is for, one sentence of reassurance
 * that nothing else is required, and one button. Everything else the canvas can
 * teach - hover a card for the relationship controls, double-click empty space,
 * drop a person anywhere - is taught in context, when it is relevant.
 */
export function FirstPersonWelcome({
  position,
  onCreate,
  scale = 1,
}: {
  position: Point;
  onCreate(): void;
  /**
   * Shrinks the card to fit the surface (a phone is narrower than the card is
   * wide). Scaling about the card's centre keeps it centred on the origin, so
   * the camera maths stay untouched.
   */
  scale?: number;
}) {
  return (
    <div
      data-canvas-node
      className="vv-rise absolute flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-[var(--canvas-node)]/60 px-8 text-center"
      style={{
        left: position.x,
        top: position.y,
        width: WELCOME_WIDTH,
        height: WELCOME_HEIGHT,
        transform: scale === 1 ? undefined : `scale(${scale})`,
      }}
    >
      <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
        A new lineage
      </span>
      <h1 className="mt-2.5 font-display text-[24px] leading-tight font-medium tracking-tight">
        Your family story starts here.
      </h1>
      <p className="mt-2 max-w-[18rem] text-[12.5px] leading-relaxed text-muted-foreground">
        Add whoever you remember first. Only a name is needed - dates, photos and
        biographies can follow whenever you have them.
      </p>
      <Button size="lg" className="mt-4" onClick={onCreate}>
        <Plus /> Add first person
      </Button>

      {/* Two ways in, and each line is shown only where it is true: a phone has
          the toolbar button and no double click, a desktop has both. Neither is
          an instruction, both are a reassurance. */}
      <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/85 sm:hidden">
        <span aria-hidden className="size-1 rounded-full bg-accent/70" />
        Everything stays in this browser
      </p>
      <p className="mt-3.5 hidden items-center gap-1.5 text-[11px] text-muted-foreground/85 sm:flex">
        <span aria-hidden className="size-1 rounded-full bg-accent/70" />
        Or double-click anywhere on the canvas
      </p>
    </div>
  );
}
