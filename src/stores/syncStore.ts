"use client";

import { create } from "zustand";

import {
  currentAccount,
  hasLiveCredential,
  renewGoogleCredential,
  signInLocally,
  signInWithGoogle,
  signOut,
} from "@/lib/auth/google";
import type { ConflictRow } from "@/lib/db/db";
import { metaRepo } from "@/lib/db/repositories/preferences";
import { projectsRepo } from "@/lib/db/repositories/projects";
import { getSyncEngine, queueEverythingMissing } from "@/lib/sync";
import {
  excludedProjects,
  loadExcludedProjects,
  saveExcludedProjects,
} from "@/lib/sync/exclusions";
import type { SyncAccount } from "@/lib/sync/identity";
import { readSyncMeta, setSyncEnabled } from "@/lib/sync/queue";

/**
 * The synchronization surface the UI reads.
 *
 * This store owns three things: keeping the subtle status line truthful,
 * describing what the user can do about it, and holding the first-sign-in
 * question ("you have existing local projects") while it is answered. It never
 * gates an edit - no code path in the app waits on this store before writing to
 * IndexedDB.
 */

export type SyncPhase = "local" | "offline" | "syncing" | "pending" | "synced" | "attention";

export interface SyncStatus {
  phase: SyncPhase;
  /** Short text for the status chip. */
  label: string;
  /** One sentence of explanation, safe to show in a dialog. */
  detail: string;
  tone: "muted" | "accent" | "warning" | "success";
}

export interface FirstSignInPrompt {
  /** Projects found on this device that the account does not hold yet. */
  projectIds: string[];
}

interface SyncStoreState {
  hydrated: boolean;
  account: SyncAccount | null;
  online: boolean;
  syncing: boolean;
  pending: number;
  conflicts: ConflictRow[];
  lastSyncedAt: string | null;
  /** A Google account is remembered but there is no live credential yet. */
  needsReconnect: boolean;
  error: string | null;
  accountDialogOpen: boolean;
  /** Projects deliberately kept off the cloud on this device. */
  excluded: string[];
  firstSignIn: FirstSignInPrompt | null;

  hydrate(): Promise<void>;
  refresh(): Promise<void>;
  /** Asks the first-contact question when it applies, and holds work back until answered. */
  maybeAskAboutLocalProjects(): Promise<void>;
  setOnline(online: boolean): void;
  setAccountDialogOpen(open: boolean): void;
  syncNow(reason?: string): Promise<void>;
  signInWithGoogle(): Promise<{ ok: boolean; reason?: string }>;
  signInWithPracticeAccount(): Promise<{ ok: boolean; reason?: string }>;
  signOutAccount(): Promise<void>;
  resolveConflict(conflictId: string, choice: "keep-preserved" | "dismiss"): Promise<void>;
  backUpProjects(projectIds: string[]): Promise<void>;
  keepProjectsLocal(projectIds: string[]): Promise<void>;
  resolveFirstSignIn(choice: "back-up" | "keep-local" | "later"): Promise<void>;
}

function choiceKey(accountId: string): string {
  return `syncBackupChoice:${accountId}`;
}

/** Projects this device holds that the account has never seen. */
export async function findUnbackedProjects(): Promise<string[]> {
  const projects = await projectsRepo.list();
  return projects.filter((project) => !readSyncMeta(project).cloudRev).map((project) => project.id);
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  hydrated: false,
  account: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  conflicts: [],
  lastSyncedAt: null,
  needsReconnect: false,
  error: null,
  accountDialogOpen: false,
  excluded: [],
  firstSignIn: null,

  async hydrate() {
    const [account, storedExclusions] = await Promise.all([
      currentAccount(),
      loadExcludedProjects(),
    ]);
    setSyncEnabled(Boolean(account));
    set({ account, hydrated: true, excluded: storedExclusions });

    if (account?.provider === "google" && !hasLiveCredential()) {
      // Try to resume silently; if Google wants interaction, say so instead of
      // pretending to be syncing.
      const renewed = await renewGoogleCredential();
      set({ needsReconnect: !renewed });
      if (!renewed) {
        await get().refresh();
        return;
      }
    }

    if (account) {
      // Rows written before sync existed have no queue entry yet.
      await queueEverythingMissing();
    }

    await get().refresh();
    await get().maybeAskAboutLocalProjects();

    if (account && get().online) void get().syncNow("startup");
  },

  /**
   * The first-contact question. Nothing is uploaded until the user answers, so
   * "do this later" genuinely holds the work back rather than quietly backing it
   * up behind their back.
   */
  async maybeAskAboutLocalProjects() {
    const account = get().account;
    if (!account) return;
    const [unbacked, decision] = await Promise.all([
      findUnbackedProjects(),
      metaRepo.get(choiceKey(account.accountId)),
    ]);
    if (!unbacked.length || decision) return;

    // Hold them back, visibly, until answered.
    const held = [...new Set([...excludedProjects(), ...unbacked])];
    await saveExcludedProjects(held);
    set({ excluded: held, firstSignIn: { projectIds: unbacked } });
  },

  async refresh() {
    const engine = getSyncEngine();
    const stats = await engine.stats();
    set({
      pending: stats.pending,
      conflicts: await engine.listConflicts(),
      lastSyncedAt: stats.lastSyncedAt,
      account: stats.account,
      excluded: excludedProjects(),
    });
  },

  setOnline(online) {
    set({ online });
    if (online && get().account) void get().syncNow("reconnect");
  },

  setAccountDialogOpen(open) {
    set({ accountDialogOpen: open });
  },

  async syncNow(reason = "manual") {
    const { account, syncing } = get();
    if (!account || syncing) return;
    set({ syncing: true, error: null });
    try {
      const summary = await getSyncEngine().sync(reason);
      set({
        syncing: false,
        error: summary.message && !summary.offline ? summary.message : null,
        lastSyncedAt: summary.lastSyncedAt ?? get().lastSyncedAt,
      });
    } catch (error) {
      set({ syncing: false, error: error instanceof Error ? error.message : String(error) });
    }
    await get().refresh();
  },

  async signInWithGoogle() {
    const result = await signInWithGoogle();
    if (!result.ok) return { ok: false, reason: result.reason };
    setSyncEnabled(true);
    set({ account: result.account, needsReconnect: false, error: null });
    await queueEverythingMissing();
    await get().refresh();
    await get().maybeAskAboutLocalProjects();
    if (!get().firstSignIn) void get().syncNow("signin");
    return { ok: true };
  },

  async signInWithPracticeAccount() {
    const result = await signInLocally();
    if (!result.ok) return { ok: false, reason: result.reason };
    setSyncEnabled(true);
    set({ account: result.account, needsReconnect: false, error: null });
    await queueEverythingMissing();
    await get().refresh();
    await get().maybeAskAboutLocalProjects();
    if (!get().firstSignIn) void get().syncNow("signin");
    return { ok: true };
  },

  async signOutAccount() {
    // Signing out is not a data operation: everything stays on this device.
    await signOut();
    setSyncEnabled(false);
    set({
      account: null,
      needsReconnect: false,
      firstSignIn: null,
      pending: await getSyncEngine().countPending(),
    });
  },

  async resolveConflict(conflictId, choice) {
    await getSyncEngine().resolveConflict(conflictId, choice);
    await get().refresh();
    if (choice === "keep-preserved") void get().syncNow("conflict");
  },

  async backUpProjects(projectIds) {
    if (!projectIds.length) return;
    const keep = excludedProjects().filter((id) => !projectIds.includes(id));
    await saveExcludedProjects(keep);
    set({ excluded: keep });
    const engine = getSyncEngine();
    for (const projectId of projectIds) await engine.backUpProject(projectId);
    await get().refresh();
  },

  async keepProjectsLocal(projectIds) {
    const held = [...new Set([...excludedProjects(), ...projectIds])];
    await saveExcludedProjects(held);
    set({ excluded: held });
    // Anything already queued for those projects is withdrawn.
    await getSyncEngine().dropQueuedProjects(projectIds);
    await get().refresh();
  },

  async resolveFirstSignIn(choice) {
    const prompt = get().firstSignIn;
    const account = get().account;
    set({ firstSignIn: null });
    if (!prompt || !account) return;

    if (choice === "back-up") {
      await get().backUpProjects(prompt.projectIds);
      await metaRepo.set(choiceKey(account.accountId), "backed-up");
      return;
    }

    if (choice === "keep-local") {
      await get().keepProjectsLocal(prompt.projectIds);
      // Remembered, so the question is not asked again with a different answer.
      await metaRepo.set(choiceKey(account.accountId), "kept-local");
      return;
    }

    // "Do this later": the projects stay held, and no decision is recorded, so
    // the question comes back the next time the app is opened signed in.
  },
}));

/**
 * The status line. Every branch is a truthful statement about where the user's
 * work is - never a spinner that means nothing.
 */
export function syncStatus(state: {
  account: SyncAccount | null;
  online: boolean;
  syncing: boolean;
  pending: number;
  needsReconnect: boolean;
  lastSyncedAt: string | null;
}): SyncStatus {
  if (!state.account) {
    return {
      phase: "local",
      label: "Local only",
      tone: "muted",
      detail:
        "Everything stays in this browser. Signing in only adds a backup you can reach from another device.",
    };
  }

  if (state.account.provider === "google" && state.needsReconnect) {
    return {
      phase: "attention",
      label: "Sign in again to sync",
      tone: "warning",
      detail:
        "Your projects are still here. Google's sign-in window expired, so nothing has been backed up since you last signed in.",
    };
  }

  if (!state.online) {
    return state.pending > 0
      ? {
          phase: "offline",
          label: "Offline · changes saved locally",
          tone: "warning",
          detail:
            "You are offline. Edits are stored on this device and will be sent when the connection returns.",
        }
      : {
          phase: "offline",
          label: "Offline",
          tone: "warning",
          detail: "You are offline. Everything keeps working; nothing is waiting to be sent.",
        };
  }

  if (state.syncing) {
    return {
      phase: "syncing",
      label: "Syncing…",
      tone: "accent",
      detail: "Sending your latest changes.",
    };
  }

  if (state.pending > 0) {
    return {
      phase: "pending",
      label: "Changes saved locally",
      tone: "accent",
      detail: `${state.pending} change${state.pending === 1 ? "" : "s"} waiting to be backed up.`,
    };
  }

  return {
    phase: "synced",
    label: "Synced",
    tone: "success",
    detail: state.lastSyncedAt
      ? `Backed up ${describeAge(state.lastSyncedAt)}.`
      : "This account holds a current copy of your projects.",
  };
}

function describeAge(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
