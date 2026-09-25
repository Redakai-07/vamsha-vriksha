"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, type ReactNode } from "react";

import { AccountDialog } from "@/components/sync/AccountDialog";
import { FirstSignInDialog } from "@/components/sync/FirstSignInDialog";
import { getDb } from "@/lib/db/db";
import { useSyncStore } from "@/stores/syncStore";

/**
 * The only piece of sync that is always mounted.
 *
 * It does three quiet things: it works out who is signed in (if anyone), it
 * syncs when the network returns or the tab wakes up, and it keeps a slow
 * heartbeat while work is waiting. None of it is on the path of an edit, and
 * with nobody signed in it does nothing at all beyond reading one meta row.
 */
const WAITING_PERIOD_MS = 30_000;
const IDLE_PERIOD_MS = 180_000;

export function SyncProvider({ children }: { children?: ReactNode }) {
  const hydrate = useSyncStore((state) => state.hydrate);
  const setOnline = useSyncStore((state) => state.setOnline);
  const syncNow = useSyncStore((state) => state.syncNow);
  const account = useSyncStore((state) => state.account);
  const pending = useSyncStore((state) => state.pending);
  const setPending = useSyncStore((state) => state.setPending);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * The queue is observed, not polled.
   *
   * This is what makes the status line immediate: the moment an edit is staged
   * - offline, in the middle of a drag, while a dialog is open - the chip goes
   * from "Offline" to "Offline · changes saved locally" without waiting for the
   * next sync attempt to notice.
   */
  const livePending = useLiveQuery(() => getDb().outbox.count(), [], 0);
  useEffect(() => {
    if (typeof livePending === "number") setPending(livePending);
  }, [livePending, setPending]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    if (!account) return;
    const period = pending > 0 ? WAITING_PERIOD_MS : IDLE_PERIOD_MS;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow("interval");
    }, period);
    return () => window.clearInterval(timer);
  }, [account, pending, syncNow]);

  useEffect(() => {
    if (!account) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow("visible");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [account, syncNow]);

  return (
    <>
      {children}
      <AccountDialog />
      <FirstSignInDialog />
    </>
  );
}
