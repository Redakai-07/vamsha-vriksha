"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef } from "react";

import { resolvePositions, type ResolvedPositions } from "@/lib/canvas/positions";
import { canvasRepo } from "@/lib/db/repositories/canvas";
import { biodataRepo } from "@/lib/db/repositories/biodata";
import { peopleRepo } from "@/lib/db/repositories/people";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { relationshipsRepo } from "@/lib/db/repositories/relationships";
import { buildFamilyGraph, type FamilyGraph } from "@/lib/domain/graph";
import type { Biodata, CanvasState, Id, Person, Project, Relationship } from "@/lib/domain/types";

/**
 * Dexie live queries are the bridge between IndexedDB and React: any write -
 * from this tab, another tab, or a migration - re-runs the query and the UI
 * follows. There is no client-side cache to invalidate, which is what keeps the
 * offline data flow trustworthy.
 */

export interface ProjectData {
  project: Project | null | undefined;
  people: Person[];
  relationships: Relationship[];
  biodata: Biodata[];
  canvas: CanvasState | null | undefined;
  graph: FamilyGraph;
  positions: Map<Id, Point>;
  rects: ResolvedPositions["rects"];
  biodataByPerson: Map<Id, Biodata>;
  loading: boolean;
}

type Point = { x: number; y: number };

const EMPTY_GRAPH = buildFamilyGraph([], []);

export function useProjectData(projectId: Id | null): ProjectData {
  const project = useLiveQuery(
    () => (projectId ? projectsRepo.get(projectId) : Promise.resolve(null)),
    [projectId],
  );

  const people = useLiveQuery(
    () => (projectId ? peopleRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId],
    undefined,
  );

  const relationships = useLiveQuery(
    () => (projectId ? relationshipsRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId],
    undefined,
  );

  const biodata = useLiveQuery(
    () => (projectId ? biodataRepo.listByProject(projectId) : Promise.resolve([])),
    [projectId],
    undefined,
  );

  const canvas = useLiveQuery(
    () => (projectId ? canvasRepo.get(projectId) : Promise.resolve(null)),
    [projectId],
  );

  const peopleList = useMemo(() => people ?? [], [people]);
  const relationshipList = useMemo(() => relationships ?? [], [relationships]);
  const biodataList = useMemo(() => biodata ?? [], [biodata]);

  const graph = useMemo(
    () => (peopleList.length ? buildFamilyGraph(peopleList, relationshipList) : EMPTY_GRAPH),
    [peopleList, relationshipList],
  );

  const storedPositions = canvas?.nodePositions ?? {};
  const resolved = useMemo(
    () => resolvePositions(peopleList, storedPositions, graph),
    [peopleList, storedPositions, graph],
  );

  const biodataByPerson = useMemo(() => {
    const map = new Map<Id, Biodata>();
    for (const row of biodataList) map.set(row.personId, row);
    return map;
  }, [biodataList]);

  // Self-healing: if any node had to be positioned by the layout fallback,
  // write those positions back so the next load is fully deterministic. Only
  // people who still have no stored position are filled in - a person created a
  // moment ago is already placed by the caller, and that placement wins.
  const healedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!projectId || !resolved.derived.length) return;
    const pending = resolved.derived.filter((id) => !healedRef.current.has(id));
    if (!pending.length) return;
    pending.forEach((id) => healedRef.current.add(id));
    const payload: Record<string, Point> = {};
    for (const id of pending) {
      const point = resolved.positions.get(id);
      if (point) payload[id] = point;
    }
    if (!Object.keys(payload).length) return;
    void canvasRepo.fillMissingPositions(projectId, payload);
  }, [projectId, resolved]);

  return {
    project,
    people: peopleList,
    relationships: relationshipList,
    biodata: biodataList,
    canvas,
    graph,
    positions: resolved.positions,
    rects: resolved.rects,
    biodataByPerson,
    loading: people === undefined || relationships === undefined || canvas === undefined,
  };
}

export function useProjectList() {
  const projects = useLiveQuery(() => projectsRepo.list(), []);
  return projects;
}

/** People in a project, keyed by id - handy for panels and pickers. */
export function usePeopleMap(people: Person[]): Map<Id, Person> {
  return useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
}
