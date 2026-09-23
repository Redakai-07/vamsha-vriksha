"use client";

import { Focus, Layers, Map as MapIcon, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatZoom } from "@/lib/canvas/viewport";
import { cn } from "@/lib/utils/cn";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface CanvasDockProps {
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onTidyUp(): void;
  onToggleMinimap(): void;
  minimapOpen: boolean;
  className?: string;
}

/** Bottom-left camera controls. Small, quiet, always in the same place. */
export function CanvasDock({
  onZoomIn,
  onZoomOut,
  onFit,
  onTidyUp,
  onToggleMinimap,
  minimapOpen,
  className,
}: CanvasDockProps) {
  // Subscribing to a rounded value keeps the dock from re-rendering on every
  // animation frame while still tracking the camera exactly.
  const zoomPercent = useWorkspaceStore((state) => Math.round(state.viewport.zoom * 100));

  return (
    <TooltipProvider delayDuration={400}>
      <div
        data-canvas-ui
        className={cn(
          "flex items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-[0_10px_30px_-18px_rgba(15,10,30,0.45)]",
          className,
        )}
      >
        <DockButton label="Zoom out ( - )" onClick={onZoomOut}>
          <Minus />
        </DockButton>
        <span className="w-12 select-none text-center text-[11.5px] tabular-nums text-muted-foreground">
          {formatZoom(zoomPercent / 100)}
        </span>
        <DockButton label="Zoom in ( + )" onClick={onZoomIn}>
          <Plus />
        </DockButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <DockButton label="Fit to screen ( F )" onClick={onFit}>
          <Focus />
        </DockButton>
        <DockButton label="Tidy up the layout ( L )" onClick={onTidyUp}>
          <Layers />
        </DockButton>
        <DockButton
          label={minimapOpen ? "Hide minimap ( M )" : "Show minimap ( M )"}
          onClick={onToggleMinimap}
          active={minimapOpen}
        >
          <MapIcon />
        </DockButton>
      </div>
    </TooltipProvider>
  );
}

function DockButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick(): void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
