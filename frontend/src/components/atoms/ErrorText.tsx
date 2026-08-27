import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export default function ErrorText({ message, className = "" }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger", className)}
    >
      {message as ReactNode}
    </div>
  );
}
