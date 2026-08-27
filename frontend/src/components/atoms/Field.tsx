import { useId, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
  /** Input props collection for cloning (spread onto the child). */
  inputProps?: Omit<HTMLAttributes<HTMLInputElement>, "id" | "aria-describedby" | "aria-invalid">;
}

export default function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className = "",
  children,
  inputProps,
}: FieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-text"
      >
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      {typeof children === "function"
        ? (children as (p: Record<string, unknown>) => ReactNode)({
            id,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
            ...(inputProps ?? {}),
          })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
