"use client";

import { PersonAvatar } from "@/components/person/PersonAvatar";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { Id } from "@/lib/domain/types";
import { TOKEN_WORDS, type RelationshipPath } from "@/lib/relationship/types";
import { cn } from "@/lib/utils/cn";

/**
 * The relationship path, rendered the way the explanation reads:
 *
 *   Radha —son→ Krishna —sister→ Lakshmi
 *
 * Every hop is labelled with the *graph token* that produced it, so the user can
 * see the reasoning rather than trusting a label. Derived hops (siblings
 * inferred from a shared parent) are marked so an inference is never mistaken
 * for a recorded fact.
 */
export function PathChain({
  path,
  graph,
  onOpenPerson,
  className,
  compact,
}: {
  path: RelationshipPath;
  graph: FamilyGraph;
  onOpenPerson?(personId: Id): void;
  className?: string;
  compact?: boolean;
}) {
  if (path.personIds.length < 2) {
    return (
      <p className={cn("text-[11.5px] text-muted-foreground", className)}>
        Same person - no path to walk.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-1.5", className)}>
      {path.personIds.map((personId, index) => {
        const person = graph.peopleById.get(personId);
        // The hop that *leads into* this person: steps[i] names the person at
        // i + 1 relative to i, so entry i uses steps[i - 1].
        const step = index > 0 ? path.steps[index - 1] : undefined;
        return (
          <span key={`${personId}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && step && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span aria-hidden className="text-border">
                  —
                </span>
                <span
                  className={cn(
                    "rounded-full border border-border px-1.5 py-0.5",
                    step.origin === "derived" && "border-dashed border-accent/50 text-accent",
                  )}
                  title={
                    step.origin === "derived"
                      ? "Inferred from a shared parent, not a stored record"
                      : "Recorded relationship"
                  }
                >
                  {TOKEN_WORDS[step.token as keyof typeof TOKEN_WORDS] ?? step.token}
                  {step.origin === "derived" && " *"}
                </span>
                <span aria-hidden className="text-border">
                  →
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpenPerson?.(personId)}
              className={cn(
                "inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-transparent px-1 py-0.5 text-[12px]",
                onOpenPerson && "hover:border-border hover:bg-secondary/60",
                index === 0 || index === path.personIds.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
              title={person?.name}
            >
              {person && !compact && <PersonAvatar person={person} size="xs" />}
              <span className="truncate">
                {person ? person.displayName || person.name : "Unknown person"}
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
