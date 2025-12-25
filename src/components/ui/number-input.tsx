"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

export type NumberInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

/**
 * Styled number input with custom increment/decrement buttons.
 */
export function NumberInput({
  className,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  disabled,
  ...props
}: NumberInputProps) {
  const handleIncrement = () => {
    const next = value + step;
    if (max !== undefined && next > max) return;
    onValueChange(next);
  };

  const handleDecrement = () => {
    const next = value - step;
    if (min !== undefined && next < min) return;
    onValueChange(next);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (!Number.isFinite(next)) return;
    if (min !== undefined && next < min) return;
    if (max !== undefined && next > max) return;
    onValueChange(next);
  };

  return (
    <div className="relative flex w-full items-center">
      <input
        type="number"
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent pl-3 pr-20 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          // Hide default spinners - more comprehensive approach
          "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          "[&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0",
          "[&::-webkit-outer-spin-button]:[-webkit-appearance:none] [&::-webkit-inner-spin-button]:[-webkit-appearance:none]",
          "[&::-moz-appearance:textfield]",
          className,
        )}
        style={{
          MozAppearance: "textfield",
        }}
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        {...props}
      />
      <div className="absolute right-1 flex flex-col border-l border-input">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-4 w-6 rounded-none rounded-t-sm border-0"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label="Increment"
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-4 w-6 rounded-none rounded-b-sm border-0 border-t border-input"
          onClick={handleDecrement}
          disabled={disabled || (min !== undefined && value <= min)}
          aria-label="Decrement"
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
