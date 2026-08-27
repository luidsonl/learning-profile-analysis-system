import type { ReactNode } from "react";

// Fieldset wrapper for a group of questions; legend carries the section title
// so screen readers announce the grouping. (design-system.md)
export default function QuestionGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="mb-6 rounded-lg border border-border bg-surface p-5 shadow-card">
      <legend className="px-1 text-lg font-semibold text-text">{title}</legend>
      {description && <p className="mb-4 text-sm text-text-muted">{description}</p>}
      <div className="space-y-6">{children}</div>
    </fieldset>
  );
}
