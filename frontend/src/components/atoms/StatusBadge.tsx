import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

// Always renders an icon/pip + text — never color-only. (design-system.md)
const statusVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-muted text-text-muted",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        danger: "border-danger/30 bg-danger/10 text-danger",
        primary: "border-primary/30 bg-primary-soft text-primary-strong",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface StatusBadgeProps
  extends VariantProps<typeof statusVariants> {
  icon?: ReactNode;
  label: string;
  className?: string;
}

export default function StatusBadge({ tone, icon, label, className = "" }: StatusBadgeProps) {
  return (
    <span className={cn(statusVariants({ tone }), className)}>
      {icon ?? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
