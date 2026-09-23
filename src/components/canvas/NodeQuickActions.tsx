"use client";

import { ArrowDown, ArrowUp, Heart, MoreHorizontal, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { INTENT_META, type RelativeIntent } from "@/lib/domain/relativeIntent";
import type { Person } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

export type RelationshipDraftMode = "create" | "link";

export interface NodeQuickActionsProps {
  person: Person;
  /** Called when the user picks "create new" or "link existing". */
  onIntent(intent: RelativeIntent, mode: RelationshipDraftMode): void;
}

const ICONS: Record<RelativeIntent, React.ComponentType<{ className?: string }>> = {
  parent: ArrowUp,
  child: ArrowDown,
  spouse: Heart,
  sibling: Users,
  other: MoreHorizontal,
};

const PLACEMENT: Record<RelativeIntent, string> = {
  parent: "top-[-15px] left-1/2 -translate-x-1/2",
  child: "bottom-[-15px] left-1/2 -translate-x-1/2",
  spouse: "right-[-15px] top-1/2 -translate-y-1/2",
  sibling: "left-[-15px] top-1/2 -translate-y-1/2",
  other: "right-[-11px] top-[-11px]",
};

/**
 * Contextual relationship controls.
 *
 * They appear only for the hovered/selected node (never permanently on every
 * node - that is what makes a big canvas unreadable) and they are placed in the
 * direction the relationship will be drawn: parent above, child below, spouse
 * to the side. Each control keeps a constant on-screen size regardless of zoom,
 * because it counter-scales by `--vv-inv-zoom`.
 */
export function NodeQuickActions({ person, onIntent }: NodeQuickActionsProps) {
  const intents: RelativeIntent[] = ["parent", "child", "sibling", "other", "spouse"];

  return (
    <div
      data-canvas-ui
      className="pointer-events-none absolute inset-0"
      style={{ transform: "scale(var(--vv-inv-zoom, 1))", transformOrigin: "center" }}
    >
      {intents.map((intent) => {
        const Icon = ICONS[intent];
        const meta = INTENT_META[intent];
        return (
          <Popover key={intent}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={meta.control}
                title={meta.control}
                onPointerDown={(event) => event.stopPropagation()}
                className={cn(
                  "pointer-events-auto absolute flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-[0_2px_6px_rgba(15,10,30,0.14)] transition-colors",
                  "hover:border-transparent hover:text-foreground",
                  PLACEMENT[intent],
                )}
                style={{ ["--bond" as string]: `var(${meta.colorVar})` }}
              >
                <Icon className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-0"
              align={intent === "spouse" || intent === "other" ? "end" : "center"}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-border px-3 py-2.5">
                <p className="text-[12px] font-medium">{meta.control}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {meta.description}
                </p>
              </div>
              <div className="grid p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start text-[12.5px]"
                  onClick={() => onIntent(intent, "create")}
                >
                  <UserPlus /> Create a new person
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start text-[12.5px]"
                  onClick={() => onIntent(intent, "link")}
                >
                  <Users /> Link someone already recorded
                </Button>
              </div>
              <p className="border-t border-border px-3 py-2 text-[10.5px] leading-snug text-muted-foreground">
                Anchored to {person.displayName || person.name}. A relationship record is created
                explicitly - position never implies kinship.
              </p>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
