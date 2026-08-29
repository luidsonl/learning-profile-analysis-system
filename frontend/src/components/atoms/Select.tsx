import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

interface SelectTriggerProps {
  className?: string;
  invalid?: boolean;
  children: ReactNode;
}

function SelectTrigger({ className = "", invalid, children }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "inline-flex h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-base text-text",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "data-[placeholder]:text-text-muted/60",
        invalid && "border-danger",
        className,
      )}
    >
      {children}
      <SelectPrimitive.Icon className="text-text-muted">
        <ChevronDown size={16} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

interface SelectContentProps {
  children: ReactNode;
}

function SelectContent({ children }: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          "z-50 min-w-[var(--radix-select-trigger-width)] rounded-md border border-border bg-surface p-1 shadow-card-hover",
        )}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

interface SelectItemProps {
  value: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}

function SelectItem({ value, className = "", disabled, children }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 rounded px-3 py-2 text-sm text-text",
        "focus:bg-surface-muted focus:outline-none",
        "data-[state=checked]:text-primary",
        disabled && "cursor-not-allowed text-text-muted/60",
        className,
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check size={16} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export default Select;
export { SelectTrigger, SelectContent, SelectItem };
