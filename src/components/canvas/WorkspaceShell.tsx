"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AddRelativeDialog } from "@/components/person/AddRelativeDialog";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { FamilyCanvas } from "@/components/canvas/FamilyCanvas";
import type { RelationshipDraftMode } from "@/components/canvas/NodeQuickActions";
import {
  PersonFormDialog,
  type PersonFormValues,
} from "@/components/person/PersonFormDialog";
import { PersonDetailsPanel } from "@/components/person/PersonDetailsPanel";
import { RelationshipFinder } from "@/components/kinship/RelationshipFinder";
import { RelationshipFinderBar } from "@/components/kinship/RelationshipFinderBar";
import { RelationshipGuide } from "@/components/kinship/RelationshipGuide";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ShortcutsDialog } from "@/components/canvas/ShortcutsDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/canvas/constants";
import { getLayoutEngine } from "@/lib/canvas/layout";
import { placeNear, type PlacementRelation } from "@/lib/canvas/placement";
import { exportProjectToFile, backupFileName, collectProjectBundle } from "@/lib/db/backup";
import { canvasRepo } from "@/lib/db/repositories/canvas";
import { peopleRepo } from "@/lib/db/repositories/people";
import { metaRepo } from "@/lib/db/repositories/preferences";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { relationshipsRepo } from "@/lib/db/repositories/relationships";
import { descendantIds, ancestorIds, type FamilyGraph } from "@/lib/domain/graph";
import { describeIntent, INTENT_META, resolveIntent, type RelativeIntent } from "@/lib/domain/relativeIntent";
import type { Gender, Id, Person, Point, Relationship, SpouseStatus } from "@/lib/domain/types";
import {
  describeRelationship,
  describeRelationshipAlternatives,
  languageForKinshipSystem,
  languageName,
  type RelationshipResult,
} from "@/lib/relationship";
import { downloadTextFile } from "@/lib/utils/download";
import { useCanvasGestures } from "@/hooks/useCanvasGestures";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProjectData } from "@/hooks/useProjectData";
import { useViewportController } from "@/hooks/useViewportController";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useWorkspaceStore, type RelationshipDraft } from "@/stores/workspaceStore";

export interface WorkspaceShellProps {
  projectId: Id;
  onBackToProjects(): void;
}

type PersonDialogState =
  | { kind: "create"; point: Point | null }
  | { kind: "edit"; person: Person }
  | null;

interface RelativeDialogState {
  anchor: Person;
  intent: RelativeIntent;
}

/**
 * The workspace: one project, its canvas, and every mutation that can happen in
 * it. All persistence goes through the repositories (IndexedDB); nothing here
 * knows about layout maths or DOM transforms beyond holding the refs.
 */
export function WorkspaceShell({ projectId, onBackToProjects }: WorkspaceShellProps) {
  const router = useRouter();
  const { project, people, graph, positions, rects, biodataByPerson, loading } =
    useProjectData(projectId);

  const preferences = usePreferencesStore((state) => state.preferences);
  const hydratePreferences = usePreferencesStore((state) => state.hydrate);

  const surfaceSize = useWorkspaceStore((state) => state.surface);
  const selectedPersonId = useWorkspaceStore((state) => state.selectedPersonId);
  const hoveredPersonId = useWorkspaceStore((state) => state.hoveredPersonId);
  const spotlightPersonId = useWorkspaceStore((state) => state.spotlightPersonId);
  const detailsOpen = useWorkspaceStore((state) => state.detailsOpen);
  const draft = useWorkspaceStore((state) => state.relationshipDraft);
  const layoutEngineId = useWorkspaceStore((state) => state.layoutEngineId);
  const minimapOpen = useWorkspaceStore((state) => state.minimapOpen);
  const shortcutsOpen = useWorkspaceStore((state) => state.shortcutsOpen);
  const finderOpen = useWorkspaceStore((state) => state.finderOpen);
  const finder = useWorkspaceStore((state) => state.finder);
  const guideOpen = useWorkspaceStore((state) => state.guideOpen);
  const settingsOpen = useWorkspaceStore((state) => state.settingsOpen);

  const [surfaceReady, setSurfaceReady] = useState(false);
  const [structureVisible, setStructureVisible] = useState(true);
  // Contextual help: shown once, to someone who has just added their first
  // person, and retired for good as soon as they act on it.
  const [coachMarkVisible, setCoachMarkVisible] = useState(false);
  const [coachMarkSeen, setCoachMarkSeen] = useState(false);
  const [personDialog, setPersonDialog] = useState<PersonDialogState>(null);
  const [relativeDialog, setRelativeDialog] = useState<RelativeDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const [pendingRelationshipDelete, setPendingRelationshipDelete] = useState<Relationship | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const camera = useViewportController({ layerRef, gridRef, surfaceRef, rects, projectId });

  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? null;
  const isEmptyProject = !loading && people.length === 0;

  /** One dismissal writes to the meta table, so the hint never nags twice. */
  const dismissCoachMark = useCallback(() => {
    setCoachMarkVisible(false);
    setCoachMarkSeen(true);
    void metaRepo.set(`coachMark:${projectId}`, "1");
  }, [projectId]);

  useEffect(() => {
    void hydratePreferences();
    useWorkspaceStore.getState().setProject(projectId);
  }, [hydratePreferences, projectId]);

  /**
   * The one piece of onboarding the canvas needs: it appears after the first
   * person exists (when there is something to point at) and disappears for good
   * the moment the user does the thing it describes - opening a profile or
   * recording a relationship.
   */
  useEffect(() => {
    if (loading || people.length === 0) return;
    if (graph.relationships.length > 0 || detailsOpen) {
      if (!coachMarkSeen && coachMarkVisible) dismissCoachMark();
      return;
    }
    let alive = true;
    void metaRepo.get(`coachMark:${projectId}`).then((value) => {
      if (alive && value !== "1") setCoachMarkVisible(true);
    });
    return () => {
      alive = false;
    };
  }, [
    coachMarkSeen,
    coachMarkVisible,
    detailsOpen,
    dismissCoachMark,
    graph.relationships.length,
    loading,
    people.length,
    projectId,
  ]);

  /**
   * Surface size, so fit/centre maths can use real pixels.
   *
   * This must re-run once the canvas actually mounts: while the project is
   * loading a placeholder is rendered instead, so the ref is still empty on the
   * first pass. Without the `loading` dependency the whole canvas would keep
   * centring against a stale 1280x800 default.
   */
  useEffect(() => {
    if (loading) return;
    const element = surfaceRef.current;
    if (!element) return;
    let previous: { width: number; height: number } | null = null;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      // Hold the centre of the view steady across a resize: rotating a phone or
      // losing the URL bar must not slide the family out of sight.
      if (previous) camera.keepCentre(previous, { width, height });
      previous = { width, height };
      useWorkspaceStore.getState().setSurface({ width, height });
      setSurfaceReady(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [camera, loading]);

  // Initial camera: restore the saved viewport, or frame the family once it
  // loads for the first time in a fresh project.
  const cameraInitialisedFor = useRef<Id | null>(null);
  useEffect(() => {
    if (loading || !surfaceReady || cameraInitialisedFor.current === projectId) return;
    cameraInitialisedFor.current = projectId;
    void (async () => {
      const canvas = await canvasRepo.get(projectId);
      const stored = canvas.viewport;
      const isDefault = stored.x === 0 && stored.y === 0 && stored.zoom === 1;
      if (!isDefault) {
        useWorkspaceStore.getState().setViewport(stored);
        return;
      }
      if (people.length) {
        camera.fitToContent({ animate: false });
        return;
      }
      // Fresh project: put the world origin in the middle of the surface so the
      // "add first person" node sits exactly where the eye lands.
      const size = useWorkspaceStore.getState().surface;
      useWorkspaceStore.getState().setViewport({
        x: -size.width / 2,
        y: -size.height / 2,
        zoom: 1,
      });
    })();
  }, [camera, loading, people.length, projectId, surfaceReady]);

  // ---- mutations --------------------------------------------------------
  const persistPosition = useCallback(
    (personId: Id, point: Point) => {
      void canvasRepo.setPosition(projectId, personId, point);
    },
    [projectId],
  );

  const createStandalonePerson = useCallback(
    async (values: PersonFormValues, point: Point | null) => {
      const person = await peopleRepo.create({
        projectId,
        name: values.name,
        displayName: values.displayName,
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
        dateOfDeath: values.dateOfDeath,
        profilePhoto: values.profilePhoto,
        notes: values.notes,
      });

      const target = point ?? placeNear({ x: 0, y: 0 }, "free", positions);
      await canvasRepo.setPosition(projectId, person.id, target);
      useWorkspaceStore.getState().select(person.id, { openDetails: false });
      camera.centerOn(
        { x: target.x + NODE_WIDTH / 2, y: target.y + NODE_HEIGHT / 2 },
        { animate: true },
      );
      toast.success(`${person.name} added`, {
        description: "Stored on this device. Add more detail any time.",
      });
    },
    [camera, positions, projectId],
  );

  const createRelative = useCallback(
    async (
      anchor: Person,
      intent: RelativeIntent,
      input: { name: string; gender?: Gender; label?: string; status?: SpouseStatus },
    ) => {
      const meta = INTENT_META[intent];
      const anchorPosition = positions.get(anchor.id) ?? { x: 0, y: 0 };

      const person = await peopleRepo.create({
        projectId,
        name: input.name,
        gender: input.gender ?? "unknown",
      });

      const target = placeNear(anchorPosition, meta.placement as PlacementRelation, positions);
      await canvasRepo.setPosition(projectId, person.id, target);

      const record = resolveIntent(intent, anchor.id, person.id, {
        label: input.label,
        status: input.status,
      });
      const result = await relationshipsRepo.create({ projectId, ...record });

      if (!result.ok) {
        toast.error("Relationship not saved", { description: result.reason });
        return;
      }

      useWorkspaceStore.getState().select(person.id, { openDetails: true });
      toast.success("Relationship recorded", {
        description: describeIntent(intent, anchor.displayName || anchor.name, person.name),
      });
    },
    [positions, projectId],
  );

  const linkRelative = useCallback(
    async (
      anchor: Person,
      intent: RelativeIntent,
      input: { personId: Id; label?: string; status?: SpouseStatus },
    ) => {
      const other = people.find((person) => person.id === input.personId);
      if (!other) return;
      const record = resolveIntent(intent, anchor.id, other.id, {
        label: input.label,
        status: input.status,
      });
      const result = await relationshipsRepo.create({ projectId, ...record });
      if (!result.ok) {
        toast.error("Relationship not saved", { description: result.reason });
        return;
      }
      toast.success("Relationship recorded", {
        description: describeIntent(intent, anchor.displayName || anchor.name, other.name),
      });
    },
    [people, projectId],
  );

  const removeRelationship = useCallback(async (relationship: Relationship) => {
    await relationshipsRepo.remove(relationship.id);
    toast.success("Relationship removed");
  }, []);

  const deletePerson = useCallback(
    async (person: Person) => {
      const result = await peopleRepo.remove(person.id);
      useWorkspaceStore.getState().select(null);
      toast.success(`${person.name} removed`, {
        description: result.removedRelationships
          ? `${result.removedRelationships} relationship record${result.removedRelationships === 1 ? "" : "s"} also removed.`
          : undefined,
      });
    },
    [],
  );

  const tidyUp = useCallback(
    async (engineId = layoutEngineId) => {
      if (!graph.people.length) return;
      const engine = getLayoutEngine(engineId);
      const result = engine.compute({
        people: graph.people,
        relationships: graph.relationships,
        graph,
      });
      useWorkspaceStore.getState().setLayoutEngine(engineId);

      const canvas = await canvasRepo.get(projectId);
      const pinned = new Set(canvas.pinnedPersonIds);
      const payload: Record<string, Point> = {};
      for (const [personId, point] of result.positions) {
        if (pinned.has(personId)) continue;
        payload[personId] = point;
      }
      await canvasRepo.setPositions(projectId, payload);

      // Wait for the new positions to flow back through the live query before
      // framing them, otherwise the camera frames the old layout.
      setTimeout(() => {
        camera.fitToContent({ animate: true });
      }, 60);
      toast.success(`Layout tidied · ${engine.label}`, {
        description: pinned.size
          ? `${pinned.size} pinned person${pinned.size === 1 ? "" : "s"} were left where you put them.`
          : "Positions are saved in this browser.",
      });
    },
    [camera, graph, layoutEngineId, projectId],
  );

  const exportProject = useCallback(async () => {
    if (!project) return;
    const json = await exportProjectToFile(project.id);
    const bundle = await collectProjectBundle(project.id);
    downloadTextFile(backupFileName(bundle?.project.name), json);
    toast.success("Lineage exported", { description: "A JSON file with everything, ready to back up." });
  }, [project]);

  const exportPerson = useCallback(
    async (person: Person) => {
      const bundle = await collectProjectBundle(projectId);
      if (!bundle) return;
      const ids = new Set<Id>([person.id]);
      for (const id of ancestorIds(graph, person.id)) ids.add(id);
      for (const id of descendantIds(graph, person.id)) ids.add(id);
      const peopleSlice = bundle.people.filter((item) => ids.has(item.id));
      downloadTextFile(
        `${person.name.replace(/\s+/g, "-").toLowerCase()}.json`,
        JSON.stringify(
          {
            format: "vamsha-vriksha/person-export",
            version: 1,
            person,
            relatives: peopleSlice,
            biodata: bundle.biodata.filter((item) => ids.has(item.id)),
            relationships: bundle.relationships.filter(
              (item) => ids.has(item.fromPersonId) && ids.has(item.toPersonId),
            ),
          },
          null,
          2,
        ),
      );
      toast.success("Person exported");
    },
    [graph, projectId],
  );

  // ---- relationship creation from the canvas -----------------------------
  /**
   * Two paths, both explicit:
   *  - "create a new person" opens a small inline form (name + gender) that also
   *    writes the relationship record, and
   *  - "link someone already recorded" arms the canvas: the next person you
   *    click becomes the other end of the bond (Escape cancels).
   */
  const handleIntent = useCallback(
    (personId: Id, intent: RelativeIntent, mode: RelationshipDraftMode) => {
      const anchor = people.find((person) => person.id === personId);
      if (!anchor) return;
      if (mode === "create") {
        setRelativeDialog({ anchor, intent });
        return;
      }
      useWorkspaceStore.getState().beginRelationship({
        type: draftTypeFor(intent),
        fromPersonId: anchor.id,
        placement: INTENT_META[intent].placement as RelationshipDraft["placement"],
      });
    },
    [people],
  );

  const handleOpenDetails = useCallback(
    (personId: Id) => {
      const state = useWorkspaceStore.getState();

      // While the Relationship Finder is open, a click on a node means "use this
      // person", not "open their profile" - the canvas stays in charge.
      if (state.finder.open) {
        state.pickFinderPerson(personId);
        return;
      }

      const activeDraft = state.relationshipDraft;
      const anchor = activeDraft ? graph.peopleById.get(activeDraft.fromPersonId) : undefined;

      if (activeDraft && anchor && personId !== anchor.id) {
        const intent = activeDraft.placement as RelativeIntent;
        state.cancelRelationship();
        void linkRelative(anchor, intent, { personId });
        state.select(personId, { openDetails: false });
        return;
      }

      state.select(personId, { openDetails: true });
    },
    [graph.peopleById, linkRelative],
  );

  // ---- relationship finder mode ------------------------------------------
  /**
   * The finder is a canvas mode: pick A, pick B, ask. The engine then walks the
   * graph, the canvas highlights every person and bond on the path, and this
   * result explains the path in words - terms come from the vocabulary, never
   * from the canvas.
   */
  const finderResult = useMemo<RelationshipResult | null>(() => {
    if (!finder.computed || !finder.sourcePersonId || !finder.targetPersonId) return null;
    return describeRelationship(graph, finder.sourcePersonId, finder.targetPersonId, {
      system: project?.kinshipSystem,
      language: languageForKinshipSystem(project?.kinshipSystem),
    });
  }, [finder.computed, finder.sourcePersonId, finder.targetPersonId, graph, project?.kinshipSystem]);

  const finderAlternatives = useMemo(() => {
    if (!finderResult || !finder.sourcePersonId || !finder.targetPersonId) return [];
    return describeRelationshipAlternatives(
      graph,
      finder.sourcePersonId,
      finder.targetPersonId,
      { system: project?.kinshipSystem, limit: 4 },
    ).slice(1);
  }, [finder.sourcePersonId, finder.targetPersonId, finderResult, graph, project?.kinshipSystem]);

  const finderPath = useMemo(() => {
    if (!finderResult?.path) return null;
    return {
      personIds: new Set<Id>(finderResult.path.personIds),
      relationshipIds: new Set<Id>(finderResult.path.edgeIds),
      sourcePersonId: finder.sourcePersonId,
      targetPersonId: finder.targetPersonId,
    };
  }, [finder.sourcePersonId, finder.targetPersonId, finderResult]);

  const frameFinderPath = useCallback(() => {
    if (!finderResult?.path) return;
    const boxes = finderResult.path.personIds
      .map((personId) => rects.get(personId))
      .filter((rect): rect is NonNullable<typeof rect> => Boolean(rect));
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((rect) => rect.x));
    const maxX = Math.max(...boxes.map((rect) => rect.x + rect.width));
    const minY = Math.min(...boxes.map((rect) => rect.y));
    const maxY = Math.max(...boxes.map((rect) => rect.y + rect.height));
    const zoom = Math.max(
      0.35,
      Math.min(
        1.1,
        surfaceSize.width / (maxX - minX + 260),
        surfaceSize.height / (maxY - minY + 260),
      ),
    );
    camera.centerOn(
      { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      { zoom, animate: true },
    );
  }, [camera, finderResult, rects, surfaceSize.height, surfaceSize.width]);

  const openFinderMode = useCallback(() => {
    const state = useWorkspaceStore.getState();
    // Pre-fill A with whoever is selected: the common question is "how is this
    // person related to ...?".
    if (state.selectedPersonId && !state.finder.sourcePersonId) {
      state.pickFinderPerson(state.selectedPersonId);
    }
    state.openFinder();
  }, []);

  // ---- keyboard ----------------------------------------------------------
  const shortcuts = useMemo(
    () => ({
      onFit: () => camera.fitToContent({ animate: true }),
      onZoomIn: () => camera.zoomIn(),
      onZoomOut: () => camera.zoomOut(),
      onResetZoom: () => camera.resetZoom(),
      onNewPerson: () => setPersonDialog({ kind: "create", point: null }),
      onTidyUp: () => void tidyUp(),
      onCenterSelected: () => {
        if (selectedPersonId) camera.centerOnPerson(selectedPersonId, { animate: true });
      },
      onDeleteSelected: () => {
        if (selectedPerson) setPendingDelete(selectedPerson);
      },
      onToggleFinder: () => {
        const state = useWorkspaceStore.getState();
        if (state.finder.open) state.closeFinder();
        else openFinderMode();
      },
      onToggleMinimap: () => useWorkspaceStore.getState().toggleMinimap(),
      onToggleGuide: () => useWorkspaceStore.getState().setGuideOpen(true),
      onToggleHelp: () => useWorkspaceStore.getState().setShortcutsOpen(true),
      onPanBy: (dx: number, dy: number) => camera.panByScreen(dx, dy),
    }),
    [camera, finderOpen, openFinderMode, selectedPerson, selectedPersonId, tidyUp],
  );

  useKeyboardShortcuts(shortcuts, !loading);

  // ---- gestures ----------------------------------------------------------
  const gestures = useCanvasGestures({
    surfaceRef,
    onEmptyClick: () => useWorkspaceStore.getState().select(null),
    onEmptyDoubleClick: (worldPoint) => setPersonDialog({ kind: "create", point: worldPoint }),
  });

  const countsByPerson = useMemo(() => {
    const map = new Map<Id, { parents: number; spouses: number; siblings: number; children: number }>();
    for (const person of people) {
      map.set(person.id, {
        parents: graph.parentsOf.get(person.id)?.length ?? 0,
        spouses: graph.spousesOf.get(person.id)?.length ?? 0,
        siblings: graph.siblingsOf.get(person.id)?.length ?? 0,
        children: graph.childrenOf.get(person.id)?.length ?? 0,
      });
    }
    return map;
  }, [graph, people]);

  /** Sibling bonds whose endpoints already share parents - drawn dotted. */
  const impliedRelationshipIds = useMemo(() => {
    const implied = new Set<string>();
    for (const relationship of graph.relationships) {
      if (relationship.type !== "sibling") continue;
      const parentsA = new Set(graph.parentsOf.get(relationship.fromPersonId) ?? []);
      const sharesParent = (graph.parentsOf.get(relationship.toPersonId) ?? []).some((parentId) =>
        parentsA.has(parentId),
      );
      if (sharesParent) implied.add(relationship.id);
    }
    return implied;
  }, [graph]);

  if (loading || !project) {
    return (
      <div className="flex min-h-dvh flex-col">
        <CanvasToolbar
          project={project ?? null}
          graph={graph}
          layoutEngineId={layoutEngineId}
          minimapOpen={minimapOpen}
          culturalTermsVisible={preferences.showCulturalTerms}
          onRenameProject={() => undefined}
          onBackToProjects={onBackToProjects}
          onAddPerson={() => undefined}
          onTidyUp={() => undefined}
          onFit={() => undefined}
          onToggleMinimap={() => undefined}
          onToggleCulturalTerms={() => undefined}
          onOpenFinder={() => undefined}
          finderActive={false}
          onOpenGuide={() => undefined}
          onOpenSettings={() => undefined}
          onOpenShortcuts={() => undefined}
          onExport={() => undefined}
          structureVisible={false}
          onToggleStructure={() => undefined}
        />
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening this lineage from this device…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <CanvasToolbar
        project={project}
        graph={graph}
        layoutEngineId={layoutEngineId}
        minimapOpen={minimapOpen}
        culturalTermsVisible={preferences.showCulturalTerms}
        onRenameProject={(name) => void projectsRepo.update(projectId, { name })}
        onBackToProjects={onBackToProjects}
        onAddPerson={() => setPersonDialog({ kind: "create", point: null })}
        onTidyUp={(engineId) => void tidyUp(engineId)}
        onFit={() => camera.fitToContent({ animate: true })}
        onToggleMinimap={() => useWorkspaceStore.getState().toggleMinimap()}
        onToggleCulturalTerms={() =>
          void usePreferencesStore.getState().update({
            showCulturalTerms: !preferences.showCulturalTerms,
          })
        }
        onOpenFinder={openFinderMode}
        finderActive={finder.open}
        onOpenGuide={() => useWorkspaceStore.getState().setGuideOpen(true)}
        onOpenSettings={() => useWorkspaceStore.getState().setSettingsOpen(true)}
        onOpenShortcuts={() => useWorkspaceStore.getState().setShortcutsOpen(true)}
        onExport={() => void exportProject()}
        structureVisible={structureVisible}
        onToggleStructure={() => setStructureVisible((visible) => !visible)}
      />

      <FamilyCanvas
        surfaceRef={surfaceRef}
        gridRef={gridRef}
        layerRef={layerRef}
        surfaceProps={gestures.surfaceProps}
        people={people}
        graph={graph}
        rects={rects}
        positions={positions}
        countsByPerson={countsByPerson}
        selectedPersonId={selectedPersonId}
        hoveredPersonId={hoveredPersonId}
        spotlightPersonId={spotlightPersonId}
        draft={draft}
        showMinimap={minimapOpen && preferences.showMinimap}
        surfaceSize={surfaceSize}
        impliedRelationshipIds={impliedRelationshipIds}
        finderPath={finderPath}
        finderPicking={finder.open}
        isEmptyProject={isEmptyProject}
        showStructure={structureVisible}
        coachMark={
          coachMarkVisible
            ? {
                title: "This person is on the canvas",
                body: "Hover the card for parent, spouse, child and sibling controls, or click it to open their profile. Drag anywhere to move them.",
              }
            : null
        }
        onDismissCoachMark={dismissCoachMark}
        onIntent={handleIntent}
        onSelectPerson={(personId) => {
          const state = useWorkspaceStore.getState();
          if (state.finder.open) state.pickFinderPerson(personId);
          // Completing a draft is the click's job, not selection's: the click
          // must not pull the eye away from the bond being recorded.
          else if (state.relationshipDraft) return;
          else state.select(personId);
        }}
        onOpenDetails={handleOpenDetails}
        onRemoveRelationship={(relationshipId) => {
          const relationship = graph.relationships.find((item) => item.id === relationshipId);
          if (relationship) setPendingRelationshipDelete(relationship);
        }}
        onMovePerson={persistPosition}
        onHoverPerson={(personId) => useWorkspaceStore.getState().hover(personId)}
        onCreateFirstPerson={() => setPersonDialog({ kind: "create", point: null })}
        onCancelDraft={() => useWorkspaceStore.getState().cancelRelationship()}
        onMinimapJump={(point) => camera.centerOn(point, { animate: false })}
        onZoomIn={() => camera.zoomIn()}
        onZoomOut={() => camera.zoomOut()}
        onFit={() => camera.fitToContent({ animate: true })}
        onTidyUp={() => void tidyUp()}
        onToggleMinimap={() => useWorkspaceStore.getState().toggleMinimap()}
      />

      {finder.open && (
        <RelationshipFinderBar
          className="fixed left-4 top-[4.5rem] z-30"
          state={finder}
          graph={graph}
          system={project.kinshipSystem}
          showCulturalTerms={preferences.showCulturalTerms}
          result={finderResult}
          alternatives={finderAlternatives}
          systemLanguageLabel={languageName(languageForKinshipSystem(project.kinshipSystem))}
          onCompute={() => useWorkspaceStore.getState().computeFinder()}
          onSwap={() => useWorkspaceStore.getState().swapFinderPersons()}
          onClear={() => useWorkspaceStore.getState().clearFinderResult()}
          onClose={() => useWorkspaceStore.getState().closeFinder()}
          onOpenPerson={(personId) =>
            useWorkspaceStore.getState().select(personId, { openDetails: true })
          }
          onFocusPath={frameFinderPath}
          onOpenListPicker={() => useWorkspaceStore.getState().setFinderOpen(true)}
          onOpenGuide={() => useWorkspaceStore.getState().setGuideOpen(true)}
        />
      )}

      <PersonDetailsPanel
        open={detailsOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setDetailsOpen(open)}
        person={selectedPerson}
        biodata={selectedPerson ? biodataByPerson.get(selectedPerson.id) : undefined}
        graph={graph}
        system={project.kinshipSystem}
        showCulturalTerms={preferences.showCulturalTerms}
        onEdit={() => selectedPerson && setPersonDialog({ kind: "edit", person: selectedPerson })}
        onCenter={() =>
          selectedPerson && camera.centerOnPerson(selectedPerson.id, { animate: true })
        }
        onSpotlight={() =>
          selectedPerson && useWorkspaceStore.getState().toggleSpotlight(selectedPerson.id)
        }
        onDelete={() => selectedPerson && setPendingDelete(selectedPerson)}
        onAddRelationship={() =>
          selectedPerson && setRelativeDialog({ anchor: selectedPerson, intent: "child" })
        }
        onOpenPerson={(personId) =>
          useWorkspaceStore.getState().select(personId, { openDetails: true })
        }
        onRemoveRelationship={setPendingRelationshipDelete}
        onExportPerson={() => selectedPerson && void exportPerson(selectedPerson)}
      />

      <PersonFormDialog
        open={personDialog !== null}
        onOpenChange={(open) => !open && setPersonDialog(null)}
        mode={personDialog?.kind === "edit" ? "edit" : "create"}
        person={personDialog?.kind === "edit" ? personDialog.person : null}
        title={isDefaultView(personDialog, people.length) ? "Add the first person" : undefined}
        onSubmit={async (values) => {
          if (personDialog?.kind === "edit") {
            await peopleRepo.update(personDialog.person.id, {
              name: values.name,
              displayName: values.displayName,
              gender: values.gender,
              dateOfBirth: values.dateOfBirth,
              dateOfDeath: values.dateOfDeath,
              profilePhoto: values.profilePhoto,
              notes: values.notes,
            });
            return;
          }
          await createStandalonePerson(
            values,
            personDialog?.kind === "create" ? personDialog.point : null,
          );
        }}
      />

      <AddRelativeDialog
        open={relativeDialog !== null}
        onOpenChange={(open) => !open && setRelativeDialog(null)}
        people={people}
        anchor={relativeDialog?.anchor ?? null}
        initialIntent={relativeDialog?.intent ?? "child"}
        onLinkExisting={async (input) => {
          if (!relativeDialog) return;
          await linkRelative(relativeDialog.anchor, input.intent, {
            personId: input.personId,
            label: input.label,
            status: input.status,
          });
        }}
        onCreateNew={async (input) => {
          if (!relativeDialog) return;
          await createRelative(relativeDialog.anchor, input.intent, {
            name: input.name,
            gender: input.gender,
            label: input.label,
            status: input.status,
          });
        }}
      />


      <RelationshipFinder
        open={finderOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setFinderOpen(open)}
        people={people}
        graph={graph}
        system={project.kinshipSystem}
        showCulturalTerms={preferences.showCulturalTerms}
        initialPersonId={selectedPersonId}
        onOpenPerson={(personId) => {
          useWorkspaceStore.getState().setFinderOpen(false);
          useWorkspaceStore.getState().select(personId, { openDetails: true });
          camera.centerOnPerson(personId, { animate: true });
        }}
        onOpenGuide={() => {
          useWorkspaceStore.getState().setFinderOpen(false);
          useWorkspaceStore.getState().setGuideOpen(true);
        }}
      />

      <RelationshipGuide
        open={guideOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setGuideOpen(open)}
        system={project.kinshipSystem}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setShortcutsOpen(open)}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => useWorkspaceStore.getState().setSettingsOpen(open)}
        onDataChanged={() => {
          useWorkspaceStore.getState().reset();
          router.push("/");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : "Delete person?"}
        description="Their biodata, canvas position and every relationship they were part of will be removed from this device. Descendants and other relatives stay on the canvas."
        confirmLabel="Delete person"
        onConfirm={async () => {
          if (pendingDelete) await deletePerson(pendingDelete);
        }}
      />

      <ConfirmDialog
        open={pendingRelationshipDelete !== null}
        onOpenChange={(open) => !open && setPendingRelationshipDelete(null)}
        // Naming the two people matters when the clicked line stands for a
        // couple (one trunk, two records): the dialog has to say which record
        // is about to go.
        title={pendingRelationshipDelete ? relationshipTitle(pendingRelationshipDelete, graph) : "Remove this relationship?"}
        description="Only the relationship record is deleted - both people stay in the lineage, and any other record between them is untouched."
        confirmLabel="Remove relationship"
        onConfirm={async () => {
          if (pendingRelationshipDelete) await removeRelationship(pendingRelationshipDelete);
        }}
      />
    </div>
  );
}

/**
 * A person's name for a dialog, falling back to something human when the row is
 * for someone who has since been removed.
 */
function nameIn(graph: FamilyGraph, personId: Id): string {
  const person = graph.peopleById.get(personId);
  return person ? person.displayName?.trim() || person.name : "this person";
}

/** "Remove Krishna as a parent of Aarav?" - precise, in the user's words. */
function relationshipTitle(relationship: Relationship, graph: FamilyGraph): string {
  const from = nameIn(graph, relationship.fromPersonId);
  const to = nameIn(graph, relationship.toPersonId);
  switch (relationship.type) {
    case "parent":
      return `Remove ${from} as a parent of ${to}?`;
    case "spouse":
      return `Remove the marriage between ${from} and ${to}?`;
    case "sibling":
      return `Remove the sibling link between ${from} and ${to}?`;
    default:
      return `Remove the ${relationship.label || "named"} link between ${from} and ${to}?`;
  }
}

/** "Add the first person" only makes sense while the lineage is still empty. */
function isDefaultView(state: PersonDialogState, peopleCount: number): boolean {
  return state?.kind === "create" && peopleCount === 0;
}

/** Maps a human "add parent/child/..." intent onto the stored bond type. */
function draftTypeFor(intent: RelativeIntent): Relationship["type"] {
  if (intent === "parent" || intent === "child") return "parent";
  if (intent === "spouse") return "spouse";
  if (intent === "sibling") return "sibling";
  return "other";
}
