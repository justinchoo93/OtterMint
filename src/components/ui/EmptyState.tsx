import type { ReactNode } from "react";
import { cx } from "./cx";

/** Quiet placeholder for "nothing here yet" and error messages inside a card. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-tile border border-dashed border-line px-6 py-8 text-center text-caption text-ink-muted",
        className
      )}
    >
      {children}
    </div>
  );
}
