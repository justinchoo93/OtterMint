import type { ReactNode } from "react";
import { cx } from "./cx";

/** Quiet placeholder for "nothing here yet" and error messages inside a card. */
export function EmptyState({
  children,
  compact = false,
  className,
}: {
  children: ReactNode;
  /** Single-line prompt height instead of the roomier default. */
  compact?: boolean;
  /** Layout-only additions such as margins; do not override padding or color. */
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-tile border border-dashed border-line px-6 text-center text-caption text-ink-muted",
        compact ? "py-5" : "py-8",
        className
      )}
    >
      {children}
    </div>
  );
}
