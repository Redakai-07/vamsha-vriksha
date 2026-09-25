/**
 * Choosing a backend, and holding the single engine instance.
 *
 * With an endpoint configured the app talks to it; without one, the offline
 * mirror keeps the whole engine honest and testable. Nothing else in the app
 * branches on which one is in use.
 */
import { createLocalMirrorBackend } from "@/lib/sync/backend.local";
import { createRemoteBackend } from "@/lib/sync/backend.remote";
import { CLOUD_CONFIGURED, SYNC_ENDPOINT } from "@/lib/sync/config";
import { createSyncEngine, type SyncEngine } from "@/lib/sync/engine";
import { getAccessToken } from "@/lib/auth/google";
import type { SyncBackend } from "@/lib/sync/types";

let instance: SyncEngine | null = null;

export function createBackend(): SyncBackend {
  if (CLOUD_CONFIGURED) {
    return createRemoteBackend({
      baseUrl: SYNC_ENDPOINT,
      getAccessToken,
    });
  }
  return createLocalMirrorBackend();
}

/** Lazy singleton, so importing the sync layer never opens a database. */
export function getSyncEngine(): SyncEngine {
  if (!instance) instance = createSyncEngine(createBackend());
  return instance;
}

/** Test hook: drop the singleton so a fake backend can be installed. */
export function setSyncEngineForTesting(engine: SyncEngine | null): void {
  instance = engine;
}

export type { SyncEngine, SyncRunSummary } from "@/lib/sync/engine";
export { queueEverythingMissing } from "@/lib/sync/engine";
export { pendingCount, setSyncEnabled } from "@/lib/sync/queue";
