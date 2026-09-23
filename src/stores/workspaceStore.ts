"use client";

import { create } from "zustand";

import { DEFAULT_VIEWPORT } from "@/lib/db/repositories/canvas";
import { GENERATIONS_ENGINE_ID } from "@/lib/canvas/layout/ids";
import type { Id, Point, RelationshipType, Viewport } from "@/lib/domain/types";

/**
 * Workspace (canvas session) state.
 *
 * Deliberately NOT persisted here: viewport and node positions live in
 * IndexedDB (the canvas state table) so that "close the browser and reopen"
 * works without a server. This store is the transient UI truth for the current
 * session: what is selected, what is being dragged, which panel is open.
 *
 * High-frequency values (viewport, drag position) are also read imperatively so
 * that panning and zooming never re-render the node tree.
 */

export type RelationshipDraftMode = "create" | "link";

export interface RelationshipDraft {
  type: RelationshipType;
  /** The person the relationship is anchored to. */
  fromPersonId: Id;
  /** Which side of the anchor the new bond sits on (for placement). */
  placement: "parent" | "child" | "spouse" | "sibling" | "other";
}

export interface DragState {
  personId: Id;
  position: Point;
  /** True once the pointer has actually moved (distinguishes click from drag). */
  moved: boolean;
}

/**
 * Relationship Finder mode.
 *
 * The finder is a *mode* on the canvas, not a dialog: the user is asked to pick
 * person A by clicking a node, then person B, then to ask for the relationship.
 * The computation itself happens where the graph lives (the workspace), so this
 * state only records which stage the user is in.
 */
export type FinderStage = "source" | "target" | "ready" | "done";

export interface FinderState {
  /** True while the finder bar is open and the canvas is in pick mode. */
  open: boolean;
  stage: FinderStage;
  sourcePersonId: Id | null;
  targetPersonId: Id | null;
  /** True once the user has asked for the relationship (stage "done"). */
  computed: boolean;
}

const CLOSED_FINDER: FinderState = {
  open: false,
  stage: "source",
  sourcePersonId: null,
  targetPersonId: null,
  computed: false,
};

export interface WorkspaceState {
  projectId: Id | null;
  viewport: Viewport;
  surface: { width: number; height: number };
  selectedPersonId: Id | null;
  hoveredPersonId: Id | null;
  detailsOpen: boolean;
  /** Person whose lineage is spotlighted (ancestors + descendants highlighted). */
  spotlightPersonId: Id | null;
  drag: DragState | null;
  relationshipDraft: RelationshipDraft | null;
  personFormOpen: boolean;
  layoutEngineId: string;
  minimapOpen: boolean;
  shortcutsOpen: boolean;
  finderOpen: boolean;
  finder: FinderState;
  guideOpen: boolean;
  settingsOpen: boolean;
  /** Transient status line, e.g. "Saved locally". */
  status: { message: string; tone: "info" | "success" | "error" } | null;

  setProject(projectId: Id | null): void;
  setViewport(viewport: Viewport): void;
  patchViewport(patch: Partial<Viewport>): void;
  setSurface(size: { width: number; height: number }): void;
  select(personId: Id | null, options?: { openDetails?: boolean }): void;
  hover(personId: Id | null): void;
  setDetailsOpen(open: boolean): void;
  toggleSpotlight(personId: Id): void;
  setSpotlight(personId: Id | null): void;
  startDrag(personId: Id, position: Point): void;
  updateDrag(position: Point): void;
  endDrag(): void;
  beginRelationship(draft: RelationshipDraft): void;
  cancelRelationship(): void;
  setPersonFormOpen(open: boolean): void;
  setLayoutEngine(engineId: string): void;
  toggleMinimap(): void;
  setShortcutsOpen(open: boolean): void;
  setFinderOpen(open: boolean): void;
  openFinder(): void;
  closeFinder(): void;
  pickFinderPerson(personId: Id): void;
  setFinderStage(stage: FinderStage): void;
  swapFinderPersons(): void;
  computeFinder(): void;
  clearFinderResult(): void;
  setGuideOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setStatus(message: string | null, tone?: "info" | "success" | "error"): void;
  reset(): void;
}

const SURFACE_DEFAULT = { width: 1280, height: 800 };

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  viewport: { ...DEFAULT_VIEWPORT },
  surface: SURFACE_DEFAULT,
  selectedPersonId: null,
  hoveredPersonId: null,
  detailsOpen: false,
  spotlightPersonId: null,
  drag: null,
  relationshipDraft: null,
  personFormOpen: false,
  layoutEngineId: GENERATIONS_ENGINE_ID,
  minimapOpen: true,
  shortcutsOpen: false,
  finderOpen: false,
  finder: CLOSED_FINDER,
  guideOpen: false,
  settingsOpen: false,
  status: null,

  setProject: (projectId) =>
    set({
      projectId,
      selectedPersonId: null,
      hoveredPersonId: null,
      detailsOpen: false,
      spotlightPersonId: null,
      drag: null,
      relationshipDraft: null,
      personFormOpen: false,
      finder: CLOSED_FINDER,
      guideOpen: false,
    }),

  setViewport: (viewport) => set({ viewport }),
  patchViewport: (patch) => set((state) => ({ viewport: { ...state.viewport, ...patch } })),
  setSurface: (surface) => set({ surface }),

  select: (personId, options) =>
    set((state) => ({
      selectedPersonId: personId,
      detailsOpen: personId ? (options?.openDetails ?? state.detailsOpen) : false,
      /*
       * Clicking a *different* person while a relationship is being drafted is
       * how the link gets completed (the click means "this one"), so the draft
       * has to survive the selection that the same click performs. It is
       * cleared by Escape, by the draft banner's cancel button, and by clicking
       * empty canvas - all of which mean "never mind".
       */
      relationshipDraft: personId === null ? null : state.relationshipDraft,
    })),

  hover: (personId) => set({ hoveredPersonId: personId }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),

  toggleSpotlight: (personId) =>
    set((state) => ({
      spotlightPersonId: state.spotlightPersonId === personId ? null : personId,
    })),
  setSpotlight: (spotlightPersonId) => set({ spotlightPersonId }),

  startDrag: (personId, position) => set({ drag: { personId, position, moved: false } }),
  updateDrag: (position) =>
    set((state) => (state.drag ? { drag: { ...state.drag, position, moved: true } } : {})),
  endDrag: () => set({ drag: null }),

  beginRelationship: (relationshipDraft) => set({ relationshipDraft }),
  cancelRelationship: () => set({ relationshipDraft: null }),
  setPersonFormOpen: (personFormOpen) => set({ personFormOpen }),
  setLayoutEngine: (layoutEngineId) => set({ layoutEngineId }),
  toggleMinimap: () => set((state) => ({ minimapOpen: !state.minimapOpen })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setFinderOpen: (finderOpen) => set({ finderOpen }),

  openFinder: () =>
    set((state) => ({
      finder: {
        open: true,
        stage: state.finder.sourcePersonId ? (state.finder.targetPersonId ? "ready" : "target") : "source",
        sourcePersonId: state.finder.sourcePersonId,
        targetPersonId: state.finder.targetPersonId,
        computed: state.finder.computed,
      },
      // Picking people works by clicking nodes, so the details panel must not
      // open over the canvas while the finder is active.
      detailsOpen: false,
    })),

  closeFinder: () => set({ finder: CLOSED_FINDER }),

  /**
   * A click on a person while the finder is open fills the next empty slot, so
   * the flow is: select A, select B, ask for the relationship.
   */
  pickFinderPerson: (personId) =>
    set((state) => {
      if (!state.finder.open) return {};
      const current = state.finder;

      if (current.sourcePersonId === personId) {
        return {
          finder: { ...current, stage: current.targetPersonId ? "ready" : "target", computed: false },
        };
      }
      if (current.targetPersonId === personId) {
        return { finder: { ...current, stage: "ready", computed: false } };
      }
      if (!current.sourcePersonId || current.stage === "source") {
        return {
          finder: {
            ...current,
            sourcePersonId: personId,
            stage: "target",
            computed: false,
          },
        };
      }
      if (!current.targetPersonId || current.stage === "target") {
        return {
          finder: { ...current, targetPersonId: personId, stage: "ready", computed: false },
        };
      }
      // Both slots are taken: keep A and make this person the new target.
      return { finder: { ...current, targetPersonId: personId, stage: "ready", computed: false } };
    }),

  setFinderStage: (stage) =>
    set((state) => ({ finder: { ...state.finder, stage, open: true } })),

  swapFinderPersons: () =>
    set((state) => ({
      finder: {
        ...state.finder,
        sourcePersonId: state.finder.targetPersonId,
        targetPersonId: state.finder.sourcePersonId,
      },
    })),

  computeFinder: () =>
    set((state) => ({ finder: { ...state.finder, stage: "done", computed: true } })),

  clearFinderResult: () =>
    set((state) => ({
      finder: { ...CLOSED_FINDER, open: state.finder.open },
    })),

  setGuideOpen: (guideOpen) => set({ guideOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setStatus: (message, tone = "info") =>
    set({ status: message ? { message, tone } : null }),

  reset: () =>
    set({
      projectId: null,
      viewport: { ...DEFAULT_VIEWPORT },
      surface: SURFACE_DEFAULT,
      selectedPersonId: null,
      hoveredPersonId: null,
      detailsOpen: false,
      spotlightPersonId: null,
      drag: null,
      relationshipDraft: null,
      personFormOpen: false,
      minimapOpen: true,
      shortcutsOpen: false,
      finderOpen: false,
      finder: CLOSED_FINDER,
      guideOpen: false,
      settingsOpen: false,
      status: null,
    }),
}));

/** Imperative read - used inside rAF loops and pointer handlers. */
export function readViewport(): Viewport {
  return useWorkspaceStore.getState().viewport;
}
