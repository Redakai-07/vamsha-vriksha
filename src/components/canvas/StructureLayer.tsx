"use client";

import { useMemo } from "react";

import { boundsOfRects, padRect, type NodeRects } from "@/lib/canvas/geometry";
import { coupleBands, clusterRows } from "@/lib/canvas/rows";
import type { Relationship } from "@/lib/domain/types";

export interface StructureLayerProps {
  rects: NodeRects;
  relationships: Relationship[];
  /** Generation plates are a reading aid, so they can be turned off. */
  showRows?: boolean;
}

/**
 * The quiet scaffolding behind the graph: one plate per generation row, and one
 * per couple.
 *
 * Neither plate carries information the graph does not already have - they are
 * the visual grammar that lets a wide family read as generations and pairs
 * instead of a field of loose cards. Both are drawn from live rects, so they
 * follow nodes as they are dragged, and both fade out when the user zooms away
 * (see the `data-lod` rules in globals.css) because at that distance only the
 * lines between people matter.
 */
export function StructureLayer({ rects, relationships, showRows = true }: StructureLayerProps) {
  const rows = useMemo(
    () => (showRows ? clusterRows(rects.values(), { tolerance: 64, minCount: 2 }) : []),
    [rects, showRows],
  );

  const couples = useMemo(() => coupleBands(relationships, rects), [rects, relationships]);

  const frame = useMemo(() => {
    const bounds = boundsOfRects(rects.values());
    return bounds ? padRect(bounds, 160) : null;
  }, [rects]);

  // A single row of people needs no generation plate; it would only add a box.
  const drawRows = rows.length >= 2;

  if (!frame || (!drawRows && couples.length === 0)) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
    >
      <g transform={`translate(${-frame.x}, ${-frame.y})`}>
        {drawRows &&
          rows.map((row, index) => (
            <rect
              key={`row-${index}`}
              className="vv-row-plate"
              x={row.left - 18}
              y={row.top - 15}
              width={row.right - row.left + 36}
              height={row.height + 30}
              rx={18}
              // A whisper of a plate: enough to say "these belong on one rung of
              // the tree", far too quiet to read as a container.
              fill="color-mix(in oklab, var(--foreground) 2.5%, transparent)"
            />
          ))}

        {couples.map((band) => (
          <rect
            key={`couple-${band.personIds[0]}-${band.personIds[1]}`}
            className="vv-couple-plate"
            x={band.rect.x}
            y={band.rect.y}
            width={band.rect.width}
            height={band.rect.height}
            rx={16}
            fill="color-mix(in oklab, var(--link-spouse) 6%, transparent)"
            stroke="color-mix(in oklab, var(--link-spouse) 18%, transparent)"
            strokeWidth={1}
          />
        ))}
      </g>
    </svg>
  );
}
