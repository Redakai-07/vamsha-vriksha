import { describe, expect, it } from "vitest";

import { MAX_ZOOM, MIN_ZOOM } from "@/lib/canvas/constants";
import {
  clampZoom,
  fitToBounds,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  zoomByFactor,
} from "@/lib/canvas/viewport";

const size = { width: 1200, height: 800 };

describe("viewport math", () => {
  it("round-trips world <-> screen coordinates", () => {
    const viewport = { x: 120, y: -40, zoom: 1.75 };
    const world = { x: -530.5, y: 902.25 };
    const screen = worldToScreen(world, viewport);
    const back = screenToWorld(screen, viewport);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it("clamps zoom to the supported range", () => {
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("keeps the world point under the cursor pinned while zooming", () => {
    const viewport = { x: 40, y: 60, zoom: 1 };
    const anchor = { x: 300, y: 220 };
    const worldBefore = screenToWorld(anchor, viewport);
    const zoomed = zoomByFactor(viewport, 1.6, anchor);
    const worldAfter = screenToWorld(anchor, zoomed);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    expect(zoomed.zoom).toBeCloseTo(1.6, 6);
  });

  it("does not drift past the zoom limits when anchored", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const anchor = { x: 500, y: 400 };
    const zoomed = zoomAtPoint(viewport, 500, anchor);
    expect(zoomed.zoom).toBe(MAX_ZOOM);
    const worldAfter = screenToWorld(anchor, zoomed);
    expect(worldAfter.x).toBeCloseTo(500, 6);
    expect(worldAfter.y).toBeCloseTo(400, 6);
  });

  it("pans by screen distance regardless of zoom", () => {
    const viewport = { x: 0, y: 0, zoom: 2 };
    const panned = panBy(viewport, 200, -100);
    // 200 screen px at 200% is 100 world px, and dragging right moves the
    // camera left, so the origin of the view moves to -100.
    expect(panned.x).toBeCloseTo(-100, 6);
    expect(panned.y).toBeCloseTo(50, 6);
  });

  it("fits content into the surface with padding", () => {
    const bounds = { x: -600, y: -400, width: 1200, height: 800 };
    const viewport = fitToBounds(bounds, size, { padding: 100 });
    // Available 1000x600 for 1200x800 of content: the height is the tighter
    // axis, so 600/800 = 0.75 wins (both are under the 1.1 cap).
    expect(viewport.zoom).toBeCloseTo(0.75, 3);
    // Bounds centre must land in the middle of the surface.
    const centre = worldToScreen({ x: 0, y: 0 }, viewport);
    expect(centre.x).toBeCloseTo(size.width / 2, 3);
    expect(centre.y).toBeCloseTo(size.height / 2, 3);
  });

  it("never zooms past the cap when fitting a single node", () => {
    const viewport = fitToBounds({ x: 0, y: 0, width: 236, height: 92 }, size, { maxZoom: 1.1 });
    expect(viewport.zoom).toBeLessThanOrEqual(1.1);
  });

  it("handles an empty surface without dividing by zero", () => {
    const viewport = fitToBounds({ x: 0, y: 0, width: 0, height: 0 }, { width: 0, height: 0 });
    expect(Number.isFinite(viewport.zoom)).toBe(true);
    expect(Number.isFinite(viewport.x)).toBe(true);
  });
});
