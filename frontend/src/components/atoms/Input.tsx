import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export default function Input({ className = "", invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text placeholder:text-text-muted/60",
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
