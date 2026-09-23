"use client";

import { ArrowDown, ArrowUp, Heart, Loader2, MoreHorizontal, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { PersonAvatar } from "@/components/person/PersonAvatar";
import { PersonCombobox } from "@/components/person/PersonCombobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeIntent,
  INTENT_META,
  RELATIVE_INTENTS,
  type RelativeIntent,
} from "@/lib/domain/relativeIntent";
import { SPOUSE_STATUS_LABELS } from "@/lib/domain/relationship";
import type { Id, Person, SpouseStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

const INTENT_ICONS: Record<RelativeIntent, React.ComponentType<{ className?: string }>> = {
  parent: ArrowUp,
  child: ArrowDown,
  spouse: Heart,
  sibling: Users,
  other: MoreHorizontal,
};

export interface AddRelativeDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  people: Person[];
  /** The person the new relationship is anchored to. */
  anchor: Person | null;
  /** Preselected intent (from the canvas controls). */
  initialIntent?: RelativeIntent;
  onLinkExisting(input: {
    intent: RelativeIntent;
    personId: Id;
    label?: string;
    status?: SpouseStatus;
  }): Promise<void>;
  onCreateNew(input: {
    intent: RelativeIntent;
    name: string;
    gender?: Person["gender"];
    label?: string;
    status?: SpouseStatus;
  }): Promise<void>;
}

export function AddRelativeDialog({
  open,
  onOpenChange,
  people,
  anchor,
  initialIntent = "child",
  onLinkExisting,
  onCreateNew,
}: AddRelativeDialogProps) {
  const [intent, setIntent] = useState<RelativeIntent>(initialIntent);
  const [mode, setMode] = useState<"link" | "create">("create");
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Person["gender"]>("unknown");
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<SpouseStatus>("married");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIntent(initialIntent);
    setMode("create");
    setSelectedId(null);
    setName("");
    setGender("unknown");
    setLabel("");
    setStatus("married");
    setError(null);
    setBusy(false);
  }, [initialIntent, open]);

  const meta = INTENT_META[intent];
  const anchorName = anchor ? anchor.displayName || anchor.name : "this person";

  const submit = async () => {
    setError(null);

    if (mode === "link") {
      if (!selectedId) {
        setError("Pick a person, or switch to creating someone new.");
        return;
      }
      setBusy(true);
      try {
        await onLinkExisting({ intent, personId: selectedId, label, status });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That relationship could not be saved.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!name.trim()) {
      setError("A name is required, even if it is just how the family refers to them.");
      return;
    }

    setBusy(true);
    try {
      await onCreateNew({ intent, name: name.trim(), gender, label, status });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That relationship could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const previewName = mode === "link"
    ? people.find((person) => person.id === selectedId)?.name ?? "New person"
    : name.trim() || "New person";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a relationship</DialogTitle>
          <DialogDescription>
            {anchor ? (
              <>
                Anchored to <span className="text-foreground">{anchorName}</span>. Choose what the
                new person is to them - this creates an explicit relationship record, not just a
                position on the canvas.
              </>
            ) : (
              "Choose the relationship to record."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-1.5">
          {RELATIVE_INTENTS.map((item) => {
            const Icon = INTENT_ICONS[item];
            const itemMeta = INTENT_META[item];
            const active = item === intent;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setIntent(item)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2.5 transition-colors",
                  active
                    ? "border-primary/45 bg-primary/8 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-border hover:bg-secondary/60",
                )}
                style={
                  active
                    ? { borderColor: `color-mix(in oklab, var(${itemMeta.colorVar}) 45%, transparent)` }
                    : undefined
                }
              >
                <Icon className="size-4" />
                <span className="text-[11px] font-medium">{itemMeta.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[12px] text-muted-foreground">{meta.description}</p>

        <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-0.5">
          {(["create", "link"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                "flex-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                mode === item
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(15,10,30,0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item === "create" ? "Create a new person" : "Link an existing person"}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="relative-name">Name</Label>
              <Input
                id="relative-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intent === "parent" ? "Parent's name" : "Full name"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(value) => setGender(value as Person["gender"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not specified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can add dates, photos and a full biography afterwards from the person&apos;s panel.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Person</Label>
              <PersonCombobox
                people={people}
                value={selectedId}
                onChange={setSelectedId}
                excludeIds={anchor ? [anchor.id] : []}
                placeholder="Choose from this lineage"
              />
            </div>
            {selectedId && (
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <PersonAvatar
                  person={people.find((person) => person.id === selectedId)!}
                  size="xs"
                />
                <span className="text-[12px] text-foreground">
                  {describeIntent(intent, anchorName, previewName)}
                </span>
              </div>
            )}
          </div>
        )}

        {intent === "spouse" && (
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as SpouseStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SPOUSE_STATUS_LABELS) as SpouseStatus[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SPOUSE_STATUS_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {intent === "other" && (
          <div className="grid gap-1.5">
            <Label htmlFor="relative-label">Relationship name</Label>
            <Input
              id="relative-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Guru, godparent, guardian, ward…"
            />
          </div>
        )}

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
            {mode === "create" ? "Create and link" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
