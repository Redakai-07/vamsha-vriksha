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
    // Same reasoning as setPositions: the viewport is saved on a debounce while
    // the user can be dragging a node, so the row must be read and written as
    // one unit or the newer position would be rolled back.
    await db.transaction("rw", db.canvasStates, async () => {
      const existing = await this.get(projectId);
      await db.canvasStates.put({ ...existing, viewport, updatedAt: nowIso() });
    });
  },

  async setPositions(projectId: string, positions: Record<string, Point>): Promise<void> {
    const db = getDb();
    // Read-modify-write inside one transaction so that a position written by an
    // explicit gesture can never be lost to a concurrent write.
    await db.transaction("rw", db.canvasStates, async () => {
      const existing = await this.get(projectId);
      await db.canvasStates.put({
        ...existing,
        nodePositions: { ...existing.nodePositions, ...positions },
        updatedAt: nowIso(),
      });
    });
  },

  /**
   * Writes a position only for people who do not have one yet.
   *
   * This is what the layout fallback uses: a person appears in the live query a
   * beat before the canvas row records where the user put them, and the layout
   * must never overwrite that intent. Checking inside the transaction makes the
   * outcome independent of which write happens to land first.
   */
  async fillMissingPositions(
    projectId: string,
    positions: Record<string, Point>,
  ): Promise<void> {
    const db = getDb();
    await db.transaction("rw", db.canvasStates, async () => {
      const existing = await this.get(projectId);
      const next = { ...existing.nodePositions };
      let changed = false;
      for (const [personId, point] of Object.entries(positions)) {
        if (next[personId]) continue;
        next[personId] = point;
        changed = true;
      }
      if (!changed) return;
      await db.canvasStates.put({ ...existing, nodePositions: next, updatedAt: nowIso() });
    });
  },

  async setPosition(projectId: string, personId: string, position: Point): Promise<void> {
    await this.setPositions(projectId, { [personId]: position });
  },

  async togglePinned(projectId: string, personId: string): Promise<boolean> {
    const db = getDb();
    // Returned through a box because Dexie transactions resolve with the
    // callback's value only on the transaction promise.
    let nowPinned = false;
    await db.transaction("rw", db.canvasStates, async () => {
      const existing = await this.get(projectId);
      const pinned = existing.pinnedPersonIds.includes(personId);
      nowPinned = !pinned;
      await db.canvasStates.put({
        ...existing,
        pinnedPersonIds: pinned
          ? existing.pinnedPersonIds.filter((id) => id !== personId)
          : [...existing.pinnedPersonIds, personId],
        updatedAt: nowIso(),
      });
    });
    return nowPinned;
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
  await canvasRepo.fillMissingPositions(projectId, { [personId]: position });
}

export function newCanvasId(): string {
  return createId("cnv");
}
