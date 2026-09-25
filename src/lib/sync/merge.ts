/**
 * The conflict strategy, in one file, with no I/O.
 *
 * Three-way merge: for every synchronized field we compare the local value, the
 * cloud value and the last value the two agreed on (the base). A field changed
 * on one side only is taken from that side, silently - which is the common case
 * and means most "conflicts" never become conflicts at all.
 *
 * When BOTH sides changed the same field, the rule is deterministic and order
 * independent:
 *
 *   1. the record with the later `updatedAt` wins;
 *   2. ties are broken by comparing device ids lexicographically (greater wins);
 *   3. if even that ties, the cloud value wins.
 *
 * The losing value is never thrown away - it is returned in `conflicts` and
 * parked in the local `conflicts` table, where the user can read it and put it
 * back. And a delete never destroys a concurrent edit: edited content outlives
 * a tombstone, in both directions.
 *
 * List-like fields (canvas positions, pinned people, biodata custom fields) are
 * merged by union instead, so two devices editing different things both keep
 * their work.
 */
import type { SyncCollection, SyncPayload } from "@/lib/sync/types";
import { fieldStrategy, SYNC_PAYLOAD_FIELDS } from "@/lib/sync/types";
import { valuesEqual } from "@/lib/sync/payload";

export interface MergeStamp {
  updatedAt: string;
  origin: string;
}

export interface FieldConflict {
  /** Field name, or `field.key` for a per-entry union conflict. */
  field: string;
  appliedValue: unknown;
  appliedFrom: "local" | "cloud";
  preservedValue: unknown;
}

export interface MergeInput {
  collection: SyncCollection;
  /** Last content both sides agreed on, or null when this is the first sync. */
  base: SyncPayload | null;
  /** This device's current content. */
  ours: SyncPayload;
  /** The cloud's current content. */
  theirs: SyncPayload;
  ourStamp: MergeStamp;
  theirStamp: MergeStamp;
  ourDeletedAt: string | null;
  theirDeletedAt: string | null;
}

export interface MergeOutcome {
  /** Which side (or both) the resulting content came from. */
  source: "local" | "cloud" | "merged";
  /** Content to write locally. */
  payload: SyncPayload;
  /** Tombstone to write locally (null = record stays alive). */
  deletedAt: string | null;
  /** Values that lost, preserved for the user. */
  conflicts: FieldConflict[];
  /** The cloud revision this merge was computed against. */
  changed: boolean;
  /** The cloud must receive the merged record back. */
  pushBack: boolean;
}

function laterWins(ourStamp: MergeStamp, theirStamp: MergeStamp): "local" | "cloud" {
  if (ourStamp.updatedAt > theirStamp.updatedAt) return "local";
  if (ourStamp.updatedAt < theirStamp.updatedAt) return "cloud";
  if (ourStamp.origin > theirStamp.origin) return "local";
  if (ourStamp.origin < theirStamp.origin) return "cloud";
  return "cloud";
}

function keyOfEntry(entry: unknown): string {
  const record = (entry ?? {}) as Record<string, unknown>;
  return String(record.id ?? record.label ?? JSON.stringify(entry));
}

function listToMap(value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(value)) return map;
  for (const entry of value) {
    if (entry && typeof entry === "object") map.set(keyOfEntry(entry), entry);
  }
  return map;
}

function mapToMap(value: unknown): Map<string, unknown> {
  return new Map(Object.entries((value ?? {}) as Record<string, unknown>));
}

/**
 * Three-way merge, one entry at a time.
 *
 * This is what makes two devices moving different people - or each adding their
 * own biodata field - non-destructive: an entry only falls back to the timestamp
 * rule when BOTH sides actually changed that same entry. A deletion of an entry
 * is honoured when the other side left it alone.
 */
function unionEntries(
  ours: Map<string, unknown>,
  theirs: Map<string, unknown>,
  base: Map<string, unknown> | null,
  field: string,
  ourStamp: MergeStamp,
  theirStamp: MergeStamp,
  conflicts: FieldConflict[],
): Map<string, unknown> {
  const result = new Map<string, unknown>();
  const keys = new Set([...ours.keys(), ...theirs.keys(), ...(base?.keys() ?? [])]);

  for (const key of keys) {
    const ourValue = ours.get(key);
    const theirValue = theirs.get(key);

    if (valuesEqual(ourValue, theirValue)) {
      if (ourValue !== undefined) result.set(key, ourValue);
      continue;
    }

    if (base) {
      const baseValue = base.get(key);
      if (valuesEqual(ourValue, baseValue)) {
        // Only the cloud moved this entry (an addition, an edit, or a removal).
        if (theirValue !== undefined) result.set(key, theirValue);
        continue;
      }
      if (valuesEqual(theirValue, baseValue)) {
        // Only this device moved it - including removing it.
        if (ourValue !== undefined) result.set(key, ourValue);
        continue;
      }
    }

    const winner = laterWins(ourStamp, theirStamp);
    const applied = winner === "local" ? ourValue : theirValue;
    if (applied !== undefined) result.set(key, applied);
    conflicts.push({
      field: `${field}.${key}`,
      appliedValue: applied ?? null,
      appliedFrom: winner,
      preservedValue: (winner === "local" ? theirValue : ourValue) ?? null,
    });
  }

  return result;
}

function unionList(
  ours: unknown,
  theirs: unknown,
  base: unknown,
  hasBase: boolean,
  field: string,
  ourStamp: MergeStamp,
  theirStamp: MergeStamp,
  conflicts: FieldConflict[],
): unknown {
  const merged = unionEntries(
    listToMap(ours),
    listToMap(theirs),
    hasBase ? listToMap(base) : null,
    field,
    ourStamp,
    theirStamp,
    conflicts,
  );
  return [...merged.values()];
}

function unionMap(
  ours: unknown,
  theirs: unknown,
  base: unknown,
  hasBase: boolean,
  field: string,
  ourStamp: MergeStamp,
  theirStamp: MergeStamp,
  conflicts: FieldConflict[],
): unknown {
  const merged = unionEntries(
    mapToMap(ours),
    mapToMap(theirs),
    hasBase ? mapToMap(base) : null,
    field,
    ourStamp,
    theirStamp,
    conflicts,
  );
  return Object.fromEntries(merged);
}

/** Fields compared by union rather than by winner-takes-all. */
function mergeField(
  collection: SyncCollection,
  field: string,
  input: MergeInput,
  conflicts: FieldConflict[],
): unknown {
  const ours = input.ours[field];
  const theirs = input.theirs[field];
  const base = input.base ? input.base[field] : undefined;

  if (valuesEqual(ours, theirs)) return ours;

  if (!input.base) {
    // First contact between the two sides: no base, so the stamps decide.
    const winner = laterWins(input.ourStamp, input.theirStamp);
    if (winner === "local") {
      conflicts.push({
        field,
        appliedValue: ours,
        appliedFrom: "local",
        preservedValue: theirs,
      });
      return ours;
    }
    conflicts.push({
      field,
      appliedValue: theirs,
      appliedFrom: "cloud",
      preservedValue: ours,
    });
    return theirs;
  }

  const oursChanged = !valuesEqual(ours, base);
  const theirsChanged = !valuesEqual(theirs, base);

  if (oursChanged && !theirsChanged) return ours;
  if (!oursChanged && theirsChanged) return theirs;
  if (!oursChanged && !theirsChanged) return ours;

  switch (fieldStrategy(collection, field)) {
    case "union-list":
      return unionList(
        ours,
        theirs,
        base,
        Boolean(input.base),
        field,
        input.ourStamp,
        input.theirStamp,
        conflicts,
      );
    case "union-map":
      return unionMap(
        ours,
        theirs,
        base,
        Boolean(input.base),
        field,
        input.ourStamp,
        input.theirStamp,
        conflicts,
      );
    default: {
      const winner = laterWins(input.ourStamp, input.theirStamp);
      const applied = winner === "local" ? ours : theirs;
      conflicts.push({
        field,
        appliedValue: applied,
        appliedFrom: winner,
        preservedValue: winner === "local" ? theirs : ours,
      });
      return applied;
    }
  }
}

export function mergeRecords(input: MergeInput): MergeOutcome {
  const conflicts: FieldConflict[] = [];
  const fields = SYNC_PAYLOAD_FIELDS[input.collection].filter(
    (field) => field !== "id" && field !== "projectId" && field !== "personId",
  );

  const ourDeleted = Boolean(input.ourDeletedAt);
  const theirDeleted = Boolean(input.theirDeletedAt);

  // --- one side deleted: a delete may never destroy a concurrent edit ----
  if (theirDeleted !== ourDeleted) {
    const survivor = theirDeleted ? input.ours : input.theirs;
    const survivorChanged = input.base
      ? fields.some((field) => !valuesEqual(survivor[field], input.base?.[field]))
      : true;

    if (survivorChanged) {
      return {
        // The content stays, on both sides. The tombstone loses.
        source: theirDeleted ? "local" : "cloud",
        payload: survivor,
        deletedAt: null,
        conflicts,
        changed: !theirDeleted,
        pushBack: true,
      };
    }

    // The tombstone timestamp travels outside the payload, so it is read from
    // the delete stamps rather than from the record content.
    const tombstone = theirDeleted ? input.theirDeletedAt : input.ourDeletedAt;
    return {
      // Nothing was edited, so the deletion applies everywhere.
      source: theirDeleted ? "cloud" : "local",
      payload: survivor,
      deletedAt: tombstone,
      conflicts,
      changed: theirDeleted,
      pushBack: false,
    };
  }

  // --- both alive (or both tombstoned) ----------------------------------
  const payload: SyncPayload = {};
  let changed = false;
  let cloudWon = false;
  let localWon = false;

  for (const field of fields) {
    const value = mergeField(input.collection, field, input, conflicts);
    payload[field] = value;
    if (valuesEqual(value, input.ours[field])) continue;
    changed = true;
    if (valuesEqual(value, input.theirs[field])) cloudWon = true;
    else localWon = true;
  }

  return {
    source: !changed ? "local" : localWon ? "merged" : cloudWon ? "cloud" : "local",
    payload,
    deletedAt: input.ourDeletedAt,
    conflicts,
    changed,
    pushBack: changed,
  };
}
