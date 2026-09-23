import { getDb } from "@/lib/db/db";
import type { CanvasState, Point, Viewport } from "@/lib/domain/types";
import { createId, nowIso } from "@/lib/utils/id";

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

function blankCanvas(projectId: string): CanvasState {
  return {
    id: projectId,
    projectId,
    viewport: { ...DEFAULT_VIEWPORT },
    nodePositions: {},
    pinnedPersonIds: [],
    updatedAt: nowIso(),
  };
}

/**
 * Canvas presentation state (viewport + manual node positions) lives outside
 * the kinship records on purpose: it is per-device ergonomics, not genealogy.
 * Positions are only written by explicit gestures (drag / auto-arrange), never
 * by rendering.
 */
export const canvasRepo = {
  async get(projectId: string): Promise<CanvasState> {
    const db = getDb();
    const existing = await db.canvasStates.get(projectId);
    if (existing) {
      return {
        ...existing,
        viewport: { ...DEFAULT_VIEWPORT, ...existing.viewport },
        nodePositions: existing.nodePositions ?? {},
        pinnedPersonIds: existing.pinnedPersonIds ?? [],
      };
    }
    const created = blankCanvas(projectId);
    await db.canvasStates.put(created);
    return created;
  },

  async saveViewport(projectId: string, viewport: Viewport): Promise<void> {
    const db = getDb();
    const existing = await this.get(projectId);
    await db.canvasStates.put({ ...existing, viewport, updatedAt: nowIso() });
  },

  async setPositions(projectId: string, positions: Record<string, Point>): Promise<void> {
    const db = getDb();
    const existing = await this.get(projectId);
    await db.canvasStates.put({
      ...existing,
      nodePositions: { ...existing.nodePositions, ...positions },
      updatedAt: nowIso(),
    });
  },

  async setPosition(projectId: string, personId: string, position: Point): Promise<void> {
    await this.setPositions(projectId, { [personId]: position });
  },

  async togglePinned(projectId: string, personId: string): Promise<boolean> {
    const db = getDb();
    const existing = await this.get(projectId);
    const pinned = existing.pinnedPersonIds.includes(personId);
    const next = {
      ...existing,
      pinnedPersonIds: pinned
        ? existing.pinnedPersonIds.filter((id) => id !== personId)
        : [...existing.pinnedPersonIds, personId],
      updatedAt: nowIso(),
    };
    await db.canvasStates.put(next);
    return !pinned;
  },

  /** Drops positions for people who no longer exist (cheap self-healing). */
  async prune(projectId: string, existingPersonIds: Set<string>): Promise<void> {
    const db = getDb();
    const canvas = await this.get(projectId);
    const entries = Object.entries(canvas.nodePositions).filter(([id]) => existingPersonIds.has(id));
    if (entries.length === Object.keys(canvas.nodePositions).length) return;
    await db.canvasStates.put({
      ...canvas,
      nodePositions: Object.fromEntries(entries),
      pinnedPersonIds: canvas.pinnedPersonIds.filter((id) => existingPersonIds.has(id)),
      updatedAt: nowIso(),
    });
  },

  async resetView(projectId: string): Promise<CanvasState> {
    const db = getDb();
    const canvas = await this.get(projectId);
    const next: CanvasState = { ...canvas, viewport: { ...DEFAULT_VIEWPORT }, updatedAt: nowIso() };
    await db.canvasStates.put(next);
    return next;
  },
};

/** Seeds a canvas position on first creation of a person (idempotent). */
export async function ensurePosition(
  projectId: string,
  personId: string,
  position: Point,
): Promise<void> {
  const db = getDb();
  const canvas = await canvasRepo.get(projectId);
  if (canvas.nodePositions[personId]) return;
  await db.canvasStates.put({
    ...canvas,
    nodePositions: { ...canvas.nodePositions, [personId]: position },
    updatedAt: nowIso(),
  });
}

export function newCanvasId(): string {
  return createId("cnv");
}
