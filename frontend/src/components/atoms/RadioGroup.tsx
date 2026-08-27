import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "../../lib/cn";

// Wraps Radix RadioGroup — provides role="radiogroup", arrow-key navigation
// and aria-checked automatically. (design-system.md)
export const RadioGroup = RadioGroupPrimitive.Root;

interface RadioGroupItemProps {
  value: string;
  id?: string;
  label: string;
  className?: string;
}

export function RadioGroupItem({ value, id, label, className = "" }: RadioGroupItemProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <RadioGroupPrimitive.Item
        id={id}
        value={value}
        className="flex size-5 items-center justify-center rounded-full border border-text-muted bg-surface focus-visible:outline-2 focus-visible:outline-focus data-[state=checked]:border-primary"
      >
        <RadioGroupPrimitive.Indicator className="flex size-2.5 items-center justify-center rounded-full bg-primary" />
      </RadioGroupPrimitive.Item>
      <label
        htmlFor={id}
        className="cursor-pointer text-base text-text"
      >
        {label}
      </label>
    </div>
  );
}
