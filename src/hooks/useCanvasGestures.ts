"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP } from "@/lib/canvas/constants";
import { screenToWorld, wheelZoomFactor, zoomAtPoint } from "@/lib/canvas/viewport";
import type { Point, Viewport } from "@/lib/domain/types";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Canvas input.
 *
 * One place owns every gesture so they cannot fight each other:
 *
 *   drag on empty space        pan (mouse, pen, one-finger touch)
 *   wheel / two-finger scroll  zoom (or pan, per preference) - ctrl/cmd always zooms
 *   pinch                      zoom + pan together, anchored between the fingers
 *   click empty space          clear selection
 *   double click empty space   create a person at that exact world point
 *   double tap empty space     zoom in on touch (and back out when close)
 *
 * Node dragging is NOT handled here - a node owns its own pointer events so the
 * surface never has to guess what the user grabbed.
 */

export interface CanvasGesturesOptions {
  surfaceRef: React.RefObject<HTMLElement | null>;
  onEmptyClick?: () => void;
  onEmptyDoubleClick?: (worldPoint: Point) => void;
  /**
   * A two-finger-tap-style double tap on touch. Fingers have no second mouse
   * button and no keyboard, so `zoom in here` has to exist as a gesture; the
   * argument is the *screen* point, because the zoom is anchored to the finger.
   */
  onEmptyDoubleTap?: (screenPoint: Point) => void;
  /**
   * Wheel zoom, handed to the camera rather than applied here: the camera eases
   * toward a zoom target, which is what turns a mouse wheel's coarse steps into
   * a glide. Without it the wheel would jump the viewport directly.
   */
  onZoomGesture?: (factor: number, anchor: Point) => void;
  /** Called when a pan gesture starts, so the UI can show a grabbing cursor. */
  onPanningChange?: (panning: boolean) => void;
}

export function useCanvasGestures({
  surfaceRef,
  onEmptyClick,
  onEmptyDoubleClick,
  onEmptyDoubleTap,
  onZoomGesture,
  onPanningChange,
}: CanvasGesturesOptions) {
  const pointers = useRef(new Map<number, Point>());
  /** Previous touch tap, for recognising a double tap without a dblclick. */
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);
  /*
   * The wheel listener has to be attached imperatively (it must not be passive,
   * because a canvas that lets the page scroll underneath a zoom is unusable).
   * The surface, however, only exists once the project has loaded: on the first
   * render it is a loading placeholder and the ref is empty, so attaching in a
   * mount-only effect would silently leave the wheel dead - no zoom, no pan, no
   * error. Tracking the resolved element keeps the attach honest whenever the
   * canvas actually appears.
   */
  const [wheelTarget, setWheelTarget] = useState<HTMLElement | null>(null);
  const panRef = useRef<{ pointerId: number; start: Point; viewport: Viewport; moved: boolean } | null>(
    null,
  );
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
    worldAnchor: Point;
  } | null>(null);

  const setViewport = useCallback((viewport: Viewport) => {
    useWorkspaceStore.getState().setViewport(viewport);
  }, []);

  const localPoint = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return { x: event.clientX, y: event.clientY };
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },
    [surfaceRef],
  );

  // Pick up the surface as soon as it is in the DOM (see `wheelTarget`).
  useEffect(() => {
    const element = surfaceRef.current;
    if (element && element !== wheelTarget) setWheelTarget(element);
  });

  // ---- wheel (non-passive, attached manually) ---------------------------
  useEffect(() => {
    const surface = wheelTarget;
    if (!surface) return;

    const onWheel = (event: WheelEvent) => {
      // Let UI chrome inside the surface (panels, popovers) scroll normally.
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-canvas-ui]")) return;

      event.preventDefault();

      const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const deltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const viewport = useWorkspaceStore.getState().viewport;
      const anchor = localPoint(event);

      const isPinch = event.ctrlKey || event.metaKey;
      const wantsPan =
        !isPinch && (event.shiftKey || usePreferencesStore.getState().preferences.wheelBehavior === "pan");

      if (wantsPan) {
        const dx = event.shiftKey && deltaX === 0 ? deltaY : deltaX;
        const dy = event.shiftKey ? 0 : deltaY;
        setViewport({
          ...viewport,
          x: viewport.x + dx / viewport.zoom,
          y: viewport.y + dy / viewport.zoom,
        });
        return;
      }

      const factor = wheelZoomFactor(deltaY, isPinch);
      if (onZoomGesture) onZoomGesture(factor, anchor);
      else setViewport(zoomAtPoint(viewport, viewport.zoom * factor, anchor));
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [localPoint, onZoomGesture, setViewport, wheelTarget]);

  // ---- pointer gestures -------------------------------------------------
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      // Nodes, toolbars and panel chrome handle their own events.
      if (target?.closest("[data-canvas-node], [data-canvas-ui]")) return;
      if (event.button === 2) return;

      const point = localPoint(event);
      pointers.current.set(event.pointerId, point);
      surfaceRef.current?.setPointerCapture(event.pointerId);

      if (pointers.current.size === 1) {
        panRef.current = {
          pointerId: event.pointerId,
          start: point,
          viewport: useWorkspaceStore.getState().viewport,
          moved: false,
        };
        onPanningChange?.(true);
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const viewport = useWorkspaceStore.getState().viewport;
        pinchRef.current = {
          startDistance: distance,
          startZoom: viewport.zoom,
          worldAnchor: screenToWorld(mid, viewport),
        };
        panRef.current = null;
      }
    },
    [localPoint, onPanningChange, surfaceRef],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      const point = localPoint(event);
      pointers.current.set(event.pointerId, point);

      // ---- pinch: zoom and pan in a single motion ----------------------
      if (pointers.current.size >= 2 && pinchRef.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { startDistance, startZoom, worldAnchor } = pinchRef.current;
        const zoom = startZoom * (distance / startDistance);
        const clamped = Math.min(3, Math.max(0.15, zoom));
        setViewport({
          zoom: clamped,
          x: worldAnchor.x - mid.x / clamped,
          y: worldAnchor.y - mid.y / clamped,
        });
        return;
      }

      // ---- drag to pan --------------------------------------------------
      const pan = panRef.current;
      if (pan && pan.pointerId === event.pointerId) {
        const dx = point.x - pan.start.x;
        const dy = point.y - pan.start.y;
        if (!pan.moved && Math.hypot(dx, dy) > 3) pan.moved = true;
        setViewport({
          ...pan.viewport,
          x: pan.viewport.x - dx / pan.viewport.zoom,
          y: pan.viewport.y - dy / pan.viewport.zoom,
        });
      }
    },
    [localPoint, setViewport],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Pointer events from nodes and chrome bubble up here. Only a pointer this
      // hook actually started tracking may end a gesture - otherwise clicking a
      // person would also register as a click on empty canvas and clear the
      // very selection the click just made.
      if (!pointers.current.has(event.pointerId)) return;

      const wasPanning = panRef.current?.moved ?? false;
      const now = performance.now();
      const point = localPoint(event);
      pointers.current.delete(event.pointerId);
      surfaceRef.current?.releasePointerCapture?.(event.pointerId);

      if (pointers.current.size < 2) pinchRef.current = null;
      if (pointers.current.size === 0) {
        panRef.current = null;
        onPanningChange?.(false);
        if (wasPanning) {
          lastTapRef.current = null;
          return;
        }

        // Touch only. A desktop double click arrives as a real `dblclick` and
        // means "add a person here", so recognising it here as well would open
        // the dialog *and* zoom.
        if (event.pointerType === "touch" && onEmptyDoubleTap) {
          const previousTap = lastTapRef.current;
          if (
            previousTap &&
            now - previousTap.time < DOUBLE_TAP_MS &&
            Math.hypot(point.x - previousTap.point.x, point.y - previousTap.point.y) < DOUBLE_TAP_SLOP
          ) {
            lastTapRef.current = null;
            onEmptyDoubleTap(point);
            // A double tap is not two selections: swallow the second tap.
            return;
          }
          lastTapRef.current = { time: now, point };
        }

        onEmptyClick?.();
        return;
      }
      // Dropping from two fingers to one: restart the pan from here.
      const [remainingId, remainingPoint] = [...pointers.current.entries()][0];
      panRef.current = {
        pointerId: remainingId,
        start: remainingPoint,
        viewport: useWorkspaceStore.getState().viewport,
        moved: false,
      };
    },
    [localPoint, onEmptyClick, onEmptyDoubleTap, onPanningChange, surfaceRef],
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-canvas-node], [data-canvas-ui]")) return;
      const viewport = useWorkspaceStore.getState().viewport;
      const world = screenToWorld(localPoint(event), viewport);
      onEmptyDoubleClick?.(world);
    },
    [localPoint, onEmptyDoubleClick],
  );

  return {
    surfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    },
  };
}
