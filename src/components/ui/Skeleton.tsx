import { cx } from "./cx";

/** Pulsing placeholder block for first loads. Refetches keep the old render instead. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse-subtle rounded-md bg-surface-raised", className)} />;
}
