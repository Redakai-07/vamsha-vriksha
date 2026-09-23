"use client";

import { useMemo } from "react";

import { boundsOfRects, padRect, type NodeRects } from "@/lib/canvas/geometry";
import { edgeGeometry } from "@/lib/canvas/routing";
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
  onSelectRelationship?(relationship: Relationship): void;
}

const STROKE: Record<Relationship["type"], string> = {
  parent: "var(--link-parent)",
  spouse: "var(--link-spouse)",
  sibling: "var(--link-sibling)",
  other: "var(--link-other)",
};

/**
 * Edges are the visible consequence of relationship records. The layer is drawn
 * inside the transformed world layer, so it pans and zooms with the nodes for
 * free, and each bond type gets its own restrained visual language.
 */
export function EdgeLayer({
  relationships,
  rects,
  impliedRelationshipIds,
  emphasised,
  dimUnrelated,
  pathRelationshipIds,
  onSelectRelationship,
}: EdgeLayerProps) {
  const frame = useMemo(() => {
    const bounds = boundsOfRects(rects.values());
    if (!bounds) return null;
    // Edges always live between nodes, so a modest pad is enough headroom for
    // the custom-bond curve; keeping the SVG tight keeps the DOM light.
    return padRect(bounds, 400);
  }, [rects]);

  const edges = useMemo(() => {
    if (!frame) return [];
    return relationships
      .map((relationship) => {
        const from = rects.get(relationship.fromPersonId);
        const to = rects.get(relationship.toPersonId);
        if (!from || !to) return null;

        const geometry = edgeGeometry(relationship.type, from, to);
        const touchesEmphasis =
          emphasised.has(relationship.fromPersonId) || emphasised.has(relationship.toPersonId);
        const onPath = pathRelationshipIds?.has(relationship.id) ?? false;
        const pathActive = Boolean(pathRelationshipIds?.size);
        const dimmed = (dimUnrelated && !touchesEmphasis) || (pathActive && !onPath);

        const label =
          relationship.type === "other"
            ? relationship.label
            : relationship.type === "spouse" && relationship.status && relationship.status !== "married"
              ? relationship.status
              : undefined;

        return {
          id: relationship.id,
          relationship,
          geometry,
          dimmed,
          emphasised: touchesEmphasis || onPath,
          onPath,
          label,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
  }, [dimUnrelated, emphasised, frame, pathRelationshipIds, rects, relationships]);

  if (!frame) return null;

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      aria-hidden={false}
      role="presentation"
    >
      <g transform={`translate(${-frame.x}, ${-frame.y})`}>
        {edges.map((edge) => {
          const { relationship, geometry, dimmed, emphasised, label, onPath } = edge;
          const implied = impliedRelationshipIds.has(relationship.id);

          return (
            <g key={edge.id} className={cn(dimmed && (onPath ? "opacity-70" : "opacity-20"))}>
              <path
                d={geometry.d}
                fill="none"
                stroke={onPath ? "var(--accent)" : STROKE[relationship.type]}
                strokeWidth={onPath ? 3.2 : emphasised ? 2.4 : relationship.type === "spouse" ? 2 : 1.5}
                strokeLinecap="round"
                strokeDasharray={
                  onPath ? undefined : relationship.type === "other" ? "6 5" : implied ? "4 4" : undefined
                }
                opacity={onPath ? 0.95 : emphasised ? 1 : 0.72}
              />

              {relationship.type === "spouse" && (
                <rect
                  x={geometry.mid.x - 3}
                  y={geometry.mid.y - 3}
                  width={6}
                  height={6}
                  transform={`rotate(45 ${geometry.mid.x} ${geometry.mid.y})`}
                  fill="var(--link-spouse)"
                  className="pointer-events-auto"
                />
              )}

              {relationship.type === "parent" && (
                <circle
                  cx={geometry.mid.x}
                  cy={geometry.mid.y}
                  r={2.6}
                  fill="var(--link-parent)"
                  opacity={emphasised ? 0.9 : 0.6}
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
                  onSelectRelationship?.(relationship);
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
