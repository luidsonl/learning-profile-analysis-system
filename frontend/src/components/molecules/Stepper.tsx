import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

// Form wizard section progress. Keeps state with the parent on back/next.
export default function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <nav aria-label="Progresso do formulário" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-sm font-medium",
                  done && "border-success bg-success text-white",
                  active && "border-primary bg-primary text-white",
                  !done && !active && "border-border bg-surface text-text-muted",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-semibold text-text" : "text-text-muted",
                  done && active ? "text-text" : "",
                )}
              >
                {label}
              </span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
