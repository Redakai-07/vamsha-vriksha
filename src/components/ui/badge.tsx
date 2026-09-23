import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        primary: "border-primary/20 bg-primary/10 text-primary",
        accent: "border-accent/30 bg-accent/12 text-accent-foreground dark:text-accent",
        parent: "border-link-parent/25 bg-link-parent/10 text-link-parent",
        spouse: "border-link-spouse/30 bg-link-spouse/12 text-link-spouse",
        sibling: "border-link-sibling/30 bg-link-sibling/12 text-link-sibling",
        muted: "border-transparent bg-muted text-muted-foreground",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
