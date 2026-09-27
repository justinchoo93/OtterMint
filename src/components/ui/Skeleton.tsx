import { cx } from "./cx";

const RADIUS = { md: "rounded-md", tile: "rounded-tile", card: "rounded-card" } as const;

/** Pulsing placeholder block for first loads. Refetches keep the old render instead. */
export function Skeleton({
  className,
  radius = "md",
}: {
  /** Size and layout only, e.g. "h-8 w-48"; use `radius` for corners. */
  className?: string;
  radius?: keyof typeof RADIUS;
}) {
  return <div aria-hidden className={cx("animate-pulse-subtle bg-surface-raised", RADIUS[radius], className)} />;
}
