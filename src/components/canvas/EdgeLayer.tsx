"use client";

import { useMemo } from "react";

import { buildRenderEdges, type RenderEdge } from "@/lib/canvas/edges";
import { boundsOfRects, padRect, type NodeRects } from "@/lib/canvas/geometry";
import type { Id, Relationship } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

export interface EdgeLayerProps {
  relationships: Relationship[];
  rects: NodeRects;
  /**
   * Bonds that are already implied by another record (an explicit sibling bond
   * between two people who share recorded parents). Drawn dotted so the user
   * can tell a stated relationship from one the tree already shows.
   */
  impliedRelationshipIds: Set<string>;
  /** Bonds touching these people are drawn with emphasis. */
  emphasised: Set<Id>;
  /** True when a spotlight is active, so unrelated bonds recede. */
  dimUnrelated: boolean;
  /**
   * Exact bonds on a highlighted relationship path. When present, only these
   * keep full strength: the answer to "how are they related?" should be the
   * only thing the eye can follow.
   */
  pathRelationshipIds?: Set<Id>;
  /**
   * The family of the person being studied. Bonds outside it step back without
   * vanishing - enough to answer "who is this person connected to?" at a
   * glance, quiet enough that the rest of the tree is still readable.
   */
  focusPersonIds?: Set<Id>;
  onSelectRelationship?(relationshipId: Id): void;
}

const STROKE: Record<Relationship["type"], string> = {
  parent: "var(--link-parent)",
  spouse: "var(--link-spouse)",
  sibling: "var(--link-sibling)",
  other: "var(--link-other)",
};

interface StyledEdge extends RenderEdge {
  dimmed: boolean;
  receded: boolean;
  emphasised: boolean;
  onPath: boolean;
}

/**
 * Edges are the visible consequence of relationship records. The layer is drawn
 * inside the transformed world layer, so it pans and zooms with the nodes for
 * free, and each bond type gets its own restrained visual language: a thin
 * solid line for descent, a short tie with a loom mark for a marriage, a
 * shallow arc for siblings, a dashed curve for named bonds.
 */
export function EdgeLayer({
  relationships,
  rects,
  impliedRelationshipIds,
  emphasised,
  dimUnrelated,
  pathRelationshipIds,
  focusPersonIds,
  onSelectRelationship,
}: EdgeLayerProps) {
  const frame = useMemo(() => {
    const bounds = boundsOfRects(rects.values());
    if (!bounds) return null;
    // Edges always live between nodes, so a modest pad is enough headroom for
    // the routing curves; keeping the SVG tight keeps the DOM light.
    return padRect(bounds, 400);
  }, [rects]);

  const edges = useMemo<StyledEdge[]>(() => {
    if (!frame) return [];
    const pathActive = Boolean(pathRelationshipIds?.size);
    const focusActive = Boolean(focusPersonIds?.size);

    return buildRenderEdges({ relationships, rects, impliedRelationshipIds }).map((edge) => {
      const touchesEmphasis = edge.personIds.some((personId) => emphasised.has(personId));
      const onPath = edge.relationshipIds.some((id) => pathRelationshipIds?.has(id));
      const dimmed = (dimUnrelated && !touchesEmphasis) || (pathActive && !onPath);
      const receded =
        !dimmed &&
        focusActive &&
        !edge.personIds.some((personId) => focusPersonIds?.has(personId));

      return {
        ...edge,
        dimmed,
        receded,
        emphasised: touchesEmphasis || onPath,
        onPath,
      };
    });
  }, [dimUnrelated, emphasised, focusPersonIds, frame, impliedRelationshipIds, pathRelationshipIds, rects, relationships]);

  if (!frame) return null;

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      role="presentation"
    >
      <g transform={`translate(${-frame.x}, ${-frame.y})`}>
        {edges.map((edge) => {
          const { geometry, dimmed, receded, emphasised, onPath, label, type, implied } = edge;
          const stroke = onPath ? "var(--accent)" : STROKE[type];

          return (
            <g
              key={edge.id}
              className={cn(
                dimmed && (onPath ? "opacity-70" : "opacity-20"),
                receded && "opacity-45",
              )}
            >
              <path
                d={geometry.d}
                fill="none"
                stroke={stroke}
                strokeWidth={onPath ? 3.2 : emphasised ? 2.4 : type === "spouse" ? 1.8 : 1.4}
                strokeLinecap="round"
                strokeDasharray={
                  onPath ? undefined : type === "other" ? "6 5" : implied ? "4 4" : undefined
                }
                opacity={onPath ? 0.95 : emphasised ? 1 : 0.72}
              />

              {type === "spouse" && (
                <rect
                  x={geometry.mid.x - 3}
                  y={geometry.mid.y - 3}
                  width={6}
                  height={6}
                  transform={`rotate(45 ${geometry.mid.x} ${geometry.mid.y})`}
                  fill="var(--link-spouse)"
                />
              )}

              {type === "parent" && (
                // A single quiet pip where the line turns: it shows that the bond
                // runs downwards, without turning the canvas into arrows.
                <circle
                  cx={geometry.mid.x}
                  cy={geometry.mid.y}
                  r={2.4}
                  fill={onPath ? "var(--accent)" : "var(--link-parent)"}
                  opacity={emphasised ? 0.9 : 0.55}
                />
              )}

              {label && (
                <g transform={`translate(${geometry.mid.x}, ${geometry.mid.y + 16})`}>
                  <rect
                    x={-32}
                    y={-9}
                    width={64}
                    height={17}
                    rx={8}
                    fill="var(--popover)"
                    stroke="var(--border)"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={0}
                    className="fill-[var(--muted-foreground)]"
                    style={{ fontSize: 10.5, letterSpacing: "0.04em" }}
                  >
                    {label}
                  </text>
                </g>
              )}

              <path
                d={geometry.d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                className="pointer-events-auto cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  // A merged trunk stands for several rows; the caller decides
                  // how to describe that before anything is removed.
                  onSelectRelationship?.(edge.relationshipIds[0]);
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
