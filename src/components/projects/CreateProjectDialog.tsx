"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KinshipSystemId, Project } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultKinshipSystem: KinshipSystemId;
  onCreate(input: {
    name: string;
    description?: string;
    kinshipSystem: KinshipSystemId;
  }): Promise<Project | void>;
}

const SYSTEMS: { value: KinshipSystemId; label: string; example: string; exampleClass: string }[] = [
  {
    value: "kannada",
    label: "Kannada / Karnataka",
    example: "ಚಿಕ್ಕಪ್ಪ · ಅತ್ತೆ · ತಮ್ಮ",
    exampleClass: "font-kannada",
  },
  { value: "hindi", label: "Hindi / North Indian", example: "चाचा · मामा · दादी", exampleClass: "font-devanagari" },
  { value: "english", label: "English", example: "uncle · grandparent", exampleClass: "font-sans" },
];

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultKinshipSystem,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [system, setSystem] = useState<KinshipSystemId>(defaultKinshipSystem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setSystem(defaultKinshipSystem);
    setBusy(false);
    setError(null);
  }, [defaultKinshipSystem, open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give this lineage a name - it can be changed later.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), description, kinshipSystem: system });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That lineage could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a new lineage</DialogTitle>
          <DialogDescription>
            One project is one family tree, kept entirely on this device. Nothing is uploaded, and
            nothing needs an internet connection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="project-name">Lineage name</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder="e.g. Sharma family, Kanchipuram"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Which branch of the family this covers, where they are from…"
              className="min-h-[70px]"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Kinship vocabulary</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {SYSTEMS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSystem(option.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors",
                    system === option.value
                      ? "border-primary/45 bg-primary/8"
                      : "border-border text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  <span className="block text-[12.5px] font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className={cn("mt-0.5 block text-[12px]", option.exampleClass)}>
                    {option.example}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Used for relationship labels in this lineage. You can change it later.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Create lineage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
