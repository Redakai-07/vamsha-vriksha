"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PersonAvatar } from "@/components/person/PersonAvatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Gender, Person } from "@/lib/domain/types";
import { GENDERS } from "@/lib/domain/types";
import { formatPartialDate, isValidPartialDate, normalizeDateInput } from "@/lib/utils/date";
import { fileToAvatarDataUrl, isSupportedImage } from "@/lib/utils/image";
import { GENDER_LABELS } from "@/lib/utils/person";

export interface PersonFormValues {
  name: string;
  displayName?: string;
  gender: Gender;
  dateOfBirth: string | null;
  dateOfDeath: string | null;
  profilePhoto: string | null;
  notes?: string;
}

export interface PersonFormDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "create" | "edit";
  /** Person being edited (edit mode). */
  person?: Person | null;
  /** Prefill for create mode (e.g. the name typed into a picker). */
  initialValues?: Partial<PersonFormValues>;
  title?: string;
  description?: string;
  /** Extra copy shown when the form is part of a relationship flow. */
  contextNote?: string;
  submitLabel?: string;
  onSubmit(values: PersonFormValues): Promise<void> | void;
}

const EMPTY: PersonFormValues = {
  name: "",
  displayName: "",
  gender: "unknown",
  dateOfBirth: null,
  dateOfDeath: null,
  profilePhoto: null,
  notes: "",
};

export function PersonFormDialog({
  open,
  onOpenChange,
  mode,
  person,
  initialValues,
  title,
  description,
  contextNote,
  submitLabel,
  onSubmit,
}: PersonFormDialogProps) {
  const [values, setValues] = useState<PersonFormValues>(EMPTY);
  const [birthInput, setBirthInput] = useState("");
  const [deathInput, setDeathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const base: PersonFormValues = person
      ? {
          name: person.name,
          displayName: person.displayName ?? "",
          gender: person.gender,
          dateOfBirth: person.dateOfBirth ?? null,
          dateOfDeath: person.dateOfDeath ?? null,
          profilePhoto: person.profilePhoto ?? null,
          notes: person.notes ?? "",
        }
      : { ...EMPTY, ...initialValues };

    setValues(base);
    setBirthInput(base.dateOfBirth ?? "");
    setDeathInput(base.dateOfDeath ?? "");
    setError(null);
    setBusy(false);
  }, [initialValues, open, person]);

  const patch = (next: Partial<PersonFormValues>) => setValues((prev) => ({ ...prev, ...next }));

  const handlePhoto = async (file: File | undefined) => {
    if (!file || !isSupportedImage(file)) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      patch({ profilePhoto: dataUrl });
    } catch {
      setError("That image could not be read. Try a different file.");
    }
  };

  const handleSubmit = async () => {
    const name = values.name.trim();
    if (!name) {
      setError("A name is required - everything else can be filled in later.");
      return;
    }

    const birth = normalizeDateInput(birthInput);
    const death = normalizeDateInput(deathInput);
    if (birthInput.trim() && !birth) {
      setError("Date of birth should look like 1948, 1948-03 or 1948-03-12.");
      return;
    }
    if (deathInput.trim() && !death) {
      setError("Date of death should look like 1948, 1948-03 or 1948-03-12.");
      return;
    }
    if (birth && death && birth > death) {
      setError("The date of death is before the date of birth.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        name,
        displayName: values.displayName?.trim() || undefined,
        gender: values.gender,
        dateOfBirth: birth,
        dateOfDeath: death,
        profilePhoto: values.profilePhoto ?? null,
        notes: values.notes?.trim() || undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Something went wrong while saving.",
      );
    } finally {
      setBusy(false);
    }
  };

  const birthHint = birthInput.trim() && isValidPartialDate(normalizeDateInput(birthInput) ?? "")
    ? `Shown as ${formatPartialDate(normalizeDateInput(birthInput))}`
    : "Year, year-month or full date. Unknown is fine.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {title ?? (mode === "create" ? "Add a person" : "Edit person")}
          </DialogTitle>
          <DialogDescription>
            {description ??
              "Only the name is required. Every other detail can stay empty and be filled in later - even years from now."}
          </DialogDescription>
        </DialogHeader>

        {contextNote && (
          <p className="rounded-lg border border-accent/30 bg-accent/8 px-3 py-2 text-[12px] text-foreground">
            {contextNote}
          </p>
        )}

        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-2">
            <PersonAvatar
              person={{
                id: person?.id ?? "preview",
                name: values.name || "New",
                displayName: values.displayName,
                profilePhoto: values.profilePhoto,
                dateOfDeath: values.dateOfDeath,
              }}
              size="lg"
            />
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus />
                Photo
              </Button>
              {values.profilePhoto && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove photo"
                  onClick={() => patch({ profilePhoto: null })}
                >
                  <X />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handlePhoto(event.target.files?.[0])}
            />
          </div>

          <div className="grid flex-1 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="person-name">Name</Label>
              <Input
                id="person-name"
                autoFocus
                value={values.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="e.g. Shanta Devi Sharma"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="person-display">Display name</Label>
                <Input
                  id="person-display"
                  value={values.displayName ?? ""}
                  onChange={(event) => patch({ displayName: event.target.value })}
                  placeholder="What family calls them"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Gender</Label>
                <Select
                  value={values.gender}
                  onValueChange={(value) => patch({ gender: value as Gender })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((gender) => (
                      <SelectItem key={gender} value={gender}>
                        {GENDER_LABELS[gender]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="person-dob">Date of birth</Label>
            <Input
              id="person-dob"
              value={birthInput}
              onChange={(event) => setBirthInput(event.target.value)}
              placeholder="1948 or 1948-03-12"
              inputMode="numeric"
            />
            <p className="text-[11px] text-muted-foreground">{birthHint}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-dod">Date of death</Label>
            <Input
              id="person-dod"
              value={deathInput}
              onChange={(event) => setDeathInput(event.target.value)}
              placeholder="Leave empty if living"
              inputMode="numeric"
            />
            <p className="text-[11px] text-muted-foreground">
              Used to mark the node as an ancestor who has passed on.
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="person-notes">Short note</Label>
          <Textarea
            id="person-notes"
            value={values.notes ?? ""}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="Lineage head, village, or anything you want on the record."
            className="min-h-[60px]"
          />
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {submitLabel ?? (mode === "create" ? "Add person" : "Save changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
