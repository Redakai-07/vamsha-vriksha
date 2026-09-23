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

  const mapping = useMemo(() => {
    const bounds = boundsOfRects(rects.values());
    if (!bounds) return null;

    // Include the current viewport so the frame never leaves the map.
    const viewportRect = {
      x: viewport.x,
      y: viewport.y,
      width: surfaceSize.width / viewport.zoom,
      height: surfaceSize.height / viewport.zoom,
    };
    const union = padRect(
      {
        x: Math.min(bounds.x, viewportRect.x),
        y: Math.min(bounds.y, viewportRect.y),
        width:
          Math.max(bounds.x + bounds.width, viewportRect.x + viewportRect.width) -
          Math.min(bounds.x, viewportRect.x),
        height:
          Math.max(bounds.y + bounds.height, viewportRect.y + viewportRect.height) -
          Math.min(bounds.y, viewportRect.y),
      },
      120,
    );

    const scale = Math.min(
      (MAP_WIDTH - MAP_PADDING * 2) / Math.max(union.width, 1),
      (MAP_HEIGHT - MAP_PADDING * 2) / Math.max(union.height, 1),
    );

    return {
      union,
      scale,
      toMap: (point: Point): Point => ({
        x: MAP_PADDING + (point.x - union.x) * scale,
        y: MAP_PADDING + (point.y - union.y) * scale,
      }),
      toWorld: (point: Point): Point => ({
        x: union.x + (point.x - MAP_PADDING) / scale,
        y: union.y + (point.y - MAP_PADDING) / scale,
      }),
    };
  }, [rects, surfaceSize.height, surfaceSize.width, viewport]);

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
          {[...rects.entries()].map(([id, rect]) => {
            const topLeft = mapping.toMap({ x: rect.x, y: rect.y });
            const width = Math.max(2.5, rect.width * mapping.scale);
            const height = Math.max(2, rect.height * mapping.scale);
            return (
              <rect
                key={id}
                x={topLeft.x}
                y={topLeft.y}
                width={width}
                height={height}
                rx={1.2}
                fill={id === selectedPersonId ? "var(--accent)" : "var(--muted-foreground)"}
                opacity={id === selectedPersonId ? 1 : 0.45}
              />
            );
          })}

          {(() => {
            const viewportTopLeft = mapping.toMap({ x: viewport.x, y: viewport.y });
            const width = (surfaceSize.width / viewport.zoom) * mapping.scale;
            const height = (surfaceSize.height / viewport.zoom) * mapping.scale;
            return (
              <rect
                x={viewportTopLeft.x}
                y={viewportTopLeft.y}
                width={Math.max(6, width)}
                height={Math.max(6, height)}
                rx={2}
                fill="color-mix(in oklab, var(--primary) 12%, transparent)"
                stroke="var(--primary)"
                strokeWidth={1}
                opacity={0.85}
              />
            );
          })()}
        </svg>
      )}
    </div>
  );
}

export function useViewportSnapshot(): Viewport {
  return useWorkspaceStore((state) => state.viewport);
}
