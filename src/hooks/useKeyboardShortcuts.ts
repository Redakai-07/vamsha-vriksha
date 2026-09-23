"use client";

import { useEffect } from "react";

import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface ShortcutHandlers {
  onFit(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onResetZoom(): void;
  onNewPerson(): void;
  onTidyUp(): void;
  onCenterSelected(): void;
  onDeleteSelected(): void;
  onToggleFinder(): void;
  onToggleMinimap(): void;
  onToggleGuide(): void;
  onToggleHelp(): void;
  onPanBy(dx: number, dy: number): void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable ||
    Boolean(element.closest("[data-canvas-ui]"))
  );
}

/**
 * Keyboard shortcuts. Deliberately conservative: typing in any field (including
 * the relationship pickers inside the canvas chrome) disables every shortcut,
 * and Escape always means "get me out of here".
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const store = useWorkspaceStore.getState();

      if (event.key === "Escape") {
        if (store.relationshipDraft) {
          store.cancelRelationship();
          event.preventDefault();
          return;
        }
        if (store.shortcutsOpen) {
          store.setShortcutsOpen(false);
          event.preventDefault();
          return;
        }
        if (store.finderOpen) {
          store.setFinderOpen(false);
          event.preventDefault();
          return;
        }
        if (store.finder.open) {
          store.closeFinder();
          event.preventDefault();
          return;
        }
        if (store.guideOpen) {
          store.setGuideOpen(false);
          event.preventDefault();
          return;
        }
        if (store.detailsOpen) {
          store.setDetailsOpen(false);
          event.preventDefault();
        }
        return;
      }

      if (isTypingTarget(event.target)) return;

      const meta = event.metaKey || event.ctrlKey;

      switch (event.key) {
        case "f":
        case "F":
          handlers.onFit();
          event.preventDefault();
          break;
        case "0":
          handlers.onFit();
          event.preventDefault();
          break;
        case "1":
          handlers.onResetZoom();
          event.preventDefault();
          break;
        case "+":
        case "=":
          handlers.onZoomIn();
          event.preventDefault();
          break;
        case "-":
        case "_":
          handlers.onZoomOut();
          event.preventDefault();
          break;
        case "n":
        case "N":
          if (!meta) handlers.onNewPerson();
          event.preventDefault();
          break;
        case "l":
        case "L":
          if (!meta) handlers.onTidyUp();
          event.preventDefault();
          break;
        case "c":
        case "C":
          if (!meta) handlers.onCenterSelected();
          event.preventDefault();
          break;
        case "/":
          handlers.onToggleFinder();
          event.preventDefault();
          break;
        case "m":
        case "M":
          handlers.onToggleMinimap();
          event.preventDefault();
          break;
        case "g":
        case "G":
          handlers.onToggleGuide();
          event.preventDefault();
          break;
        case "?":
          handlers.onToggleHelp();
          event.preventDefault();
          break;
        case "Delete":
        case "Backspace":
          if (store.selectedPersonId) {
            handlers.onDeleteSelected();
            event.preventDefault();
          }
          break;
        case "ArrowUp":
          handlers.onPanBy(0, 90);
          event.preventDefault();
          break;
        case "ArrowDown":
          handlers.onPanBy(0, -90);
          event.preventDefault();
          break;
        case "ArrowLeft":
          handlers.onPanBy(90, 0);
          event.preventDefault();
          break;
        case "ArrowRight":
          handlers.onPanBy(-90, 0);
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handlers]);
}
