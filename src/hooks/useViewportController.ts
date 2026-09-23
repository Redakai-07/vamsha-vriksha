"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { CAMERA_ANIMATION_MS, ZOOM_STEP_FACTOR } from "@/lib/canvas/constants";
import { gridBackgroundImage, gridStyle } from "@/lib/canvas/grid";
import type { NodeRects } from "@/lib/canvas/geometry";
import { boundsOfRects, padRect, visibleNodeIds } from "@/lib/canvas/geometry";
import {
  centerOnPoint,
  clampZoom,
  easeInOutCubic,
  fitToBounds,
  lerpViewport,
  zoomAtPoint,
} from "@/lib/canvas/viewport";
import { canvasRepo } from "@/lib/db/repositories/canvas";
import type { Id, Point, Viewport } from "@/lib/domain/types";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * The camera.
 *
 * Panning and zooming must feel immediate, so the viewport is applied to the
 * DOM *outside* React: one subscription writes a transform to the world layer
 * and a background to the grid layer. React never re-renders on camera moves,
 * which is the difference between a smooth canvas and a janky one.
 *
 * Only two small pieces do subscribe: the zoom readout and the minimap, and
 * both are cheap.
 */

export interface ViewportController {
  /** Applies a zoom factor around a screen-space anchor (cursor, pinch mid). */
  zoomBy(factor: number, anchor?: Point): void;
  zoomIn(anchor?: Point): void;
  zoomOut(anchor?: Point): void;
  setZoom(zoom: number, anchor?: Point): void;
  panByScreen(dx: number, dy: number): void;
  /** Centres a world point (animated). */
  centerOn(point: Point, options?: { zoom?: number; animate?: boolean }): void;
  centerOnPerson(personId: Id, options?: { zoom?: number; animate?: boolean }): void;
  fitToContent(options?: { animate?: boolean; padding?: number }): void;
  fitToPerson(personId: Id, options?: { animate?: boolean }): void;
  resetZoom(): void;
  /**
   * Keeps the same world point under the centre of the screen when the surface
   * changes size (rotation, a collapsing URL bar, a resized window). Without
   * this the canvas would keep its top-left corner and slowly push the family
   * off the edge of a phone.
   */
  keepCentre(previous: { width: number; height: number }, next: { width: number; height: number }): void;
  /** World ids currently visible (used for culling). */
  visibleIds(rects: NodeRects, slack?: number): Id[];
}

interface Options {
  layerRef: React.RefObject<HTMLElement | null>;
  gridRef: React.RefObject<HTMLElement | null>;
  surfaceRef: React.RefObject<HTMLElement | null>;
  rects: NodeRects;
  projectId: Id | null;
}

export function useViewportController({
  layerRef,
  gridRef,
  surfaceRef,
  rects,
  projectId,
}: Options): ViewportController {
  const animationRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;

  const getSize = useCallback(() => {
    const element = surfaceRef.current;
    if (element) {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) return { width, height };
    }
    return useWorkspaceStore.getState().surface;
  }, [surfaceRef]);

  // ---- apply the viewport to the DOM (no React re-render) ----------------
  useEffect(() => {
    const apply = (viewport: Viewport) => {
      const layer = layerRef.current;
      if (layer) {
        layer.style.transform = `translate(${-viewport.x * viewport.zoom}px, ${
          -viewport.y * viewport.zoom
        }px) scale(${viewport.zoom})`;
        // Counter-scale for UI that must keep a constant screen size (the
        // contextual relationship controls around a node).
        layer.style.setProperty("--vv-inv-zoom", String(1 / viewport.zoom));
        // Level of detail, driven by CSS so nodes do not re-render on zoom.
        layer.dataset.lod = viewport.zoom >= 0.75 ? "near" : viewport.zoom >= 0.42 ? "mid" : "far";
      }

      const grid = gridRef.current;
      if (grid) {
        const preferences = usePreferencesStore.getState().preferences;
        const style = gridStyle(viewport, { contrast: preferences.canvasContrast });
        const color = getComputedStyle(document.documentElement)
          .getPropertyValue("--canvas-grid")
          .trim();
        grid.style.backgroundImage = gridBackgroundImage(color || "currentColor", style);
        grid.style.backgroundSize = `${style.step}px ${style.step}px`;
        grid.style.backgroundPosition = `${style.offsetX}px ${style.offsetY}px`;
        grid.style.opacity = String(preferences.canvasBackdrop === "dots" ? style.opacity : 0);
      }
    };

    apply(useWorkspaceStore.getState().viewport);
    return useWorkspaceStore.subscribe((state, previous) => {
      if (state.viewport !== previous.viewport) apply(state.viewport);
      // Repaint the grid when the backdrop preference changes even if the
      // camera is still (preferences are hydrated after first paint).
      if (state.viewport === previous.viewport && state.surface !== previous.surface) apply(state.viewport);
    });
  }, [gridRef, layerRef]);

  // Repaint when contrast/backdrop preferences change.
  useEffect(() => {
    return usePreferencesStore.subscribe((state, previous) => {
      if (state.preferences.canvasContrast === previous.preferences.canvasContrast &&
          state.preferences.canvasBackdrop === previous.preferences.canvasBackdrop) {
        return;
      }
      const viewport = useWorkspaceStore.getState().viewport;
      useWorkspaceStore.getState().setViewport({ ...viewport });
    });
  }, []);

  // ---- persist the viewport (debounced) ---------------------------------
  useEffect(() => {
    if (!projectId) return;
    return useWorkspaceStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void canvasRepo.saveViewport(projectId, useWorkspaceStore.getState().viewport);
      }, 500);
    });
  }, [projectId]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  // ---- animated moves ---------------------------------------------------
  const animateTo = useCallback(
    (target: Viewport) => {
      const store = useWorkspaceStore.getState();
      const reduceMotion = usePreferencesStore.getState().preferences.reduceMotion;
      const from = store.viewport;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);

      if (reduceMotion) {
        store.setViewport(target);
        return;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / CAMERA_ANIMATION_MS);
        const eased = easeInOutCubic(progress);
        useWorkspaceStore.getState().setViewport(lerpViewport(from, target, eased));
        if (progress < 1) animationRef.current = requestAnimationFrame(step);
        else animationRef.current = null;
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: Point) => {
      const size = getSize();
      const viewport = useWorkspaceStore.getState().viewport;
      const pivot = anchor ?? { x: size.width / 2, y: size.height / 2 };
      useWorkspaceStore.getState().setViewport(zoomAtPoint(viewport, viewport.zoom * factor, pivot));
    },
    [getSize],
  );

  const setZoom = useCallback(
    (zoom: number, anchor?: Point) => {
      const size = getSize();
      const viewport = useWorkspaceStore.getState().viewport;
      const pivot = anchor ?? { x: size.width / 2, y: size.height / 2 };
      useWorkspaceStore.getState().setViewport(zoomAtPoint(viewport, clampZoom(zoom), pivot));
    },
    [getSize],
  );

  const contentBounds = useCallback(() => {
    const list = [...rectsRef.current.values()];
    return boundsOfRects(list);
  }, []);

  const fitToContent = useCallback(
    (options?: { animate?: boolean; padding?: number }) => {
      const bounds = contentBounds();
      const size = getSize();
      if (!bounds) {
        animateTo({ x: -size.width / 2 + 118, y: -size.height / 2 + 46, zoom: 1 });
        return;
      }
      const viewport = fitToBounds(padRect(bounds, 0), size, {
        padding: options?.padding ?? 90,
        maxZoom: 1,
      });
      if (options?.animate === false) useWorkspaceStore.getState().setViewport(viewport);
      else animateTo(viewport);
    },
    [animateTo, contentBounds, getSize],
  );

  const centerOn = useCallback(
    (point: Point, options?: { zoom?: number; animate?: boolean }) => {
      const size = getSize();
      const current = useWorkspaceStore.getState().viewport;
      const viewport = centerOnPoint(point, size, options?.zoom ?? current.zoom);
      if (options?.animate === false) useWorkspaceStore.getState().setViewport(viewport);
      else animateTo(viewport);
    },
    [animateTo, getSize],
  );

  const centerOnPerson = useCallback(
    (personId: Id, options?: { zoom?: number; animate?: boolean }) => {
      const rect = rectsRef.current.get(personId);
      if (!rect) return;
      const zoom = options?.zoom ?? Math.max(useWorkspaceStore.getState().viewport.zoom, 0.85);
      centerOn({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, { ...options, zoom });
    },
    [centerOn],
  );

  const keepCentre = useCallback(
    (previous: { width: number; height: number }, next: { width: number; height: number }) => {
      if (previous.width === next.width && previous.height === next.height) return;
      if (previous.width <= 0 || previous.height <= 0) return;
      const { viewport } = useWorkspaceStore.getState();
      const centre = {
        x: viewport.x + previous.width / (2 * viewport.zoom),
        y: viewport.y + previous.height / (2 * viewport.zoom),
      };
      useWorkspaceStore.getState().setViewport({
        zoom: viewport.zoom,
        x: centre.x - next.width / (2 * viewport.zoom),
        y: centre.y - next.height / (2 * viewport.zoom),
      });
    },
    [],
  );

  const fitToPerson = useCallback(
    (personId: Id, options?: { animate?: boolean }) => {
      const rect = rectsRef.current.get(personId);
      const size = getSize();
      if (!rect) return;
      const viewport = fitToBounds(rect, size, { padding: 220, maxZoom: 1.25 });
      if (options?.animate === false) useWorkspaceStore.getState().setViewport(viewport);
      else animateTo(viewport);
    },
    [animateTo, getSize],
  );

  return useMemo<ViewportController>(
    () => ({
      zoomBy,
      zoomIn: (anchor) => zoomBy(ZOOM_STEP_FACTOR, anchor),
      zoomOut: (anchor) => zoomBy(1 / ZOOM_STEP_FACTOR, anchor),
      setZoom,
      panByScreen: (dx, dy) => {
        const viewport = useWorkspaceStore.getState().viewport;
        useWorkspaceStore.getState().setViewport({
          ...viewport,
          x: viewport.x - dx / viewport.zoom,
          y: viewport.y - dy / viewport.zoom,
        });
      },
      centerOn,
      centerOnPerson,
      fitToContent,
      fitToPerson,
      resetZoom: () => setZoom(1),
      keepCentre,
      visibleIds: (nodeRects, slack) => {
        const size = getSize();
        const viewport = useWorkspaceStore.getState().viewport;
        const view = {
          x: viewport.x,
          y: viewport.y,
          width: size.width / viewport.zoom,
          height: size.height / viewport.zoom,
        };
        return visibleNodeIds(nodeRects, view, slack);
      },
    }),
    [centerOn, centerOnPerson, fitToContent, fitToPerson, keepCentre, setZoom, zoomBy],
  );
}
