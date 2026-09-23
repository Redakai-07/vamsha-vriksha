"use client";

import { HelpCircle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TermView } from "@/lib/relationship/view";
import { cn } from "@/lib/utils/cn";

/**
 * A kinship term, shown the way a family actually speaks.
 *
 * The badge is deliberately honest about uncertainty: when the graph does not
 * settle which word applies (an elder/younger distinction with no birth dates,
 * or a relationship the vocabulary does not name), it shows the *path* in words
 * with a quiet marker instead of guessing a term.
 */
export function KinshipTermBadge({
  view,
  showCultural,
  className,
}: {
  view: TermView;
  showCultural: boolean;
  className?: string;
}) {
  const hasTerm = Boolean(view.term);
  const showScript = Boolean(view.script) && view.language !== "en";
  const cultural = showCultural && hasTerm;

  return (
    <TooltipProvider delayDuration={350}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5",
              className,
            )}
          >
            {hasTerm && cultural ? (
              <>
                {showScript && (
                  <span
                    className={cn(
                      "text-[13px] font-medium text-foreground",
                      view.language === "hi" ? "font-devanagari" : "font-kannada",
                    )}
                  >
                    {view.script}
                  </span>
                )}
                <span className="text-[12px] italic text-muted-foreground">{view.term}</span>
              </>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[12px]",
                  hasTerm ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {hasTerm ? view.term : view.literal}
                {!hasTerm && <HelpCircle className="size-3 shrink-0 opacity-70" />}
              </span>
            )}
            {hasTerm && cultural && (
              <span className="text-[11px] text-muted-foreground/80">{view.literal}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium">{hasTerm ? view.term : "No term asserted"}</p>
          <p className="mt-0.5 opacity-90">{view.explanation}</p>
          {view.confidence === "general" && (
            <p className="mt-1 opacity-80">
              General term - {view.languageName} has no more specific word here.
            </p>
          )}
          {view.missingContext && (
            <p className="mt-1 opacity-80">Needs: {view.missingContext}.</p>
          )}
          {view.note && <p className="mt-1 opacity-80">{view.note}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function KinshipTermChip({ view, className }: { view: TermView; className?: string }) {
  if (!view.term) {
    return (
      <Badge variant="muted" className={className}>
        <HelpCircle className="size-3" /> {view.literal}
      </Badge>
    );
  }
  return (
    <Badge variant="accent" className={className}>
      {view.script ? (
        <span className={view.language === "hi" ? "font-devanagari" : "font-kannada"}>
          {view.script}
        </span>
      ) : (
        view.term
      )}
    </Badge>
  );
}

/** A one-line "why" note used under a term in lists. */
export function TermConfidenceNote({ view, className }: { view: TermView; className?: string }) {
  if (view.confidence === "exact" && !view.note) return null;
  return (
    <p className={cn("flex items-start gap-1 text-[11px] text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3 shrink-0" />
      {view.confidence === "uncertain"
        ? `Not asserted: ${view.explanation}`
        : view.note ?? "General term - not a specific word in this vocabulary."}
    </p>
  );
}
