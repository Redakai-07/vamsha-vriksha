"use client";

import {
  Database,
  Download,
  HardDriveDownload,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { backupFileName, exportAll, importBackup, resetEverything } from "@/lib/db/backup";
import { getDb } from "@/lib/db/db";
import { metaRepo } from "@/lib/db/repositories/preferences";
import type { KinshipSystemId, UserPreferences } from "@/lib/domain/types";
import { downloadTextFile, pickTextFile, } from "@/lib/utils/download";
import { cn } from "@/lib/utils/cn";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { toast } from "sonner";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called after data is imported or wiped so open views can re-read. */
  onDataChanged(): void;
}

const THEME_OPTIONS: { value: UserPreferences["theme"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const KINSHIP_OPTIONS: { value: KinshipSystemId; label: string; example: string; exampleClass: string }[] = [
  {
    value: "kannada",
    label: "Kannada / Karnataka",
    example: "ಚಿಕ್ಕಪ್ಪ · ಅತ್ತೆ · ತಮ್ಮ",
    exampleClass: "font-kannada",
  },
  { value: "hindi", label: "Hindi / North Indian", example: "चाचा · मामा · दादी", exampleClass: "font-devanagari" },
  { value: "english", label: "English", example: "uncle · grandparent", exampleClass: "font-sans" },
];

export function SettingsDialog({ open, onOpenChange, onDataChanged }: SettingsDialogProps) {
  const preferences = usePreferencesStore((state) => state.preferences);
  const update = usePreferencesStore((state) => state.update);
  const [usage, setUsage] = useState<string | null>(null);
  const [installId, setInstallId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ projects: 0, people: 0, relationships: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const db = getDb();
      const [projects, people, relationships] = await Promise.all([
        db.projects.count(),
        db.people.count(),
        db.relationships.count(),
      ]);
      setCounts({ projects, people, relationships });
      setInstallId(await metaRepo.ensureInstallId());
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage != null) {
          setUsage(`${(estimate.usage / 1024 / 1024).toFixed(2)} MB used locally`);
        }
      }
    })();
  }, [open]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const backup = await exportAll();
      downloadTextFile(backupFileName(), JSON.stringify(backup, null, 2));
      toast.success("Backup downloaded", {
        description: "It contains every lineage, person and relationship. Keep it safe.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (mode: "copy" | "replace") => {
    const file = await pickTextFile();
    if (!file) return;
    setBusy(true);
    try {
      const result = await importBackup(file.text, mode);
      if (result.ok) {
        toast.success(result.message);
        onDataChanged();
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preferences &amp; local data</DialogTitle>
            <DialogDescription>
              Everything Vamsha-Vriksha stores lives in this browser. Internet and sign-in are
              optional enhancements, never requirements.
            </DialogDescription>
          </DialogHeader>

          <section className="grid gap-3">
            <SectionTitle>Appearance</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = preferences.theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => void update({ theme: option.value })}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] transition-colors",
                      active
                        ? "border-primary/45 bg-primary/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <ToggleRow
              label="Reduce motion"
              description="Skip camera animations and panel transitions."
              checked={preferences.reduceMotion}
              onChange={(checked) => void update({ reduceMotion: checked })}
            />
          </section>

          <Separator />

          <section className="grid gap-3">
            <SectionTitle>Canvas</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(["dots", "plain"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void update({ canvasBackdrop: option })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-[12.5px] capitalize transition-colors",
                    preferences.canvasBackdrop === option
                      ? "border-primary/45 bg-primary/8"
                      : "border-border text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {option === "dots" ? "Dotted grid (default)" : "Plain paper"}
                </button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="grid-contrast">Grid presence</Label>
              <input
                id="grid-contrast"
                type="range"
                min={0.4}
                max={1.4}
                step={0.05}
                value={preferences.canvasContrast}
                onChange={(event) => void update({ canvasContrast: Number(event.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--accent)]"
              />
              <p className="text-[11px] text-muted-foreground">
                The grid fades out as you zoom away and firms up when you zoom in.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(["zoom", "pan"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void update({ wheelBehavior: option })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition-colors",
                    preferences.wheelBehavior === option
                      ? "border-primary/45 bg-primary/8"
                      : "border-border text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  <span className="block font-medium text-foreground">
                    Wheel {option === "zoom" ? "zooms" : "pans"}
                  </span>
                  <span className="block text-[11px]">
                    {option === "zoom"
                      ? "Mouse-friendly. Ctrl+wheel always zooms."
                      : "Trackpad-friendly two-finger scrolling."}
                  </span>
                </button>
              ))}
            </div>

            <ToggleRow
              label="Minimap"
              description="Overview of the whole lineage in the corner of the canvas."
              checked={preferences.showMinimap}
              onChange={(checked) => void update({ showMinimap: checked })}
            />
            <ToggleRow
              label="Show kinship terms"
              description="Display cultural terms (चाचा, मामा, देवर) alongside the relationship path."
              checked={preferences.showCulturalTerms}
              onChange={(checked) => void update({ showCulturalTerms: checked })}
            />
          </section>

          <Separator />

          <section className="grid gap-3">
            <SectionTitle>Kinship vocabulary</SectionTitle>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {KINSHIP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void update({ defaultKinshipSystem: option.value })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors",
                    preferences.defaultKinshipSystem === option.value
                      ? "border-primary/45 bg-primary/8"
                      : "border-border text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  <span className="block text-[12.5px] font-medium text-foreground">
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[12px] text-muted-foreground",
                      option.exampleClass,
                    )}
                  >
                    {option.example}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Each lineage can also choose its own vocabulary; this is the default for new ones. The
              term engine is data-driven, so more systems can be added without touching the UI.
            </p>
          </section>

          <Separator />

          <section className="grid gap-3">
            <SectionTitle>Local data</SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">
                <Database className="size-3" /> IndexedDB v{getDb().verno}
              </Badge>
              <Badge variant="muted">{counts.projects} lineages</Badge>
              <Badge variant="muted">{counts.people} people</Badge>
              <Badge variant="muted">{counts.relationships} relationships</Badge>
              {usage && <Badge variant="muted">{usage}</Badge>}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => void handleExport()} disabled={busy}>
                <Download /> Export all
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleImport("copy")}
                disabled={busy}
              >
                <Upload /> Import as copy
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleImport("replace")}
                disabled={busy}
              >
                <HardDriveDownload /> Import &amp; replace
              </Button>
            </div>

            <div className="rounded-lg border border-destructive/25 bg-destructive/6 p-3">
              <p className="text-[12.5px] font-medium text-destructive">Erase this device&apos;s data</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Removes every lineage, person, relationship and biodata record from this browser.
                There is no cloud copy - export first if you need one. The app never does this on
                its own.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mt-2.5"
                onClick={() => setConfirmReset(true)}
              >
                <Trash2 /> Erase local data
              </Button>
            </div>

            {installId && (
              <p className="text-[10.5px] text-muted-foreground">
                Device install id: <span className="font-mono">{installId}</span> - generated locally,
                contains nothing about you.
              </p>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Erase everything on this device?"
        description="All lineages, people, biodata, relationships and canvas positions will be deleted from this browser. This cannot be undone."
        confirmLabel="Erase everything"
        onConfirm={async () => {
          await resetEverything();
          onDataChanged();
          toast.success("Local data erased");
        }}
      />
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[15px] font-medium tracking-tight">{children}</h3>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="text-[11.5px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
