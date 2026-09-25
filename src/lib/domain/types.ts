/**
 * Vamsha-Vriksha - core domain types.
 *
 * Design rules that the rest of the codebase relies on:
 *
 *  1. Relationships are FIRST-CLASS records. Canvas coordinates are never the
 *     source of truth for kinship - they are only presentation state.
 *  2. Every biographical field is optional. A person can be a name and nothing
 *     else, and the app must stay useful in that state.
 *  3. Types are storage-shaped (plain JSON, no class instances, no Date objects)
 *     so rows can be written into, and read out of, IndexedDB unchanged.
 */

export type Id = string;

/** ISO-8601 timestamp, e.g. `2026-09-23T09:12:04.512Z`. */
export type IsoDateTime = string;

/**
 * How a record stands relative to the optional cloud copy.
 *
 *  - `local`   : the user has never signed in, so nothing is queued at all.
 *  - `pending` : changed on this device and not yet acknowledged by the cloud.
 *  - `synced`  : the cloud holds this exact revision.
 *  - `conflict`: both this device and the cloud changed it; the merge kept one
 *                value and parked the other, which is still recoverable.
 */
export type SyncState = "local" | "pending" | "synced" | "conflict";

/**
 * Sync bookkeeping. Optional on purpose: rows written before sync existed, and
 * rows in exported backups, stay valid without it.
 *
 * `rev` is a plain counter bumped on every local write, `syncedRev` records the
 * `rev` the cloud last acknowledged, and `cloudRev` is the provider-side
 * revision this row descends from. Comparing `cloudRev` against the provider is
 * what turns a blind overwrite into a compare-and-set, and keeping `syncedRev`
 * next to `rev` is what makes "is this row dirty?" a local question.
 */
export interface SyncMeta {
  rev: number;
  syncedRev: number;
  cloudRev: number;
  /** Device that produced the current content; the conflict tiebreaker. */
  origin: string;
  state: SyncState;
}

/**
 * Everything that can be synchronized. `deletedAt` is a tombstone rather than a
 * row removal, so a delete can travel to other devices without racing a
 * concurrent edit into oblivion.
 */
export interface SyncableEntity {
  sync?: SyncMeta;
  deletedAt?: IsoDateTime | null;
}

/**
 * Partial / uncertain dates are first class in genealogy: "1948", "1948-03",
 * "1948-03-12" are all valid and sort correctly as strings of differing
 * precision. `null` means unknown.
 */
export type PartialDate = string | null;

export type Gender = "male" | "female" | "other" | "unknown";

export const GENDERS: readonly Gender[] = ["male", "female", "other", "unknown"];

/** Which cultural kinship vocabulary a project prefers for relationship labels. */
export type KinshipSystemId = "hindi" | "english" | "kannada";

export const KINSHIP_SYSTEMS: readonly KinshipSystemId[] = ["kannada", "hindi", "english"];

export interface Project extends SyncableEntity {
  id: Id;
  name: string;
  description?: string;
  /** Preferred cultural kinship vocabulary for this lineage. */
  kinshipSystem: KinshipSystemId;
  /** Optional person to centre on when the canvas first opens. */
  rootPersonId?: Id | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Person extends SyncableEntity {
  id: Id;
  projectId: Id;
  /** Full / formal name - the stable identifier humans see. */
  name: string;
  /** What the family actually calls them (nickname, pet name, title). */
  displayName?: string;
  gender: Gender;
  dateOfBirth?: PartialDate;
  dateOfDeath?: PartialDate;
  /**
   * Small, client-resized data URL. Kept inline so a person row is fully
   * self-contained and exportable as JSON without side files.
   */
  profilePhoto?: string | null;
  /** Short free-form tag line shown nowhere but the panel, e.g. "Lineage head". */
  notes?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** One extra, user-defined biodata field (allows growth without migrations). */
export interface BiodataField {
  id: Id;
  label: string;
  value: string;
}

/**
 * Biodata is split from Person on purpose:
 *  - Person stays small and cheap to render on the canvas,
 *  - biodata can grow (custom fields) without touching identity records,
 *  - and "no biodata exists yet" is representable (the row simply does not exist).
 */
export interface Biodata extends SyncableEntity {
  /** Same id as the person it belongs to - biodata is 1:1 with a person. */
  id: Id;
  personId: Id;
  projectId: Id;
  placeOfBirth?: string;
  placeOfDeath?: string;
  occupation?: string;
  education?: string;
  /** Long-form life story. */
  biography?: string;
  notes?: string;
  customFields: BiodataField[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Relationship kinds. Directional meaning is part of the contract:
 *
 *  - `parent`  : `fromPersonId` is the parent, `toPersonId` is the child.
 *  - `spouse`  : symmetric; `from`/`to` order carries no meaning.
 *  - `sibling` : symmetric; `from` is the elder when dates allow, otherwise the
 *                person who created the bond. Used when shared parents are
 *                unknown, so siblings can be recorded without inventing parents.
 *  - `other`   : directional, described by `label` (guru, godparent, ward, ...).
 */
export type RelationshipType = "parent" | "spouse" | "sibling" | "other";

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "parent",
  "spouse",
  "sibling",
  "other",
];

export type SpouseStatus = "married" | "partner" | "divorced" | "widowed" | "unknown";

export interface Relationship extends SyncableEntity {
  id: Id;
  projectId: Id;
  type: RelationshipType;
  fromPersonId: Id;
  toPersonId: Id;
  /** Only meaningful for `type: "spouse"`. */
  status?: SpouseStatus;
  /** Only meaningful for `type: "other"` - e.g. "Guru", "Godparent". */
  label?: string;
  /** Optional dates for the bond itself (marriage, divorce, adoption). */
  startDate?: PartialDate;
  endDate?: PartialDate;
  notes?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** A point in *world* space (canvas coordinates, independent of zoom). */
export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  /** World point currently at the top-left of the canvas surface. */
  x: number;
  y: number;
  /** 1 === 100%. Clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number;
}

/**
 * Per-project canvas presentation state. Never the source of truth for kinship.
 *
 * `viewport` is deliberately DEVICE-LOCAL and is never synchronized: where one
 * person has scrolled to is ergonomics, not genealogy, and syncing it would
 * make two devices fight over the camera.
 */
export interface CanvasState extends SyncableEntity {
  /** Same id as the project. */
  id: Id;
  projectId: Id;
  viewport: Viewport;
  /**
   * Manual node positions keyed by person id. Positions are only written by
   * explicit user actions (drag, or "tidy up" auto-arrange).
   */
  nodePositions: Record<Id, Point>;
  /** Persons the user pinned so auto-layout leaves them alone. */
  pinnedPersonIds: Id[];
  updatedAt: IsoDateTime;
}

/** Global, device-local application preferences. */
export interface UserPreferences {
  theme: "light" | "dark" | "system";
  /** Canvas backdrop: subtle dotted grid, or plain paper. */
  canvasBackdrop: "dots" | "plain";
  /**
   * Plain mouse wheel behaviour. Trackpad users usually prefer panning (the
   * default here is zoom for mouse users); ctrl/cmd + wheel always zooms and
   * shift + wheel always pans, whatever this is set to.
   */
  wheelBehavior: "zoom" | "pan";
  /** Grid/edge intensity multiplier, 0.4 - 1.4. */
  canvasContrast: number;
  showMinimap: boolean;
  /** Show cultural kinship terms (chacha, mausi, ...) next to English ones. */
  showCulturalTerms: boolean;
  /** Default vocabulary for new projects. */
  defaultKinshipSystem: KinshipSystemId;
  /** Prefer reduced motion for camera animations. */
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  canvasBackdrop: "dots",
  wheelBehavior: "zoom",
  canvasContrast: 1,
  showMinimap: true,
  showCulturalTerms: true,
  defaultKinshipSystem: "hindi",
  reduceMotion: false,
};

export type MetaKey =
  | "lastProjectId"
  | "installId"
  | "firstRunCompletedAt"
  /** Stable per-device id - never leaves the device except as a tiebreaker. */
  | "syncDeviceId"
  /** The signed-in account (JSON), or absent when the user is anonymous. */
  | "syncAccount"
  /** Remote-write watermark, one row per account per collection. */
  | `syncCursor:${string}`
  /** Set once the first-sign-in "what about my local projects?" prompt is done. */
  | `syncBackupChoice:${string}`;

export interface MetaRow {
  key: MetaKey | string;
  value: string;
  updatedAt: IsoDateTime;
}
