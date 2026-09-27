"use client";

import { cx, DeltaIndicator } from "@/components/ui";
import type { Delta } from "@/lib/analytics-model";
import { formatSignedPercent } from "@/lib/format";

interface StatTileProps {
  label: string;
  value: string;
  delta: Delta | null;
  /** "vs prior 6 mo" or "vs Jul"; shown after the delta. */
  comparisonShortLabel: string | null;
  /** Extra muted note, e.g. "41% kept". */
  extra?: string;
  /** Recent complete months for the sparkline; hidden with fewer than two. */
  spark: number[];
  pressed: boolean;
  onClick: () => void;
  /** Stable id used to return focus to this tile when its details close. */
  tileId?: string;
}

const SPARK_W = 96;
const SPARK_H = 36;
const SPARK_PAD = 3;

function sparkGeometry(values: number[]): { d: string; x: number; y: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  let x = 0;
  let y = 0;
  const d = values
    .map((value, i) => {
      x = SPARK_PAD + (i / (values.length - 1)) * (SPARK_W - SPARK_PAD * 2);
      y = SPARK_PAD + ((max - value) / range) * (SPARK_H - SPARK_PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return { d, x, y };
}

/** A cash-flow figure that also toggles its details: label, value, change, sparkline. */
export function StatTile({
  label,
  value,
  delta,
  comparisonShortLabel,
  extra,
  spark,
  pressed,
  onClick,
  tileId,
}: StatTileProps) {
  const geometry = spark.length >= 2 ? sparkGeometry(spark) : null;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-tile={tileId}
      className={cx(
        "grid min-h-[118px] w-full grid-cols-1 content-start gap-y-1.5 rounded-tile border bg-surface p-4 text-left transition-colors sm:min-h-[124px] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-3 sm:px-5 sm:py-[18px]",
        pressed ? "border-accent" : "border-line hover:border-chart-muted"
      )}
    >
      <span className="text-caption font-medium text-ink-secondary sm:col-span-2">{label}</span>
      <span className="self-end text-[1.5rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-figure">
        {value}
      </span>
      {geometry && (
        <span aria-hidden className="relative order-last mt-1.5 block h-6 w-full shrink-0 sm:order-none sm:mt-0 sm:h-9 sm:w-24 sm:self-end">
          <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d={geometry.d}
              fill="none"
              stroke="var(--chart-muted-line)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
            style={{ left: `${(geometry.x / SPARK_W) * 100}%`, top: `${(geometry.y / SPARK_H) * 100}%` }}
          />
        </span>
      )}
      {(delta || extra) && (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-muted sm:col-span-2">
            {delta && (
              <DeltaIndicator
                direction={delta.direction}
                tone={delta.direction === "flat" ? "neutral" : delta.good ? "positive" : "negative"}
              >
                {formatSignedPercent(delta.pct)}
              </DeltaIndicator>
            )}
            {delta && comparisonShortLabel && <span>{comparisonShortLabel}</span>}
            {extra && <span>{delta ? `· ${extra}` : extra}</span>}
          </span>
      )}
    </button>
  );
}
