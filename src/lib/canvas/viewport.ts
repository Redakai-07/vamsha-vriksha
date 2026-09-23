import type { Point, Viewport } from "@/lib/domain/types";

import { MAX_ZOOM, MIN_ZOOM } from "./constants";

/**
 * Viewport maths - pure, framework-free and unit tested.
 *
 * Convention: `viewport.x/y` is the WORLD coordinate that sits at the top-left
 * corner of the canvas surface. The world layer is therefore rendered with
 *
 *     transform: translate(-x * zoom, -y * zoom) scale(zoom)
 *
 * which makes `worldToScreen` downstream of nothing but arithmetic (no DOM
 * measurement), so zooming stays pixel-accurate.
 */

export interface Size {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) * viewport.zoom,
    y: (point.y - viewport.y) * viewport.zoom,
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: point.x / viewport.zoom + viewport.x,
    y: point.y / viewport.zoom + viewport.y,
  };
}

/** Pans by a screen-space delta (drag distance), which is zoom independent. */
export function panBy(viewport: Viewport, dxScreen: number, dyScreen: number): Viewport {
  return {
    ...viewport,
    x: viewport.x - dxScreen / viewport.zoom,
    y: viewport.y - dyScreen / viewport.zoom,
  };
}

/**
 * Zooms to `nextZoom` while keeping the world point under `anchorScreen`
 * pinned under the cursor. This is what makes wheel zoom feel anchored.
 */
export function zoomAtPoint(
  viewport: Viewport,
  nextZoom: number,
  anchorScreen: Point,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const anchorWorld = screenToWorld(anchorScreen, viewport);
  return {
    zoom,
    x: anchorWorld.x - anchorScreen.x / zoom,
    y: anchorWorld.y - anchorScreen.y / zoom,
  };
}

export function zoomByFactor(viewport: Viewport, factor: number, anchorScreen: Point): Viewport {
  return zoomAtPoint(viewport, viewport.zoom * factor, anchorScreen);
}

/** Wheel delta -> zoom factor. Trackpads produce small deltas, mice large ones. */
export function wheelZoomFactor(deltaY: number, ctrlKey = false): number {
  const normalised = Math.max(-64, Math.min(64, deltaY));
  // ctrl+wheel is the browser convention for pinch-zoom: make it stronger.
  const intensity = ctrlKey ? 0.012 : 0.0024;
  return Math.exp(-normalised * intensity);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function viewportToRect(viewport: Viewport, size: Size): Rect {
  return {
    x: viewport.x,
    y: viewport.y,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom,
  };
}

/** The world rectangle currently visible - used for culling and the minimap. */
export function visibleWorldRect(viewport: Viewport, size: Size): Rect {
  return viewportToRect(viewport, size);
}

/** Centres a world point in the surface without changing zoom. */
export function centerOnPoint(point: Point, size: Size, zoom: number): Viewport {
  return {
    zoom,
    x: point.x - size.width / (2 * zoom),
    y: point.y - size.height / (2 * zoom),
  };
}

/**
 * Fits `bounds` into the surface with padding, never exceeding `maxZoom`
 * (so fitting a single node does not slam the camera into 260%).
 */
export function fitToBounds(
  bounds: Rect,
  size: Size,
  options: { padding?: number; maxZoom?: number; minZoom?: number } = {},
): Viewport {
  const padding = options.padding ?? 80;
  const maxZoom = options.maxZoom ?? 1.1;
  const minZoom = options.minZoom ?? MIN_ZOOM;

  if (size.width <= 0 || size.height <= 0) return { x: bounds.x, y: bounds.y, zoom: 1 };
  if (bounds.width <= 0 && bounds.height <= 0) {
    return centerOnPoint(
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      size,
      Math.min(maxZoom, 1),
    );
  }

  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availableWidth / Math.max(bounds.width, 1), availableHeight / Math.max(bounds.height, 1)),
  );

  const finalZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
  return centerOnPoint(
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    size,
    finalZoom,
  );
}

export function viewportsEqual(a: Viewport, b: Viewport, epsilon = 0.001): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.zoom - b.zoom) < epsilon
  );
}

/** Formats the zoom readout, e.g. 0.734 -> "73%". */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Eases a camera move; used for animated fit / centre actions. */
export function lerpViewport(from: Viewport, to: Viewport, t: number): Viewport {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
