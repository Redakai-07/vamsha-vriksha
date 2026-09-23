"use client";

import { Check, ChevronsUpDown, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { PersonAvatar } from "@/components/person/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Id, Person } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { comparePeopleForListing, matchesQuery, personSubtitle } from "@/lib/utils/person";

export interface PersonComboboxProps {
  people: Person[];
  value: Id | null;
  onChange(personId: Id): void;
  placeholder?: string;
  emptyLabel?: string;
  excludeIds?: Id[];
  disabled?: boolean;
  className?: string;
  onCreateNew?(query: string): void;
  createLabel?: string;
}

export function PersonCombobox({
  people,
  value,
  onChange,
  placeholder = "Select a person",
  emptyLabel = "No one matches",
  excludeIds = [],
  disabled,
  className,
  onCreateNew,
  createLabel = "Create new person",
}: PersonComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const excluded = new Set(excludeIds);
    return people
      .filter((person) => !excluded.has(person.id) && matchesQuery(person, query))
      .sort(comparePeopleForListing);
  }, [excludeIds, people, query]);

  const selected = people.find((person) => person.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("h-10 w-full justify-between px-2.5 font-normal", className)}
          aria-expanded={open}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <PersonAvatar person={selected} size="xs" />
              <span className="truncate text-[13px]">{selected.displayName || selected.name}</span>
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[19rem] p-2" align="start">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            className="h-8 pl-8 text-[13px]"
            data-canvas-ui
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-0.5 pr-1">
            {options.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  onChange(person.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary",
                  person.id === value && "bg-secondary/70",
                )}
              >
                <PersonAvatar person={person} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{person.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {personSubtitle(person) || "No dates recorded"}
                  </span>
                </span>
                {person.id === value && <Check className="size-3.5 text-primary" />}
              </button>
            ))}

            {!options.length && (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">{emptyLabel}</p>
            )}
          </div>
        </ScrollArea>

        {onCreateNew && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-[13px]"
            onClick={() => {
              setOpen(false);
              onCreateNew(query);
            }}
          >
            <UserPlus />
            {query ? `${createLabel}: "${query}"` : createLabel}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
