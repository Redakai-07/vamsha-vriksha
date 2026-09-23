import type { Id, Relationship, RelationshipType } from "@/lib/domain/types";

import type { NodeRects } from "./geometry";
import { edgeGeometry, type EdgeGeometry } from "./routing";
import type { Rect } from "./viewport";

/**
 * Turning relationship rows into lines.
 *
 * The graph stores one row per parent, but drawing one line per row makes the
 * commonest family shape look tangled: two parents of three children produce six
 * curves (or four, for a couple) that cross each other around the same trunk.
 * A tree has one trunk. So the drawing merges the rows that point at the same
 * child from people who are married to each other into a single line, and keeps
 * the rows it stands for, so a click on the trunk can still say exactly which
 * records it is made of.
 *
 * Everything here is pure geometry over rows and rects - no React, no DOM.
 */

export interface RenderEdge {
  /** Stable id: a relationship id, or `trunk:<childId>:<parents>` when merged. */
  id: string;
  /** What the line looks like: the geometry follows the bond type. */
  type: RelationshipType;
  /** Everyone the line touches, for highlighting and dimming. */
  personIds: Id[];
  /** The stored rows this line represents (one, or several when merged). */
  relationshipIds: Id[];
  geometry: EdgeGeometry;
  /** True when another record already implies this bond. */
  implied: boolean;
  /** Optional label (a named "other" bond, or a non-married spouse status). */
  label?: string;
}

export interface BuildEdgesInput {
  relationships: readonly Relationship[];
  rects: NodeRects;
  impliedRelationshipIds?: Set<Id>;
}

function edgeLabel(relationship: Relationship): string | undefined {
  if (relationship.type === "other") return relationship.label;
  if (relationship.type === "spouse" && relationship.status && relationship.status !== "married") {
    return relationship.status;
  }
  return undefined;
}

/** The bottom of a rect, or a zero-size rect placed at an exact point. */
function spineRect(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  const x = (left + right) / 2;
  return { x, y: bottom, width: 0, height: 0 };
}

export function buildRenderEdges({
  relationships,
  rects,
  impliedRelationshipIds,
}: BuildEdgesInput): RenderEdge[] {
  // ---- who is married to whom, so parents can be merged ------------------
  const spousePairs = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type !== "spouse") continue;
    spousePairs.add(`${relationship.fromPersonId}|${relationship.toPersonId}`);
    spousePairs.add(`${relationship.toPersonId}|${relationship.fromPersonId}`);
  }
  const areSpouses = (a: Id, b: Id) => spousePairs.has(`${a}|${b}`);

  // ---- parent rows, grouped per child ------------------------------------
  const parentRowsByChild = new Map<Id, Relationship[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent") continue;
    if (!rects.has(relationship.fromPersonId) || !rects.has(relationship.toPersonId)) continue;
    const rows = parentRowsByChild.get(relationship.toPersonId);
    if (rows) rows.push(relationship);
    else parentRowsByChild.set(relationship.toPersonId, [relationship]);
  }

  /** Rows that a merged trunk will draw, so they are not drawn twice. */
  const merged = new Set<Id>();
  const trunks: RenderEdge[] = [];

  for (const [childId, rows] of parentRowsByChild) {
    if (rows.length < 2) continue;
    const child = rects.get(childId);
    if (!child) continue;

    // Walk the parents and collect the married clusters among them.
    const remaining = [...rows].sort((a, b) => a.fromPersonId.localeCompare(b.fromPersonId));
    while (remaining.length) {
      const seed = remaining.shift() as Relationship;
      const cluster = [seed];
      let grew = true;
      while (grew) {
        grew = false;
        for (let index = remaining.length - 1; index >= 0; index -= 1) {
          const candidate = remaining[index];
          if (cluster.some((member) => areSpouses(member.fromPersonId, candidate.fromPersonId))) {
            cluster.push(candidate);
            remaining.splice(index, 1);
            grew = true;
          }
        }
      }

      if (cluster.length < 2) continue; // a single parent keeps its own line

      const parentRects = cluster
        .map((row) => rects.get(row.fromPersonId))
        .filter((rect): rect is Rect => Boolean(rect));
      if (parentRects.length < 2) continue;

      // The line leaves the couple's spine - their shared middle - which is why
      // two parents produce one trunk instead of two crossing curves.
      const spine = spineRect(parentRects);
      const parentIds = cluster.map((row) => row.fromPersonId).sort();
      for (const row of cluster) merged.add(row.id);
      trunks.push({
        id: `trunk:${childId}:${parentIds.join("+")}`,
        type: "parent",
        personIds: [...parentIds, childId],
        relationshipIds: cluster.map((row) => row.id),
        geometry: edgeGeometry("parent", spine, child),
        implied: false,
      });
    }
  }

  // ---- the remaining rows, one line each ---------------------------------
  const singles: RenderEdge[] = [];
  for (const relationship of relationships) {
    if (merged.has(relationship.id)) continue;
    const from = rects.get(relationship.fromPersonId);
    const to = rects.get(relationship.toPersonId);
    if (!from || !to) continue;
    singles.push({
      id: relationship.id,
      type: relationship.type,
      personIds: [relationship.fromPersonId, relationship.toPersonId],
      relationshipIds: [relationship.id],
      geometry: edgeGeometry(relationship.type, from, to),
      implied: impliedRelationshipIds?.has(relationship.id) ?? false,
      label: edgeLabel(relationship),
    });
  }

  // Deterministic order keeps the SVG stable across renders.
  return [...trunks, ...singles].sort((a, b) => a.id.localeCompare(b.id));
}
