"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectsRepo } from "@/lib/db/repositories/projects";
import type { Project } from "@/lib/domain/types";

export interface ProjectCardProps {
  project: Project;
  onOpen(): void;
  onRename(): void;
  onExport(): void;
  onDelete(): void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** A lineage card. Counts are live queries, so they never go stale. */
export function ProjectCard({ project, onOpen, onRename, onExport, onDelete }: ProjectCardProps) {
  const counts = useLiveQuery(
    () => projectsRepo.counts(project.id),
    [project.id],
    { people: 0, relationships: 0 },
  );

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-shadow hover:shadow-[0_10px_30px_-22px_rgba(20,12,40,0.45)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-start gap-3 p-5 text-left"
      >
        <span className="flex w-full items-start justify-between gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary/50">
            <Users className="size-4 text-muted-foreground" />
          </span>
          <Badge variant="outline" className="capitalize">
            {project.kinshipSystem === "kannada"
              ? "ಕನ್ನಡ terms"
              : project.kinshipSystem === "hindi"
                ? "हिन्दी terms"
                : "English terms"}
          </Badge>
        </span>

        <span className="min-w-0">
          <span className="block truncate font-display text-[17px] font-medium tracking-tight">
            {project.name}
          </span>
          <span className="mt-1 line-clamp-2 block text-[12.5px] leading-relaxed text-muted-foreground">
            {project.description || "No description yet"}
          </span>
        </span>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span>{counts.people} people</span>
          <span className="text-border">·</span>
          <span>{counts.relationships} bonds</span>
          <span className="text-border">·</span>
          <span>{relativeTime(project.updatedAt)}</span>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${project.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExport}>
              <Download /> Export JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 /> Delete lineage
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
