"use client";

import { CloudUpload, HardDrive, LogIn, LogOut, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { googleSignInAvailable } from "@/lib/auth/google";
import { CLOUD_UNCONFIGURED_REASON } from "@/lib/sync/config";
import { useProjectList } from "@/hooks/useProjectData";
import { findUnbackedProjects, syncStatus, useSyncStore } from "@/stores/syncStore";

/**
 * Where optional backup lives.
 *
 * Everything here is opt-in and reversible, and the two entry points are stated
 * side by side: "Continue without account" is a first-class answer, not a
 * dismissive link. Signing out keeps every byte of local data - the dialog says
 * so, because it is true.
 */
export function AccountDialog() {
  const open = useSyncStore((state) => state.accountDialogOpen);
  const setOpen = useSyncStore((state) => state.setAccountDialogOpen);
  const account = useSyncStore((state) => state.account);
  const online = useSyncStore((state) => state.online);
  const syncing = useSyncStore((state) => state.syncing);
  const pending = useSyncStore((state) => state.pending);
  const needsReconnect = useSyncStore((state) => state.needsReconnect);
  const conflicts = useSyncStore((state) => state.conflicts);
  const excluded = useSyncStore((state) => state.excluded);
  const signInGoogle = useSyncStore((state) => state.signInWithGoogle);
  const signInPractice = useSyncStore((state) => state.signInWithPracticeAccount);
  const signOutAccount = useSyncStore((state) => state.signOutAccount);
  const syncNow = useSyncStore((state) => state.syncNow);
  const backUpProjects = useSyncStore((state) => state.backUpProjects);
  const keepProjectsLocal = useSyncStore((state) => state.keepProjectsLocal);
  const resolveConflict = useSyncStore((state) => state.resolveConflict);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);

  const projects = useProjectList();
  const [busy, setBusy] = useState<"google" | "practice" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [unbacked, setUnbacked] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !account) return;
    void findUnbackedProjects().then(setUnbacked);
  }, [open, account, pending, excluded]);

  const status = syncStatus({ account, online, syncing, pending, needsReconnect, lastSyncedAt });
  const nameOf = (id: string) => projects?.find((project) => project.id === id)?.name ?? "Untitled lineage";
  const held = unbacked.filter((id) => excluded.includes(id));
  const unheld = unbacked.filter((id) => !excluded.includes(id));

  const startGoogle = async () => {
    setBusy("google");
    setError(null);
    const result = await signInGoogle();
    setBusy(null);
    if (!result.ok) setError(result.reason ?? "Sign-in did not complete");
  };

  const startPractice = async () => {
    setBusy("practice");
    setError(null);
    await signInPractice();
    setBusy(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{account ? "Backup & sync" : "Optional backup"}</DialogTitle>
            <DialogDescription>
              {account
                ? status.detail
                : "Vamsha-Vriksha is complete without an account - every feature works offline and your family data never has to leave this device. Signing in only adds a backup you can open elsewhere."}
            </DialogDescription>
          </DialogHeader>

          {!account ? (
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                <HardDrive /> Continue without account
              </Button>

              <Button onClick={() => void startGoogle()} disabled={busy !== null}>
                <LogIn />
                {busy === "google" ? "Waiting for Google…" : "Sign in with Google"}
              </Button>

              {!googleSignInAvailable() && (
                <>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {CLOUD_UNCONFIGURED_REASON}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => void startPractice()} disabled={busy !== null}>
                    Use a practice account in this browser
                  </Button>
                </>
              )}

              {error && <p className="text-[12px] text-destructive">{error}</p>}

              <ul className="grid gap-1.5 pt-1 text-[12px] leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  Your password is never seen, stored or transmitted by this app - sign-in happens entirely inside
                  Google&apos;s own window.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  IndexedDB stays your working database. The cloud is a copy, never the only source of truth.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  Nothing is uploaded until you say so, and you can sign out at any time without losing anything.
                </li>
              </ul>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
                <span className="grid size-9 place-items-center rounded-full border border-border text-[13px] font-medium">
                  {account.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{account.displayName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {account.email ?? "Backing up to this browser"}
                  </p>
                </div>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {account.provider === "google" ? "Google" : "This device"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[12.5px] text-muted-foreground">
                  {pending > 0
                    ? `${pending} change${pending === 1 ? "" : "s"} waiting`
                    : status.phase === "synced"
                      ? "Everything is backed up"
                      : status.label}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={syncing || (!online && pending === 0)}
                  onClick={() => void syncNow("manual")}
                >
                  <RefreshCw className={syncing ? "animate-spin" : undefined} />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
              </div>

              {error && <p className="text-[12px] text-destructive">{error}</p>}

              {(held.length > 0 || unheld.length > 0) && (
                <>
                  <Separator />
                  <div className="grid gap-2">
                    <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                      {held.length > 0 ? "Not backed up" : "Newly created here"}
                    </p>
                    {[...held, ...unheld].map((projectId) => (
                      <div key={projectId} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px]">{nameOf(projectId)}</span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void backUpProjects([projectId])}
                        >
                          <CloudUpload /> Back up
                        </Button>
                        {held.includes(projectId) && (
                          <span className="text-[11.5px] text-muted-foreground">kept local</span>
                        )}
                      </div>
                    ))}
                    {held.length > 1 && (
                      <Button size="sm" onClick={() => void backUpProjects(held)}>
                        <CloudUpload /> Back up all {held.length}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {conflicts.length > 0 && (
                <>
                  <Separator />
                  <div className="grid gap-2">
                    <p className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-muted-foreground">
                      <TriangleAlert className="size-3.5 text-destructive" /> Both devices changed these
                    </p>
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Nothing was deleted. The newer edit is shown on the canvas; the other version is kept here
                      until you decide.
                    </p>
                    {conflicts.map((conflict) => (
                      <div
                        key={conflict.id}
                        className="grid gap-1.5 rounded-lg border border-border bg-card/40 p-2.5"
                      >
                        <p className="text-[12.5px] font-medium">{fieldLabel(conflict.field)}</p>
                        <p className="text-[12px] text-muted-foreground">
                          Kept: {describeValue(conflict.appliedValue)} · Preserved:{" "}
                          {describeValue(conflict.preservedValue)}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => void resolveConflict(conflict.id, "keep-preserved")}
                          >
                            Use the preserved version
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => void resolveConflict(conflict.id, "dismiss")}
                          >
                            Keep as is
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separator />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Signing out keeps every project on this device.
                </p>
                <Button size="sm" variant="ghost" onClick={() => setConfirmSignOut(true)}>
                  <LogOut /> Sign out
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Stop backing up on this device?"
        description="Your projects, people and relationships all stay exactly where they are - this only stops future backups, and anything not yet uploaded stays queued for when you sign back in."
        confirmLabel="Sign out"
        onConfirm={() => void signOutAccount()}
      />
    </>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  displayName: "Also known as",
  gender: "Gender",
  dateOfBirth: "Date of birth",
  dateOfDeath: "Date of death",
  profilePhoto: "Photo",
  notes: "Notes",
  description: "Description",
  kinshipSystem: "Kinship vocabulary",
  rootPersonId: "Focus person",
  status: "Bond status",
  label: "Bond label",
  startDate: "Bond start",
  endDate: "Bond end",
  biography: "Biography",
  occupation: "Occupation",
  education: "Education",
  placeOfBirth: "Place of birth",
  placeOfDeath: "Place of death",
  customFields: "Extra biodata fields",
  nodePositions: "Canvas position",
  pinnedPersonIds: "Pinned people",
  "*delete": "Deleted on another device",
  "*restore": "Deletion cancelled",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? FIELD_LABELS[field.split(".")[0]] ?? field;
}

/** Describes a value without ever dumping raw JSON at the reader. */
function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "string") return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} entr${value.length === 1 ? "y" : "ies"}`;
  if (typeof value === "object") return "a different value";
  return String(value);
}
