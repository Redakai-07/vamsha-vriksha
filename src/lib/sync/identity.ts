/**
 * Who this device is, and who is signed in.
 *
 * Both answers live in the existing local `meta` key-value store: signing in
 * never moves data, it only changes where (in addition) changes are sent. Signing
 * out removes the account row and nothing else - the projects stay exactly where
 * they were.
 */
import { getDb } from "@/lib/db/db";
import { nowIso } from "@/lib/utils/id";

export interface SyncAccount {
  /** Stable id of the account, from the provider (never a password, never a token). */
  accountId: string;
  displayName: string;
  email?: string;
  provider: "google" | "local";
  pictureUrl?: string;
  signedInAt: string;
}

const DEVICE_KEY = "syncDeviceId";
const ACCOUNT_KEY = "syncAccount";

function cursorKeyFor(accountId: string): string {
  return `syncCursor:${accountId}`;
}

/** Stable id for this browser profile. Used as the conflict tiebreaker. */
export async function getDeviceId(): Promise<string> {
  const db = getDb();
  const existing = await db.meta.get(DEVICE_KEY);
  if (existing?.value) return existing.value;
  // The install id is already a stable per-browser random id; reuse it so a
  // device has exactly one identity in the store.
  const install = await db.meta.get("installId");
  const value = install?.value || `dev_${Math.random().toString(36).slice(2, 12)}`;
  await db.meta.put({ key: DEVICE_KEY, value, updatedAt: nowIso() });
  return value;
}

/** The account id used by the offline practice account (one per device). */
export function localAccountId(deviceId: string): string {
  return `local_${deviceId}`;
}

export async function readAccount(): Promise<SyncAccount | null> {
  const row = await getDb().meta.get(ACCOUNT_KEY);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as SyncAccount;
    if (!parsed?.accountId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAccount(account: SyncAccount | null): Promise<void> {
  const db = getDb();
  if (!account) {
    await db.meta.delete(ACCOUNT_KEY);
    return;
  }
  await db.meta.put({ key: ACCOUNT_KEY, value: JSON.stringify(account), updatedAt: nowIso() });
}

/**
 * One watermark per account, not per collection: the provider numbers changes
 * globally, so a single cursor is both cheaper and impossible to get out of
 * step with itself.
 */
export async function getCursor(accountId: string): Promise<number> {
  const row = await getDb().meta.get(cursorKeyFor(accountId));
  const value = Number(row?.value ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function setCursor(accountId: string, value: number): Promise<void> {
  await getDb().meta.put({
    key: cursorKeyFor(accountId),
    value: String(value),
    updatedAt: nowIso(),
  });
}

const LAST_SYNCED_PREFIX = "syncLastAt:";

export async function getLastSyncedAt(accountId: string): Promise<string | null> {
  const row = await getDb().meta.get(`${LAST_SYNCED_PREFIX}${accountId}`);
  return row?.value || null;
}

export async function setLastSyncedAt(accountId: string, at: string): Promise<void> {
  await getDb().meta.put({
    key: `${LAST_SYNCED_PREFIX}${accountId}`,
    value: at,
    updatedAt: at,
  });
}
