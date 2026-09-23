"use client";

import {
  BookOpen,
  Check,
  CloudOff,
  Database,
  HelpingHand,
  Map as MapIcon,
  Plus,
  Settings,
  Share2,
  Sparkles,
  UserRoundSearch,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listLayoutEngines } from "@/lib/canvas/layout";
import type { FamilyGraph } from "@/lib/domain/graph";
import type { Project } from "@/lib/domain/types";

export interface CanvasToolbarProps {
  project: Project | null;
  graph: FamilyGraph;
  layoutEngineId: string;
  minimapOpen: boolean;
  culturalTermsVisible: boolean;
  onRenameProject(name: string): void;
  onBackToProjects(): void;
  onAddPerson(): void;
  onTidyUp(engineId: string): void;
  onFit(): void;
  onToggleMinimap(): void;
  onToggleCulturalTerms(): void;
  onOpenFinder(): void;
  finderActive: boolean;
  onOpenGuide(): void;
  onOpenSettings(): void;
  onOpenShortcuts(): void;
  onExport(): void;
}

/**
 * The top bar answers three questions at a glance: which lineage am I in,
 * is my work safe, and what can I do next. Everything else lives in the canvas
 * dock so the bar stays quiet.
 */
export function CanvasToolbar({
  project,
  graph,
  layoutEngineId,
  minimapOpen,
  culturalTermsVisible,
  onRenameProject,
  onBackToProjects,
  onAddPerson,
  onTidyUp,
  onFit,
  onToggleMinimap,
  onToggleCulturalTerms,
  onOpenFinder,
  finderActive,
  onOpenGuide,
  onOpenSettings,
  onOpenShortcuts,
  onExport,
}: CanvasToolbarProps) {
  const [online, setOnline] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project?.name ?? "");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    setDraftName(project?.name ?? "");
  }, [project?.name]);

  const engines = listLayoutEngines();

  return (
    <TooltipProvider delayDuration={400}>
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
        <button
          type="button"
          onClick={onBackToProjects}
          className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary/60"
          aria-label="Back to all lineages"
        >
          <BrandMark />
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <span className="font-display text-[13.5px] font-medium tracking-tight">
              Vamsha-Vriksha
            </span>
            <span className="text-[10.5px] text-muted-foreground">All lineages</span>
          </span>
        </button>

        <span className="text-border">/</span>

        {editing ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draftName.trim() && draftName !== project?.name) onRenameProject(draftName.trim());
              else setDraftName(project?.name ?? "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraftName(project?.name ?? "");
                setEditing(false);
              }
            }}
            className="h-8 w-56 text-[13px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="max-w-[38vw] truncate rounded-md px-1.5 py-1 font-display text-[14px] font-medium tracking-tight transition-colors hover:bg-secondary/60"
            title="Rename this lineage"
          >
            {project?.name ?? "Loading…"}
          </button>
        )}

        <div className="hidden items-center gap-1.5 md:flex">
          <Badge variant="muted">
            {graph.people.length} {graph.people.length === 1 ? "person" : "people"}
          </Badge>
          <Badge variant="muted">
            {graph.relationships.length}{" "}
            {graph.relationships.length === 1 ? "relationship" : "relationships"}
          </Badge>
        </div>

        <span className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground lg:inline-flex">
              {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
              {online ? "Online (not required)" : "Offline"}
              <span className="text-border">·</span>
              <Check className="size-3" />
              Saved locally
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Everything is stored in this browser&apos;s IndexedDB. Internet and sign-in are optional
            enhancements - the app never needs them.
          </TooltipContent>
        </Tooltip>

        <Button size="sm" onClick={onAddPerson}>
          <Plus /> <span className="hidden sm:inline">Add person</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label="Arrange and view options">
              <Sparkles />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Arrange</DropdownMenuLabel>
            {engines.map((engine) => (
              <DropdownMenuItem key={engine.id} onSelect={() => onTidyUp(engine.id)}>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px]">
                    Tidy up · {engine.label}
                    {layoutEngineId === engine.id && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-accent">
                        current
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{engine.description}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onFit}>
              <MapIcon /> Fit to screen
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={minimapOpen} onCheckedChange={onToggleMinimap}>
              Show minimap
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={culturalTermsVisible}
              onCheckedChange={onToggleCulturalTerms}
            >
              Show kinship terms
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExport}>
              <Share2 /> Export this lineage
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={finderActive ? "accent" : "outline"}
              aria-label="Find relationship"
              aria-pressed={finderActive}
              onClick={onOpenFinder}
            >
              <UserRoundSearch />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Find how two people are related: pick A and B on the canvas (press /)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Relationship guide"
              onClick={onOpenGuide}
            >
              <BookOpen />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Relationship guide: terms, meanings and paths (press ?)</TooltipContent>
        </Tooltip>

        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Keyboard shortcuts"
          onClick={onOpenShortcuts}
        >
          <HelpingHand />
        </Button>

        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Data and preferences"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
      </header>
    </TooltipProvider>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={`flex size-8 items-center justify-center rounded-lg border border-border bg-card ${className ?? ""}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-4.5">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 20.5v-6" className="text-muted-foreground" />
          <path d="M12 14.5 7 11M12 14.5l5-3.5" className="text-muted-foreground" />
        </g>
        <circle cx="12" cy="21" r="1.6" fill="var(--accent)" />
        <circle cx="12" cy="13.4" r="1.9" fill="var(--primary)" />
        <circle cx="6.6" cy="10.4" r="2.1" fill="var(--primary)" />
        <circle cx="17.4" cy="10.4" r="2.1" fill="var(--primary)" />
        <circle cx="12" cy="6.4" r="2.4" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function StorageHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Database className="size-3.5" /> IndexedDB
    </span>
  );
}
