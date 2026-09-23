"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * A panel that leaves the canvas visible behind it - the details panel must
 * never take over the screen, the graph stays the hero.
 *
 * It is deliberately NON-MODAL: a modal dialog would put
 * `pointer-events: none` on the rest of the page, so the user could not drag a
 * node or pan the canvas while reading someone's biodata, and any click on the
 * canvas would dismiss the panel. There is no scrim for the same reason - the
 * graph behind the panel must stay interactive and legible.
 *
 * Responsive by shape, not by component: on a phone there is no room beside the
 * canvas, so the panel becomes a bottom sheet that can be dragged down and
 * dismissed; on a wider screen it docks to the side, where it costs the graph
 * the least space. Same markup, two idioms.
 */
export function Sheet({ modal = false, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root modal={modal} {...props} />;
}

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "right" | "left" }
>(({ className, children, side = "right", ...props }, ref) => {
  const dismissRef = React.useRef<HTMLButtonElement>(null);
  const dragRef = React.useRef<{ startY: number; offset: number } | null>(null);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setDragOffset(0);
    // A decisive downward flick dismisses the sheet, the way a native one does.
    if (drag && drag.offset > 96) dismissRef.current?.click();
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        ref={ref}
        /*
         * A non-modal panel is dismissed by Radix on any outside pointerdown,
         * which would close the panel every time the user touched the canvas -
         * the opposite of what a details panel attached to a canvas should do.
         * The panel therefore closes on the X button, on Escape, on a downward
         * drag (phone), or when the selection goes away.
         */
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn(
          "fixed z-50 flex flex-col border-border bg-popover text-popover-foreground shadow-[0_20px_70px_-30px_rgba(20,12,40,0.5)] outline-none",
          // Phone: a bottom sheet, full width, with the canvas peeking above it.
          "inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-2xl border-t",
          // Desktop: a side panel alongside the graph. The opposite edge is
          // released explicitly, otherwise the mobile `inset-x-0` would pin the
          // panel to the left at full width on a wide screen too.
          "sm:inset-y-0 sm:max-h-none sm:w-full sm:max-w-[27rem] sm:rounded-none",
          side === "right" ? "sm:left-auto sm:right-0 sm:border-l" : "sm:right-auto sm:left-0 sm:border-r",
          "max-sm:data-[state=open]:vv-sheet-bottom sm:data-[state=open]:vv-sheet",
          className,
        )}
        style={{
          transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
          transition: dragging ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        {...props}
      >
        <div
          onPointerDown={(event) => {
            // Capture is a nicety (it keeps the drag alive past the handle); if
            // the environment refuses it, the gesture still works.
            try {
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            } catch {
              /* pointer capture unavailable - continue without it */
            }
            dragRef.current = { startY: event.clientY, offset: 0 };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            // Only downward drags move the sheet: pulling up must not detach it
            // from the bottom edge of the screen.
            drag.offset = Math.max(0, event.clientY - drag.startY);
            setDragOffset(drag.offset);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-hidden
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        {children}

        <DialogPrimitive.Close
          className="absolute right-2.5 top-2.5 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:right-4 sm:top-4 sm:p-1.5"
          aria-label="Close panel"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
      {/* Radix owns dismissal; the drag gesture just presses this button. */}
      <DialogPrimitive.Close ref={dismissRef} className="hidden" tabIndex={-1} aria-hidden />
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = "SheetContent";

export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
