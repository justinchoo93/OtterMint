"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

interface NumberFieldProps {
  label: string;
  /** The current number; the field shows it until the user types something else. */
  value: number;
  /** Called only with numbers that parse and fall inside [min, max]. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Hide the visible label (table cells); the label still names the input. */
  hideLabel?: boolean;
  className?: string;
}

function parse(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw.replace(/[,$\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function display(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A number input that keeps what the user typed, so "-" or an empty box does
 * not jump back, and reports a number only when it parses and is in range.
 * An outside change (another control, a reset) replaces the text.
 */
export function NumberField({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  prefix,
  suffix,
  hint,
  disabled = false,
  hideLabel = false,
  className,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => display(value));
  // Adjust the text during render when the value changes from outside.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (parse(text) !== value) setText(display(value));
  }
  const parsed = parse(text);
  const invalid = parsed === null || parsed < min || parsed > max;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-caption text-ink-secondary"}>
        {label}
      </label>
      <div
        className={cx(
          "flex h-11 items-center gap-1 rounded-control border bg-surface-raised px-3 transition-colors focus-within:border-chart-muted sm:h-10",
          invalid ? "border-negative" : "border-line",
          disabled && "opacity-50"
        )}
      >
        {prefix && <span className="text-caption text-ink-muted">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const number = parse(next);
            if (number !== null && number >= min && number <= max) onChange(number);
          }}
          onBlur={() => {
            if (invalid) setText(display(value));
          }}
          className="h-full w-full min-w-0 bg-transparent font-mono text-sm tabular-nums text-ink outline-none"
        />
        {suffix && <span className="whitespace-nowrap text-caption text-ink-muted">{suffix}</span>}
      </div>
      {hint && <span className="text-micro text-ink-muted">{hint}</span>}
    </div>
  );
}
