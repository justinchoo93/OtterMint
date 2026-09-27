import type { ReactNode } from "react";
import { cx } from "./cx";

export interface DeltaIndicatorProps {
  direction: "up" | "down" | "flat";
  /** Whether this change is good, bad or neither for the reader. */
  tone: "positive" | "negative" | "neutral";
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

const TONE = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-ink-secondary",
} as const;

/** A change figure: arrow plus signed text, so direction never rests on color alone. */
export function DeltaIndicator({ direction, tone, children, size = "sm", className }: DeltaIndicatorProps) {
  return (
    <span
      data-direction={direction}
      data-tone={tone}
      className={cx(
        "inline-flex items-center gap-1 font-semibold whitespace-nowrap",
        size === "md" ? "text-sm" : "text-xs",
        TONE[tone],
        className
      )}
    >
      <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden className="shrink-0" fill="currentColor">
        {direction === "up" ? (
          <path d="M5 1l4 6H1z" />
        ) : direction === "down" ? (
          <path d="M5 7L1 1h8z" />
        ) : (
          <rect x="1" y="3" width="8" height="2" rx="1" />
        )}
      </svg>
      <span>{children}</span>
    </span>
  );
}
