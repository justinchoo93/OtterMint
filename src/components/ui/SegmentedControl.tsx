"use client";

import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive technology, e.g. "Time range". */
  ariaLabel: string;
  size?: "sm" | "md";
  /** Stretch to the container; buttons become 44px touch targets on phones. */
  fullWidth?: boolean;
  className?: string;
}

/** A small set of mutually exclusive options, each an aria-pressed button. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  // At least 44px tall on phones; compact from the sm breakpoint up.
  const height = fullWidth
    ? "h-11 flex-1 sm:h-[30px]"
    : size === "sm"
      ? "h-11 sm:h-6"
      : "h-11 sm:h-[30px]";
  const text = size === "sm" ? "px-2.5 text-xs" : "px-3.5 text-caption";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        "gap-0.5 rounded-control border border-line bg-surface-raised p-[3px]",
        fullWidth ? "flex w-full" : "inline-flex",
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-[7px] font-medium whitespace-nowrap transition-colors",
              height,
              text,
              selected ? "bg-surface-active text-ink" : "text-ink-secondary hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
