import { varkDimensionName } from "../../lib/format";
import { cn } from "../../lib/cn";

// Profile bars (V/A/R/K) — bar + numeric value for each dimension, with a
// text alternative for screen readers. (design-system.md)
const BAR_COLORS: Record<string, string> = {
  V: "bg-primary",
  A: "bg-sky-500",
  R: "bg-violet-500",
  K: "bg-emerald-500",
};

export default function ProfileBars({
  scores,
  className = "",
}: {
  scores: Record<string, number>;
  className?: string;
}) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="sr-only">
        {entries
          .map(([key, value]) => `${varkDimensionName(key)}: ${value}`)
          .join(", ")}
      </div>
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-text">
              {varkDimensionName(key)}
            </span>
            <span className="text-sm font-semibold text-text-muted">{value.toFixed(1)}</span>
          </div>
          <div
            role="img"
            aria-label={`${varkDimensionName(key)}: ${value.toFixed(1)} de ${max.toFixed(1)}`}
            className="h-3 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className={cn("h-full rounded-full", BAR_COLORS[key] ?? "bg-primary")}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
