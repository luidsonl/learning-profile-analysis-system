import { GraduationCap } from "lucide-react";
import { cn } from "../../lib/cn";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-text", className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-white">
        <GraduationCap className="size-5" aria-hidden="true" />
      </span>
      Perfil de Aprendizado
    </span>
  );
}
