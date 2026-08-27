import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export default function Textarea({ className = "", invalid, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-text-muted/60",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "disabled:opacity-50",
        invalid && "border-danger focus-visible:outline-danger",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
