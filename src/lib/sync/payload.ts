/**
 * Turning a local row into a transferable payload and back again.
 *
 * The payload is the only thing that ever leaves the device. `sync` metadata
 * stays local (it is this device's bookkeeping) and non-listed fields - such as
 * the canvas viewport - never travel at all.
 */
import { SYNC_PAYLOAD_FIELDS, type SyncCollection, type SyncPayload } from "@/lib/sync/types";

export function toPayload(
  collection: SyncCollection,
  entity: Record<string, unknown>,
): SyncPayload {
  const payload: SyncPayload = {};
  for (const field of SYNC_PAYLOAD_FIELDS[collection]) {
    payload[field] = entity[field];
  }
  return payload;
}

/**
 * Copies a payload onto a row, leaving identity (`id`, `projectId`, `personId`)
 * and every device-local field alone.
 */
export function applyPayload<T extends Record<string, unknown>>(
  collection: SyncCollection,
  entity: T,
  payload: SyncPayload,
): T {
  const next = { ...entity } as Record<string, unknown>;
  for (const field of SYNC_PAYLOAD_FIELDS[collection]) {
    if (field === "id" || field === "projectId" || field === "personId") continue;
    if (!(field in payload)) continue;
    if (payload[field] === undefined) delete next[field];
    else next[field] = payload[field];
  }
  return next as T;
}

/** Structural equality over the synchronized fields. */
export function payloadsEqual(a: SyncPayload | null, b: SyncPayload | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return stableStringify(a) === stableStringify(b);
}

/** JSON with sorted keys, so equality does not depend on insertion order. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Structural equality used by the merge. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;
  return stableStringify(a) === stableStringify(b);
}
