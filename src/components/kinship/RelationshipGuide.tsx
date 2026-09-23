"use client";

import { BookOpen, Info, Search, ShieldQuestion } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ALL_LANGUAGES,
  LANGUAGE_META,
  languageForKinshipSystem,
  searchTerminology,
  searchTerminologyGaps,
  type LanguageCode,
  type TerminologyEntry,
  type TerminologyGapEntry,
} from "@/lib/relationship";
import type { KinshipSystemId } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

export interface RelationshipGuideProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  system: KinshipSystemId;
}

const SUGGESTED = ["mother's brother", "father's brother", "wife's brother", "grandfather", "son's son"];

/**
 * The relationship guide.
 *
 * A reference for the vocabulary itself: what each term means, who it names
 * relative to whom, the example path that produces it, the gender and age
 * assumptions it makes, and how many generations away it sits.
 *
 * It also lists the relationships the app deliberately does not name. A guide
 * that only showed confident terms would teach users to trust guesses, so the
 * "not asserted" section is part of the reference, not a footnote.
 */
export function RelationshipGuide({ open, onOpenChange, system }: RelationshipGuideProps) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<LanguageCode>(() => languageForKinshipSystem(system));

  const entries = useMemo(() => searchTerminology(query, { language }), [language, query]);
  const gaps = useMemo(() => searchTerminologyGaps(query, { language }), [language, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Relationship guide</DialogTitle>
          <DialogDescription>
            Every term the engine knows, with the relationship path it comes from. Terms are only
            shown as exact when the recorded facts settle them; regional and secondary usages are
            marked general, and unnamed relationships are listed as such.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a term, meaning or path - e.g. mother's brother, tamma, अम्मा"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            {ALL_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                  language === code
                    ? "border-primary/45 bg-primary/8 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {LANGUAGE_META[code].name}
              </button>
            ))}
          </div>
        </div>

        {!query && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Try:</span>
            {SUGGESTED.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="rounded-full border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[54vh] pr-1">
          <div className="grid gap-2 pr-2">
            {entries.length === 0 && gaps.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing in the {LANGUAGE_META[language].name} vocabulary matches “{query}”.
              </p>
            )}

            {entries.map((entry) => (
              <GuideEntryRow key={entry.ruleId} entry={entry} />
            ))}

            {gaps.length > 0 && (
              <section className="mt-2 grid gap-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <ShieldQuestion className="size-3.5" /> Not asserted
                </h3>
                {gaps.map((gap) => (
                  <GuideGapRow key={gap.id} gap={gap} />
                ))}
              </section>
            )}
          </div>
        </ScrollArea>

        <footer className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
          <BookOpen className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Terms are data, not code: each entry is a rule over the relationship graph, which is why
            a new language can be added without touching the interface. Where families disagree on a
            word, this guide says so instead of picking one.
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function GuideEntryRow({ entry }: { entry: TerminologyEntry }) {
  const scriptClass = entry.language === "hi" ? "font-devanagari" : "font-kannada";

  return (
    <article className="grid gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {entry.script && (
          <span className={cn("text-[20px] leading-tight", scriptClass)}>{entry.script}</span>
        )}
        <span className="text-[14px] font-medium">{entry.term}</span>
        <span className="text-[12px] text-muted-foreground">· {entry.englishMeaning}</span>
        <span className="flex-1" />
        <Badge variant={entry.confidence === "exact" ? "accent" : "muted"}>
          {entry.confidence}
        </Badge>
      </div>

      <p className="text-[12.5px] text-foreground">
        Person A is Person B&apos;s <span className="font-medium">{entry.pathPhrase}</span>.
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Badge variant="outline">{entry.languageName}</Badge>
        <Badge variant="muted">{entry.generationLabel}</Badge>
        <Badge variant="muted">tokens {entry.tokens}</Badge>
        {entry.seniorityLabel && <Badge variant="muted">{entry.seniorityLabel}</Badge>}
        {entry.genderAssumption && <Badge variant="muted">{entry.genderAssumption}</Badge>}
        {entry.region && <Badge variant="muted">{entry.region}</Badge>}
      </div>

      {entry.note && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {entry.note}
        </p>
      )}
    </article>
  );
}

function GuideGapRow({ gap }: { gap: TerminologyGapEntry }) {
  return (
    <article className="grid gap-1.5 rounded-xl border border-dashed border-border bg-secondary/20 px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13.5px] font-medium">{gap.pathPhrase}</span>
        <span className="flex-1" />
        <Badge variant="outline">{gap.languageName}</Badge>
        <Badge variant="muted">tokens {gap.tokens}</Badge>
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">{gap.reason}</p>
      {gap.variants && (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          <span className="text-foreground">What families say: </span>
          {gap.variants}
        </p>
      )}
    </article>
  );
}
