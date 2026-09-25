"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";

import { SyncProvider } from "@/components/sync/SyncProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/stores/preferencesStore";

/**
 * Client-side providers.
 *
 * Boot order matters for an offline-first app: storage is probed, preferences
 * are read from IndexedDB (which applies the saved theme), and only then is the
 * service worker registered - and only in a production build, so development
 * never serves a stale shell.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void usePreferencesStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // A failed registration must never break the app: it is an enhancement.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      {/*
        Sync wraps the app rather than living inside it: it has to be able to
        hydrate the (optional) account on any screen, and it renders nothing at
        all when nobody is signed in.
      */}
      <SyncProvider>{children}</SyncProvider>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className:
            "!rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-[0_16px_40px_-22px_rgba(20,12,40,0.45)]",
        }}
      />
    </TooltipProvider>
  );
}
