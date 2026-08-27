import { useId } from "react";
import type { Question } from "../../api/types";
import Input from "../atoms/Input";
import Textarea from "../atoms/Textarea";
import { RadioGroup, RadioGroupItem } from "../atoms/RadioGroup";

// Renders a single typed question for the generic form engine (single,
// multiple, likert, text, number, date). Accessible: labeled controls,
// grouped choices via fieldset/radiogroup, inline errors.
export default function QuestionControl({
  question,
  value,
  onChange,
  error,
  disabled,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const baseId = useId();

  switch (question.type) {
    case "single":
    case "likert":
      return (
        <fieldset disabled={disabled}>
          <legend className="mb-2 font-medium text-text">{question.text}</legend>
          <RadioGroup
            value={value === undefined || value === null ? "" : String(value)}
            onValueChange={(v) => onChange(question.type === "likert" ? Number(v) : v)}
            aria-label={question.text}
            className="space-y-2"
          >
            {(question.options ?? []).map((opt) => {
              const optLabel = question.type === "likert" ? String(opt) : String(opt);
              const id = `${baseId}-${optLabel}`;
              return <RadioGroupItem key={optLabel} id={id} value={optLabel} label={optLabel} />;
            })}
          </RadioGroup>
          {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
        </fieldset>
      );

    case "multiple":
      return (
        <fieldset disabled={disabled}>
          <legend className="mb-2 font-medium text-text">{question.text}</legend>
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => {
              const optLabel = String(opt);
              const id = `${baseId}-${optLabel}`;
              const checked = Array.isArray(value) && (value as (string | number)[]).includes(opt);
              return (
                <div key={optLabel} className="flex items-center gap-2">
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      const current = Array.isArray(value) ? [...(value as (string | number)[])] : [];
                      const next = checked
                        ? current.filter((v) => v !== opt)
                        : [...current, opt];
                      onChange(next);
                    }}
                    className="size-5 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-focus"
                  />
                  <label htmlFor={id} className="cursor-pointer text-base text-text">{optLabel}</label>
                </div>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
        </fieldset>
      );

    case "text":
      return (
        <LabeledQuestion question={question} id={baseId} error={error}>
          <Textarea
            id={baseId}
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
            disabled={disabled}
          />
        </LabeledQuestion>
      );

    case "number":
      return (
        <LabeledQuestion question={question} id={baseId} error={error}>
          <Input
            id={baseId}
            type="number"
            value={typeof value === "number" || value === "" ? (value as number | "") : ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            invalid={!!error}
            disabled={disabled}
          />
        </LabeledQuestion>
      );

    case "date":
      return (
        <LabeledQuestion question={question} id={baseId} error={error}>
          <Input
            id={baseId}
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            invalid={!!error}
            disabled={disabled}
          />
        </LabeledQuestion>
      );

    default:
      return null;
  }
}

function LabeledQuestion({
  question,
  id,
  error,
  children,
}: {
  question: Question;
  id: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-text">
        {question.text}
      </label>
      {children}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
