"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * A side panel that leaves the canvas visible behind it - the details panel
 * must never take over the screen, the graph stays the hero.
 *
 * It is deliberately NON-MODAL: a modal dialog would put
 * `pointer-events: none` on the rest of the page, so the user could not drag a
 * node or pan the canvas while reading someone's biodata, and any click on the
 * canvas would dismiss the panel. There is no scrim for the same reason - the
 * graph behind the panel must stay interactive and legible.
 */
export function Sheet({ modal = false, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root modal={modal} {...props} />;
}

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "right" | "left" }
>(({ className, children, side = "right", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Content
      ref={ref}
      /*
       * A non-modal panel is dismissed by Radix on any outside pointerdown,
       * which would close the panel every time the user touched the canvas -
       * the opposite of what a details panel attached to a canvas should do.
       * The panel therefore closes on the X button, on Escape, or when the
       * selection goes away (clicking empty canvas).
       */
      onPointerDownOutside={(event) => event.preventDefault()}
      onInteractOutside={(event) => event.preventDefault()}
      className={cn(
        "fixed inset-y-0 z-50 flex w-full max-w-[27rem] flex-col border-border bg-popover text-popover-foreground shadow-[0_20px_70px_-30px_rgba(20,12,40,0.5)] outline-none data-[state=open]:vv-sheet",
        side === "right" ? "right-0 border-l" : "left-0 border-r",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        aria-label="Close panel"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
