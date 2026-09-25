"use client";

import { Cloud, CloudOff, CloudUpload, HardDrive, RefreshCw, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { syncStatus, useSyncStore } from "@/stores/syncStore";

/**
 * The status line, and the only place sync ever interrupts the user.
 *
 * It is deliberately a chip and not a banner: it states where the work is in a
 * few words, and everything else lives one click away. The tone is carried by
 * the icon, not by a coloured field, so it can sit in a toolbar without shouting.
 */
export function SyncStatusChip({ className }: { className?: string }) {
  const account = useSyncStore((state) => state.account);
  const online = useSyncStore((state) => state.online);
  const syncing = useSyncStore((state) => state.syncing);
  const pending = useSyncStore((state) => state.pending);
  const needsReconnect = useSyncStore((state) => state.needsReconnect);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const setOpen = useSyncStore((state) => state.setAccountDialogOpen);

  const status = syncStatus({ account, online, syncing, pending, needsReconnect, lastSyncedAt });

  const Icon =
    status.phase === "offline"
      ? CloudOff
      : status.phase === "attention"
        ? ShieldAlert
        : status.phase === "syncing"
          ? RefreshCw
          : status.phase === "pending"
            ? CloudUpload
            : status.phase === "local"
              ? HardDrive
              : Cloud;

  const tone =
    status.tone === "warning"
      ? "text-destructive"
      : status.tone === "accent"
        ? "text-accent"
        : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={status.detail}
      aria-label={`Backup and sync: ${status.label}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2 text-[11.5px] transition-colors",
        "hover:border-accent/40 hover:bg-secondary/50",
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", tone, status.phase === "syncing" && "animate-spin")} />
      <span className="hidden text-muted-foreground sm:inline">{status.label}</span>
    </button>
  );
}
