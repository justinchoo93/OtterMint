import type { ReactNode } from "react";
import { cx } from "./cx";

export interface LegendKeyProps {
  /** A CSS color, normally a series token such as var(--series-income). */
  color: string;
  /** Mirror the mark: square for bars and areas, line for lines, dot for markers. */
  shape: "square" | "line" | "dashed-line" | "dot";
  children: ReactNode;
  className?: string;
}

/** A series key: colored mark beside text in ink color (text never wears the series color). */
export function LegendKey({ color, shape, children, className }: LegendKeyProps) {
  let mark: ReactNode;
  if (shape === "square") {
    mark = <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />;
  } else if (shape === "dot") {
    mark = <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />;
  } else {
    mark = (
      <svg aria-hidden width="18" height="2" className="shrink-0">
        <line
          x1="0"
          y1="1"
          x2="18"
          y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={shape === "dashed-line" ? "4 3" : undefined}
        />
      </svg>
    );
  }
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs text-ink-secondary", className)}>
      {mark}
      <span>{children}</span>
    </span>
  );
}
