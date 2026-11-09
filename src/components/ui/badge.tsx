import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-tight",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary/80 text-muted-foreground",
        ok: "border-border bg-secondary/80 text-ok",
        warn: "border-border bg-secondary/80 text-warn",
        bad: "border-border bg-secondary/80 text-bad",
        info: "border-border bg-secondary/80 text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
