"use client";

import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { biodataRepo } from "@/lib/db/repositories/biodata";
import type { Biodata, BiodataField, Id, Person } from "@/lib/domain/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type SaveState = "idle" | "saving" | "saved";

interface Fields {
  placeOfBirth: string;
  placeOfDeath: string;
  occupation: string;
  education: string;
  biography: string;
  notes: string;
}

const EMPTY: Fields = {
  placeOfBirth: "",
  placeOfDeath: "",
  occupation: "",
  education: "",
  biography: "",
  notes: "",
};

function toFields(biodata: Biodata | undefined): Fields {
  return {
    placeOfBirth: biodata?.placeOfBirth ?? "",
    placeOfDeath: biodata?.placeOfDeath ?? "",
    occupation: biodata?.occupation ?? "",
    education: biodata?.education ?? "",
    biography: biodata?.biography ?? "",
    notes: biodata?.notes ?? "",
  };
}

interface PendingEdit {
  personId: Id;
  fields: Fields;
}

/**
 * Biodata autosaves - there is no Save button, because in an offline-first app
 * the safest thing is that whatever the user typed is already in IndexedDB
 * before they look away.
 *
 * Two hazards are handled explicitly, since both would silently write one
 * person's life story onto another:
 *
 *  1. the debounced payload carries the person id it belongs to, so a save that
 *     was queued before switching people is dropped rather than misapplied, and
 *  2. leaving a person flushes their pending keystrokes first, so the last thing
 *     typed is never lost when the panel moves on.
 */
export function BiodataSection({ person, biodata }: { person: Person; biodata?: Biodata }) {
  const [fields, setFields] = useState<Fields>(() => toFields(biodata));
  const [customFields, setCustomFields] = useState<BiodataField[]>(biodata?.customFields ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const pending = useDebouncedValue<PendingEdit>(
    { personId: person.id, fields },
    650,
  );

  const latestRef = useRef<PendingEdit>({ personId: person.id, fields: toFields(biodata) });
  const currentPersonRef = useRef<Id>(person.id);
  /** personId -> serialized fields that are known to be on disk. */
  const savedRef = useRef<Map<Id, string>>(new Map([[person.id, JSON.stringify(toFields(biodata))]]));

  const flush = useCallback(async (edit: PendingEdit) => {
    const serialized = JSON.stringify(edit.fields);
    if (savedRef.current.get(edit.personId) === serialized) return;
    savedRef.current.set(edit.personId, serialized);
    await biodataRepo.upsert(edit.personId, edit.fields);
  }, []);

  // Switching people: flush what is still pending, then load the new record.
  useEffect(() => {
    if (currentPersonRef.current === person.id) return;
    void flush(latestRef.current);
    currentPersonRef.current = person.id;

    const next = toFields(biodata);
    latestRef.current = { personId: person.id, fields: next };
    savedRef.current.set(person.id, JSON.stringify(next));
    setFields(next);
    setCustomFields(biodata?.customFields ?? []);
    setSaveState("idle");
  }, [biodata, flush, person.id]);

  // External changes (another tab, an import) while this panel is idle.
  useEffect(() => {
    if (currentPersonRef.current !== person.id) return;
    const incoming = toFields(biodata);
    const serialized = JSON.stringify(incoming);
    if (savedRef.current.get(person.id) === serialized) return;
    savedRef.current.set(person.id, serialized);
    latestRef.current = { personId: person.id, fields: incoming };
    setFields(incoming);
  }, [biodata, person.id]);

  // The debounced write itself.
  useEffect(() => {
    // Still typing: the debounced payload has not caught up with the form yet.
    if (JSON.stringify(pending.fields) !== JSON.stringify(latestRef.current.fields)) return;
    // Left this person before the timer fired - never apply it to anyone else.
    if (pending.personId !== currentPersonRef.current) return;
    if (savedRef.current.get(pending.personId) === JSON.stringify(pending.fields)) return;

    setSaveState("saving");
    void flush(pending)
      .then(() => {
        if (currentPersonRef.current === pending.personId) setSaveState("saved");
      })
      .catch(() => {
        // Keep the local state: the user's text is still on screen, and the next
        // keystroke will retry the write.
        if (currentPersonRef.current === pending.personId) setSaveState("idle");
      });
  }, [flush, pending]);

  // Closing the panel must not lose the last keystrokes.
  useEffect(
    () => () => {
      void flush(latestRef.current);
    },
    [flush],
  );

  const patch = (next: Partial<Fields>) =>
    setFields((prev) => {
      const merged = { ...prev, ...next };
      latestRef.current = { personId: currentPersonRef.current, fields: merged };
      return merged;
    });

  const updateCustomField = (id: string, patchField: Partial<BiodataField>) => {
    setCustomFields((prev) => {
      const next = prev.map((field) => (field.id === id ? { ...field, ...patchField } : field));
      void biodataRepo.setCustomFields(person.id, next);
      return next;
    });
  };

  const addCustomField = () => {
    setCustomFields((prev) => {
      const next = [
        ...prev,
        { id: `fld_${Math.random().toString(36).slice(2, 10)}`, label: "", value: "" },
      ];
      void biodataRepo.setCustomFields(person.id, next);
      return next;
    });
  };

  const removeCustomField = (id: string) => {
    setCustomFields((prev) => {
      const next = prev.filter((field) => field.id !== id);
      void biodataRepo.setCustomFields(person.id, next);
      return next;
    });
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-medium">Biodata</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {saveState === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="size-3 text-link-sibling" /> Saved on this device
            </>
          )}
          {saveState === "idle" && "Autosaves as you type"}
        </span>
      </div>

      <div className="grid gap-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="biodata-place-birth"
            label="Place of birth"
            value={fields.placeOfBirth}
            onChange={(value) => patch({ placeOfBirth: value })}
            placeholder="Village, town, city"
          />
          <Field
            id="biodata-place-death"
            label="Place of death"
            value={fields.placeOfDeath}
            onChange={(value) => patch({ placeOfDeath: value })}
            placeholder="Optional"
          />
          <Field
            id="biodata-occupation"
            label="Occupation"
            value={fields.occupation}
            onChange={(value) => patch({ occupation: value })}
            placeholder="Farmer, teacher, weaver…"
          />
          <Field
            id="biodata-education"
            label="Education"
            value={fields.education}
            onChange={(value) => patch({ education: value })}
            placeholder="Schooling, degrees, training"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="biodata-biography">Biography</Label>
          <Textarea
            id="biodata-biography"
            value={fields.biography}
            onChange={(event) => patch({ biography: event.target.value })}
            placeholder="Their life, work, migrations, stories the family tells…"
            className="min-h-[140px]"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="biodata-notes">Notes</Label>
          <Textarea
            id="biodata-notes"
            value={fields.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="Uncertain details, sources, questions for elders."
            className="min-h-[70px]"
          />
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-medium">Additional details</h3>
          <Button type="button" variant="outline" size="xs" onClick={addCustomField}>
            <Plus /> Field
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Gotra, native village, clan, migration year, awards - anything the standard fields do not
          cover. These are stored inside the person&apos;s biodata record.
        </p>

        {customFields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
            No extra fields yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {customFields.map((field) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  value={field.label}
                  onChange={(event) => updateCustomField(field.id, { label: event.target.value })}
                  placeholder="Label"
                  className="h-8 w-32 shrink-0 text-[12px]"
                />
                <Input
                  value={field.value}
                  onChange={(event) => updateCustomField(field.id, { value: event.target.value })}
                  placeholder="Value"
                  className="h-8 text-[12px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${field.label || "field"}`}
                  onClick={() => removeCustomField(field.id)}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
