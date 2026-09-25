import { describe, expect, it } from "vitest";

import {
  CAMERA_CHASE_MAX_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_SMOOTHING_MS,
} from "@/lib/canvas/constants";
import {
  approachViewport,
  cameraMovedElsewhere,
  chaseStep,
  clampZoom,
  fitToBounds,
  panBy,
  rectWithinView,
  screenToWorld,
  viewportSettled,
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

  it("accumulates anchored zoom on the target camera", () => {
    // The eased zoom chases a target, so consecutive wheel ticks are applied to
    // the *target* rather than the live camera. Two ticks of 1.2 must therefore
    // end up exactly where one tick of 1.44 would.
    const anchor = { x: 420, y: 260 };
    const start = { x: 10, y: 20, zoom: 1 };
    const twice = zoomAtPoint(zoomAtPoint(start, start.zoom * 1.2, anchor), 1.2 * 1.2, anchor);
    const once = zoomAtPoint(start, 1.44, anchor);
    expect(twice.zoom).toBeCloseTo(once.zoom, 6);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.y).toBeCloseTo(once.y, 6);
  });
});

describe("camera chasing", () => {
  it("approaches a target without overshooting", () => {
    const target = { x: 400, y: -200, zoom: 2 };
    let current = { x: 0, y: 0, zoom: 1 };
    for (let frame = 0; frame < 60; frame += 1) {
      const next = approachViewport(current, target, 16, 78);
      expect(next.zoom).toBeGreaterThanOrEqual(current.zoom);
      expect(next.zoom).toBeLessThanOrEqual(target.zoom);
      expect(next.x).toBeLessThanOrEqual(target.x);
      current = next;
    }
    expect(viewportSettled(current, target)).toBe(true);
  });

  it("ends promptly at its deadline instead of creeping", () => {
    // Exponential approaches are asymptotic: without the deadline the chase
    // would keep issuing frames that move less than a pixel, for as long as the
    // canvas is open.
    const target = { x: 0, y: 0, zoom: 1.6 };
    let current = { x: 0, y: 0, zoom: 1 };
    let elapsed = 0;
    let settledAt = -1;
    while (settledAt < 0 && elapsed < 1000) {
      const step = chaseStep(current, target, {
        deltaMs: 10,
        elapsedMs: elapsed,
        timeConstantMs: ZOOM_SMOOTHING_MS,
        maxMs: CAMERA_CHASE_MAX_MS,
      });
      current = step.viewport;
      if (step.settled) settledAt = elapsed;
      else elapsed += 10;
    }
    expect(settledAt).toBeGreaterThan(0);
    expect(current).toEqual(target);
    // It stops at its deadline, not when the asymptote happens to look good
    // enough to the eye.
    expect(settledAt).toBeLessThanOrEqual(CAMERA_CHASE_MAX_MS);
  });

  it("notices when something else moved the camera", () => {
    const applied = { x: 100, y: 100, zoom: 1 };
    expect(cameraMovedElsewhere({ ...applied }, applied)).toBe(false);
    // A drag writes a different viewport: the animation has to stand down.
    expect(cameraMovedElsewhere({ x: 160, y: 100, zoom: 1 }, applied)).toBe(true);
    expect(cameraMovedElsewhere({ x: 100, y: 100, zoom: 1.4 }, applied)).toBe(true);
    // Nothing written yet: no claim to defend.
    expect(cameraMovedElsewhere({ x: 0, y: 0, zoom: 1 }, null)).toBe(false);
  });

  it("knows when a rectangle is already on screen", () => {
    const view = { x: 0, y: 0, width: 1000, height: 600 };
    expect(rectWithinView({ x: 100, y: 100, width: 200, height: 100 }, view)).toBe(true);
    expect(rectWithinView({ x: 950, y: 100, width: 200, height: 100 }, view)).toBe(false);
    // A margin means "not jammed against the edge".
    expect(rectWithinView({ x: 5, y: 5, width: 200, height: 100 }, view, 24)).toBe(false);
  });
});
