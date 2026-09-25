/**
 * Vamsha-Vriksha - synchronization vocabulary.
 *
 * The cloud is a *replica*, never the source of truth. IndexedDB stays the
 * working database on every code path, and everything in this folder is written
 * so that the app behaves identically when the network is missing, broken, or
 * has never existed at all.
 */
import type {
  Biodata,
  CanvasState,
  IsoDateTime,
  Person,
  Project,
  Relationship,
} from "@/lib/domain/types";

/** The synchronized collections, named after their Dexie tables. */
export type SyncCollection =
  | "projects"
  | "people"
  | "relationships"
  | "biodata"
  | "canvasStates";

export const SYNC_COLLECTIONS: readonly SyncCollection[] = [
  "projects",
  "people",
  "relationships",
  "biodata",
  "canvasStates",
];

export interface SyncEntityMap {
  projects: Project;
  people: Person;
  relationships: Relationship;
  biodata: Biodata;
  canvasStates: CanvasState;
}

export type SyncableEntity = SyncEntityMap[SyncCollection];

/** The wire shape of one entity: synchronized fields only, plain JSON. */
export type SyncPayload = Record<string, unknown>;

/**
 * Exactly which fields travel. Everything not listed is device-local by
 * design - most importantly `CanvasState.viewport` and every `sync` block.
 */
export const SYNC_PAYLOAD_FIELDS: Record<SyncCollection, readonly string[]> = {
  projects: ["id", "name", "description", "kinshipSystem", "rootPersonId", "createdAt", "updatedAt"],
  people: [
    "id",
    "projectId",
    "name",
    "displayName",
    "gender",
    "dateOfBirth",
    "dateOfDeath",
    "profilePhoto",
    "notes",
    "createdAt",
    "updatedAt",
  ],
  relationships: [
    "id",
    "projectId",
    "type",
    "fromPersonId",
    "toPersonId",
    "status",
    "label",
    "startDate",
    "endDate",
    "notes",
    "createdAt",
    "updatedAt",
  ],
  biodata: [
    "id",
    "personId",
    "projectId",
    "placeOfBirth",
    "placeOfDeath",
    "occupation",
    "education",
    "biography",
    "notes",
    "customFields",
    "createdAt",
    "updatedAt",
  ],
  canvasStates: ["id", "projectId", "nodePositions", "pinnedPersonIds", "updatedAt"],
};

/**
 * How a field is merged when both devices changed it.
 *
 *  - `scalar`     : one of the two values is kept (see the merge rules).
 *  - `union-map`  : both sides' keys are kept; a key changed on both sides
 *                   falls back to the scalar rule per key.
 *  - `union-list` : both sides' entries are kept, de-duplicated by `id`.
 *
 * Collections are the non-destructive part of the design: two devices moving
 * different people around the canvas, or each adding a biodata field, produce a
 * merged result rather than a winner and a loser.
 */
export type FieldMergeStrategy = "scalar" | "union-map" | "union-list";

export const FIELD_MERGE_STRATEGY: Record<SyncCollection, Record<string, FieldMergeStrategy>> = {
  projects: {},
  people: {},
  relationships: {},
  biodata: { customFields: "union-list" },
  canvasStates: { nodePositions: "union-map", pinnedPersonIds: "union-list" },
};

export function fieldStrategy(collection: SyncCollection, field: string): FieldMergeStrategy {
  return FIELD_MERGE_STRATEGY[collection][field] ?? "scalar";
}

/** A record as the provider holds it. `cloudRev` is the provider's counter. */
export interface RemoteRecord {
  collection: SyncCollection;
  id: string;
  projectId: string | null;
  payload: Record<string, unknown>;
  /** Monotonic per record; the compare-and-set token. */
  cloudRev: number;
  updatedAt: IsoDateTime;
  /** Device that wrote this revision. Never contains personal data. */
  origin: string;
  deletedAt: IsoDateTime | null;
}

export interface PutRecordInput {
  accountId: string;
  collection: SyncCollection;
  id: string;
  projectId: string | null;
  payload: Record<string, unknown>;
  /**
   * The provider revision this write is based on, or `null` to mean "I believe
   * this record does not exist yet". A mismatch is reported back instead of
   * being applied, which is what makes concurrent edits safe.
   */
  baseRev: number | null;
  updatedAt: IsoDateTime;
  origin: string;
  deletedAt: IsoDateTime | null;
}

export type PutResult =
  | { ok: true; record: RemoteRecord }
  | { ok: false; current: RemoteRecord | null };

export interface ListChangesInput {
  accountId: string;
  /** Exclusive lower bound on the provider's change counter. */
  since: number;
  limit?: number;
}

export interface ListChangesResult {
  records: RemoteRecord[];
  /** New watermark to pass as `since` next time. */
  cursor: number;
  hasMore: boolean;
}

/**
 * The seam between the app and *any* cloud.
 *
 * Two implementations ship: a device-local mirror (used for tests and for the
 * offline practice account) and an HTTP adapter that speaks the documented REST
 * contract. Nothing above this interface knows which one is in use, so the
 * synchronization engine is fully exercisable - and fully testable - before a
 * provider is chosen.
 */
export interface SyncBackend {
  readonly kind: "local" | "remote";
  /** Short human label, e.g. "Cloud" or "This browser". */
  readonly label: string;
  listChanges(input: ListChangesInput): Promise<ListChangesResult>;
  getRecord(accountId: string, collection: SyncCollection, id: string): Promise<RemoteRecord | null>;
  putRecord(input: PutRecordInput): Promise<PutResult>;
  /** Used by the first-sign-in flow to inspect what an account already holds. */
  listProject(accountId: string, projectId: string): Promise<RemoteRecord[]>;
  listAll(accountId: string): Promise<RemoteRecord[]>;
}

export function isRemoteRecord(value: unknown): value is RemoteRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RemoteRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.cloudRev === "number" &&
    typeof candidate.collection === "string" &&
    (SYNC_COLLECTIONS as readonly string[]).includes(candidate.collection) &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}
