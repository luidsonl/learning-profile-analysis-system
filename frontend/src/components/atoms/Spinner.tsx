import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export default function Spinner({ className = "", label = "Carregando" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-text-muted", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
