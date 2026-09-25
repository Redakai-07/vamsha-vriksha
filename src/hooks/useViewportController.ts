"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  CAMERA_ANIMATION_MS,
  CAMERA_CHASE_MAX_MS,
  CAMERA_SETTLE_DISTANCE,
  CAMERA_SETTLE_ZOOM,
  ZOOM_SMOOTHING_MS,
  ZOOM_STEP_FACTOR,
} from "@/lib/canvas/constants";
import { gridBackgroundImage, gridStyle } from "@/lib/canvas/grid";
import type { NodeRects } from "@/lib/canvas/geometry";
import { boundsOfRects, padRect, visibleNodeIds } from "@/lib/canvas/geometry";
import {
  cameraMovedElsewhere,
  centerOnPoint,
  chaseStep,
  clampZoom,
  easeInOutCubic,
  fitToBounds,
  lerpViewport,
  zoomAtPoint,
  type Rect,
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
 * Two details separate a canvas that merely works from one that feels right:
 *
 *  - **Zoom chases a target.** A wheel event moves a target viewport and the
 *    camera eases toward it (see `ZOOM_SMOOTHING_MS`). A mouse wheel's coarse
 *    steps become a glide, a trackpad's stream of tiny steps stays attached to
 *    the fingers, and either way the world point under the cursor stays pinned.
 *  - **One writer at a time.** Every animation records what it last wrote; if
 *    anything else moves the camera (a drag, a pinch, a rotation), the animation
 *    notices within a frame and stands down. No more fights over the viewport.
 */

export interface ViewportController {
  /** Eased zoom around a screen-space anchor (cursor, pinch mid, double tap). */
  zoomBy(factor: number, anchor?: Point): void;
  zoomIn(anchor?: Point): void;
  zoomOut(anchor?: Point): void;
  setZoom(zoom: number, anchor?: Point): void;
  /** Immediate, zoom-independent pan. */
  panByScreen(dx: number, dy: number): void;
  /** Centres a world point (animated). */
  centerOn(point: Point, options?: { zoom?: number; animate?: boolean }): void;
  centerOnPerson(personId: Id, options?: { zoom?: number; animate?: boolean }): void;
  /** Frames an arbitrary set of world rectangles: fit all, a path, one person. */
  fitToRects(
    targets: Rect[],
    options?: { animate?: boolean; padding?: number; maxZoom?: number },
  ): void;
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
  /** The world rectangle currently on screen. */
  visibleRect(): Rect;
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
  const zoomFrameRef = useRef<number | null>(null);
  const zoomTargetRef = useRef<Viewport | null>(null);
  /** When the zoom target last moved, so a chase can be given a deadline. */
  const zoomTargetSetAtRef = useRef(0);
  /** The viewport this controller last wrote - the "one writer" handshake. */
  const appliedRef = useRef<Viewport | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `--canvas-grid`, read from CSS once instead of once per animation frame. */
  const gridColourRef = useRef<string | null>(null);
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

  /** Every camera write goes through here, so animations can spot intruders. */
  const write = useCallback((viewport: Viewport) => {
    appliedRef.current = viewport;
    useWorkspaceStore.getState().setViewport(viewport);
  }, []);

  // ---- the grid colour (a CSS variable read, so cache it) ----------------
  useEffect(() => {
    const read = () => {
      gridColourRef.current =
        getComputedStyle(document.documentElement).getPropertyValue("--canvas-grid").trim() || null;
    };
    read();
    // The theme is applied by swapping a class on <html>, so that is the only
    // event that can change the value.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

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
        grid.style.backgroundImage = gridBackgroundImage(
          gridColourRef.current ?? "currentColor",
          style,
        );
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
      if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
    },
    [],
  );

  /** Stops whichever camera animation is running, without touching the camera. */
  const stopAnimations = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (zoomFrameRef.current !== null) {
      cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    }
    zoomTargetRef.current = null;
  }, []);

  // ---- animated moves ---------------------------------------------------
  const animateTo = useCallback(
    (target: Viewport) => {
      stopAnimations();
      const store = useWorkspaceStore.getState();

      if (usePreferencesStore.getState().preferences.reduceMotion) {
        write(target);
        return;
      }

      const from = store.viewport;
      appliedRef.current = from;
      const startedAt = performance.now();
      const step = (now: number) => {
        const current = useWorkspaceStore.getState().viewport;
        // The user grabbed the canvas mid-flight: hand it straight back.
        if (cameraMovedElsewhere(current, appliedRef.current)) {
          animationRef.current = null;
          return;
        }
        const progress = Math.min(1, (now - startedAt) / CAMERA_ANIMATION_MS);
        write(lerpViewport(from, target, easeInOutCubic(progress)));
        if (progress < 1) animationRef.current = requestAnimationFrame(step);
        else animationRef.current = null;
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [stopAnimations, write],
  );

  /**
   * Zoom that chases a target. Consecutive calls accumulate into the *target*
   * rather than the live viewport, so a fast scroll zooms as far as the user
   * scrolled even while the camera is still catching up.
   */
  const smoothZoomTo = useCallback(
    (target: Viewport) => {
      zoomTargetRef.current = target;
      zoomTargetSetAtRef.current = performance.now();
      if (zoomFrameRef.current !== null) return; // already chasing

      if (usePreferencesStore.getState().preferences.reduceMotion) {
        zoomTargetRef.current = null;
        write(target);
        return;
      }

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      appliedRef.current = useWorkspaceStore.getState().viewport;

      let last = performance.now();
      const step = (now: number) => {
        const goal = zoomTargetRef.current;
        const current = useWorkspaceStore.getState().viewport;
        if (!goal || cameraMovedElsewhere(current, appliedRef.current)) {
          zoomTargetRef.current = null;
          zoomFrameRef.current = null;
          return;
        }
        const deltaMs = Math.min(64, Math.max(0, now - last));
        last = now;
        const { viewport: next, settled } = chaseStep(current, goal, {
          deltaMs,
          elapsedMs: now - zoomTargetSetAtRef.current,
          timeConstantMs: ZOOM_SMOOTHING_MS,
          maxMs: CAMERA_CHASE_MAX_MS,
          distance: CAMERA_SETTLE_DISTANCE,
          zoomEpsilon: CAMERA_SETTLE_ZOOM,
        });
        write(next);
        if (settled) {
          zoomTargetRef.current = null;
          zoomFrameRef.current = null;
          return;
        }
        zoomFrameRef.current = requestAnimationFrame(step);
      };
      zoomFrameRef.current = requestAnimationFrame(step);
    },
    [write],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: Point) => {
      const size = getSize();
      const base = zoomTargetRef.current ?? useWorkspaceStore.getState().viewport;
      const pivot = anchor ?? { x: size.width / 2, y: size.height / 2 };
      smoothZoomTo(zoomAtPoint(base, base.zoom * factor, pivot));
    },
    [getSize, smoothZoomTo],
  );

  const setZoom = useCallback(
    (zoom: number, anchor?: Point) => {
      const size = getSize();
      const base = zoomTargetRef.current ?? useWorkspaceStore.getState().viewport;
      const pivot = anchor ?? { x: size.width / 2, y: size.height / 2 };
      smoothZoomTo(zoomAtPoint(base, clampZoom(zoom), pivot));
    },
    [getSize, smoothZoomTo],
  );

  /**
   * The one framing primitive. Fit-all, focus-a-person and focus-a-path are all
   * "put these rectangles in view", so they share this and cannot drift apart.
   */
  const fitToRects = useCallback(
    (
      targets: Rect[],
      options?: { animate?: boolean; padding?: number; maxZoom?: number },
    ) => {
      const bounds = boundsOfRects(targets);
      if (!bounds) return;
      const viewport = fitToBounds(bounds, getSize(), {
        padding: options?.padding ?? 90,
        maxZoom: options?.maxZoom ?? 1,
      });
      if (options?.animate === false) write(viewport);
      else animateTo(viewport);
    },
    [animateTo, getSize, write],
  );

  const fitToContent = useCallback(
    (options?: { animate?: boolean; padding?: number }) => {
      const bounds = boundsOfRects(rectsRef.current.values());
      if (!bounds) {
        // Nothing to frame yet: put the world origin where the eye lands, so
        // the first person appears under the cursor rather than off-screen.
        const size = getSize();
        animateTo({ x: -size.width / 2 + 118, y: -size.height / 2 + 46, zoom: 1 });
        return;
      }
      fitToRects([bounds], options);
    },
    [animateTo, fitToRects, getSize],
  );

  const centerOn = useCallback(
    (point: Point, options?: { zoom?: number; animate?: boolean }) => {
      const size = getSize();
      const current = useWorkspaceStore.getState().viewport;
      const viewport = centerOnPoint(point, size, options?.zoom ?? current.zoom);
      if (options?.animate === false) write(viewport);
      else animateTo(viewport);
    },
    [animateTo, getSize, write],
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
      write({
        zoom: viewport.zoom,
        x: centre.x - next.width / (2 * viewport.zoom),
        y: centre.y - next.height / (2 * viewport.zoom),
      });
    },
    [write],
  );

  const fitToPerson = useCallback(
    (personId: Id, options?: { animate?: boolean }) => {
      const rect = rectsRef.current.get(personId);
      if (!rect) return;
      fitToRects([rect], { padding: 220, maxZoom: 1.25, animate: options?.animate });
    },
    [fitToRects],
  );

  const visibleRect = useCallback((): Rect => {
    const size = getSize();
    const { viewport } = useWorkspaceStore.getState();
    return {
      x: viewport.x,
      y: viewport.y,
      width: size.width / viewport.zoom,
      height: size.height / viewport.zoom,
    };
  }, [getSize]);

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
      fitToRects,
      fitToContent,
      fitToPerson,
      resetZoom: () => setZoom(1),
      keepCentre,
      visibleRect,
      visibleIds: (nodeRects, slack) => visibleNodeIds(nodeRects, visibleRect(), slack),
    }),
    [centerOn, centerOnPerson, fitToContent, fitToPerson, fitToRects, keepCentre, setZoom, visibleRect, zoomBy],
  );
}
