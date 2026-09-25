"use client";

import { useMemo, useRef } from "react";

import { boundsOfRects, padRect, type NodeRects } from "@/lib/canvas/geometry";
import type { Id, Point, Viewport } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface MinimapProps {
  rects: NodeRects;
  surfaceSize: { width: number; height: number };
  selectedPersonId: Id | null;
  onJump(worldPoint: Point): void;
  className?: string;
}

const MAP_WIDTH = 184;
const MAP_HEIGHT = 122;
const MAP_PADDING = 14;
/** The map's extent is quantised to this many world units (see below). */
const MAP_QUANTUM = 240;

/**
 * A quiet overview: every node as a small mark, the current viewport as a
 * hairline frame. Click or drag anywhere to move the camera there.
 */
export function Minimap({
  rects,
  surfaceSize,
  selectedPersonId,
  onJump,
  className,
}: MinimapProps) {
  const viewport = useWorkspaceStore((state) => state.viewport);
  const frameRef = useRef<HTMLDivElement>(null);

  const bounds = useMemo(() => boundsOfRects(rects.values()), [rects]);

  /*
   * The map has two jobs that want opposite things: the marks should be
   * recomputed as rarely as possible, and the window frame has to follow the
   * camera exactly. So the extent - family plus wherever the camera is - is
   * quantised, which means every mark (and the SVG that holds them) is built
   * only every few hundred world units of movement, while the frame is derived
   * from the live camera on each render for the price of four multiplications.
   * A camera move therefore no longer rebuilds the whole overview 60 times a
   * second.
   */
  const extent = useMemo(() => {
    if (!bounds) return null;
    const view = {
      x: viewport.x,
      y: viewport.y,
      width: surfaceSize.width / viewport.zoom,
      height: surfaceSize.height / viewport.zoom,
    };
    const padded = padRect(
      {
        x: Math.min(bounds.x, view.x),
        y: Math.min(bounds.y, view.y),
        width: Math.max(bounds.x + bounds.width, view.x + view.width) - Math.min(bounds.x, view.x),
        height:
          Math.max(bounds.y + bounds.height, view.y + view.height) - Math.min(bounds.y, view.y),
      },
      120,
    );
    return {
      x: Math.floor(padded.x / MAP_QUANTUM) * MAP_QUANTUM,
      y: Math.floor(padded.y / MAP_QUANTUM) * MAP_QUANTUM,
      width: Math.ceil(padded.width / MAP_QUANTUM) * MAP_QUANTUM,
      height: Math.ceil(padded.height / MAP_QUANTUM) * MAP_QUANTUM,
    };
  }, [bounds, surfaceSize.height, surfaceSize.width, viewport.x, viewport.y, viewport.zoom]);

  const mapping = useMemo(() => {
    const frameX = extent?.x ?? 0;
    const frameY = extent?.y ?? 0;
    const frameWidth = extent?.width ?? 0;
    const frameHeight = extent?.height ?? 0;
    if (frameWidth <= 0 || frameHeight <= 0) return null;

    const scale = Math.min(
      (MAP_WIDTH - MAP_PADDING * 2) / frameWidth,
      (MAP_HEIGHT - MAP_PADDING * 2) / frameHeight,
    );

    return {
      scale,
      toMap: (point: Point): Point => ({
        x: MAP_PADDING + (point.x - frameX) * scale,
        y: MAP_PADDING + (point.y - frameY) * scale,
      }),
      toWorld: (point: Point): Point => ({
        x: frameX + (point.x - MAP_PADDING) / scale,
        y: frameY + (point.y - MAP_PADDING) / scale,
      }),
    };
    // Keyed on the quantised extent, so panning reuses this object - and every
    // mark built from it - rather than rebuilding them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent?.x, extent?.y, extent?.width, extent?.height]);

  /** Small marks: rebuilt only when the extent or the family changes. */
  const marks = useMemo(() => {
    if (!mapping) return null;
    return [...rects.entries()].map(([id, rect]) => {
      const topLeft = mapping.toMap({ x: rect.x, y: rect.y });
      return (
        <rect
          key={id}
          x={topLeft.x}
          y={topLeft.y}
          width={Math.max(2.5, rect.width * mapping.scale)}
          height={Math.max(2, rect.height * mapping.scale)}
          rx={1.2}
          fill={id === selectedPersonId ? "var(--accent)" : "var(--muted-foreground)"}
          opacity={id === selectedPersonId ? 1 : 0.45}
        />
      );
    });
  }, [mapping, rects, selectedPersonId]);

  /** The window frame: cheap, so it tracks the camera at full frame rate. */
  const frame = useMemo(() => {
    if (!mapping) return null;
    const topLeft = mapping.toMap({ x: viewport.x, y: viewport.y });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(6, (surfaceSize.width / viewport.zoom) * mapping.scale),
      height: Math.max(6, (surfaceSize.height / viewport.zoom) * mapping.scale),
    };
  }, [mapping, surfaceSize.height, surfaceSize.width, viewport.x, viewport.y, viewport.zoom]);

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!mapping) return;
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const local = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    onJump(mapping.toWorld(local));
  };

  return (
    <div
      ref={frameRef}
      data-canvas-ui
      role="presentation"
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card/95 shadow-[0_8px_24px_-16px_rgba(15,10,30,0.4)]",
        className,
      )}
      style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
      onPointerDown={(event) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        handlePointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) handlePointer(event);
      }}
    >
      {!mapping ? (
        <p className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
          Nothing to map yet
        </p>
      ) : (
        <svg width={MAP_WIDTH} height={MAP_HEIGHT} className="block">
          {marks}

          {frame && (
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
              rx={2}
              fill="color-mix(in oklab, var(--primary) 12%, transparent)"
              stroke="var(--primary)"
              strokeWidth={1}
              opacity={0.85}
            />
          )}
        </svg>
      )}
    </div>
  );
}

export function useViewportSnapshot(): Viewport {
  return useWorkspaceStore((state) => state.viewport);
}
