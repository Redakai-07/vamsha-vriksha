"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Camera",
    items: [
      { keys: ["Drag"], label: "Pan the canvas (also middle-drag)" },
      { keys: ["Scroll"], label: "Zoom (or pan, per your preference)" },
      { keys: ["Ctrl", "Scroll"], label: "Zoom, always" },
      { keys: ["Shift", "Scroll"], label: "Pan horizontally" },
      { keys: ["Pinch"], label: "Zoom and pan together on touch" },
      { keys: ["F"], label: "Fit the whole family on screen" },
      { keys: ["1"], label: "Reset zoom to 100%" },
      { keys: ["+", "−"], label: "Zoom in / out" },
      { keys: ["Arrows"], label: "Nudge the camera" },
    ],
  },
  {
    title: "People",
    items: [
      { keys: ["N"], label: "Add a person" },
      { keys: ["Double click"], label: "Add a person at that exact spot" },
      { keys: ["Click"], label: "Open a person's panel" },
      { keys: ["Drag"], label: "Move a person (position is not kinship)" },
      { keys: ["C"], label: "Centre on the selected person" },
      { keys: ["Delete"], label: "Delete the selected person" },
    ],
  },
  {
    title: "Graph",
    items: [
      { keys: ["L"], label: "Tidy up the layout" },
      { keys: ["/"], label: "Find how two people are related" },
      { keys: ["M"], label: "Toggle the minimap" },
      { keys: ["Esc"], label: "Close panels and cancel a pending link" },
      { keys: ["?"], label: "Show this list" },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard &amp; gestures</DialogTitle>
          <DialogDescription>
            Everything here works offline, on a trackpad, on a mouse and on a touchscreen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group.title} className="grid content-start gap-2.5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {group.title}
              </h3>
              {group.items.map((item) => (
                <div key={item.label} className="flex items-start gap-2">
                  <span className="flex shrink-0 gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                  <span className="text-[12px] leading-snug text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
