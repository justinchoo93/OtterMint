"use client";

import { Card, CardHeader, cx, DeltaIndicator, EmptyState } from "@/components/ui";
import type { CategoryTrendRow } from "@/lib/analytics-model";
import { formatSignedPercent, formatWholeCurrency } from "@/lib/format";

interface MiniColumnsProps {
  /** One value per month, oldest first. */
  values: number[];
  /** Dim the last bar: it is the current month to date. */
  partialLast: boolean;
}

/**
 * A row of small monthly bars on the row's own scale. Bars share the box
 * width (at most 24px each) so three months stay chunky and twenty-four stay
 * legible without any measuring.
 */
export function MiniColumns({ values, partialLast }: MiniColumnsProps) {
  const max = Math.max(0, ...values);
  return (
    <span aria-hidden data-testid="mini-columns" className="flex h-6 w-[106px] items-end gap-0.5 sm:h-7 sm:w-[166px]">
      {values.map((value, index) => (
        <span
          key={index}
          className="min-h-[2px] min-w-0 max-w-6 flex-1 rounded-t-sm bg-series-spending"
          style={{
            height: max > 0 ? `${Math.max(0, (Math.max(value, 0) / max) * 100)}%` : "2px",
            opacity: partialLast && index === values.length - 1 ? 0.55 : 1,
          }}
        />
      ))}
    </span>
  );
}

interface CategoryTrendsCardProps {
  rows: CategoryTrendRow[];
  /** "Oct 2025–Sep 2026" */
  windowLabel: string;
  /** "vs prior 12 mo", or null when nothing covers the prior window. */
  comparisonShortLabel: string | null;
  partialLast: boolean;
}

const GRID = "grid-cols-[minmax(0,1fr)_106px_60px] gap-3 sm:grid-cols-[minmax(0,1fr)_166px_90px_120px] sm:gap-4";

/** Spending by category over the window, one row of bars per category, fastest-growing first. */
export function CategoryTrendsCard({ rows, windowLabel, comparisonShortLabel, partialLast }: CategoryTrendsCardProps) {
  const compared = comparisonShortLabel !== null;
  return (
    <Card aria-label="Category trends" className="flex flex-col">
      <CardHeader
        title="Category trends"
        subtitle={`Monthly spending by category · ${compared ? "growing fastest first" : "largest first"}`}
      />
      {rows.length === 0 ? (
        <EmptyState className="mt-4">No spending in this range.</EmptyState>
      ) : (
        <>
          <div
            className={cx(
              "mt-4 grid items-center border-b border-line-subtle px-2.5 pb-2 text-xs font-medium text-ink-muted",
              GRID
            )}
          >
            <span>Category</span>
            <span>{windowLabel}</span>
            <span className="hidden text-right sm:block">Avg / month</span>
            <span className="text-right">{comparisonShortLabel ?? "Change"}</span>
          </div>
          <ul className="flex flex-col">
            {rows.map((row) => {
              const label = row.key === "OTHER" ? `Other · ${row.memberKeys.length} categories` : row.label;
              const change = !row.delta
                ? "no comparison"
                : row.delta.direction === "flat"
                  ? "flat"
                  : `${formatSignedPercent(row.delta.pct, 0)} ${comparisonShortLabel ?? ""}`.trim();
              return (
                <li
                  key={row.key}
                  aria-label={`${label}, average ${formatWholeCurrency(row.average)} a month, ${change}`}
                  className={cx(
                    "grid min-h-[52px] items-center border-b border-line-subtle px-2.5 text-sm sm:min-h-11",
                    GRID
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-ink">{label}</span>
                    <span className="font-mono text-[11px] text-ink-muted tabular-nums sm:hidden">
                      {formatWholeCurrency(row.average)}/mo
                    </span>
                  </span>
                  <MiniColumns values={row.series} partialLast={partialLast} />
                  <span className="hidden text-right font-mono text-[13px] text-ink tabular-nums sm:block">
                    {formatWholeCurrency(row.average)}
                  </span>
                  <span className="flex justify-end">
                    {!row.delta ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : row.delta.direction === "flat" ? (
                      <span className="text-xs font-semibold text-ink-muted">Flat</span>
                    ) : (
                      <DeltaIndicator direction={row.delta.direction} tone={row.delta.good ? "positive" : "negative"}>
                        {formatSignedPercent(row.delta.pct, 0)}
                      </DeltaIndicator>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto pt-3 text-xs text-ink-muted">
            Each row&apos;s bars use their own scale.
            {partialLast ? " The lighter bar is the current month to date." : ""}
          </p>
        </>
      )}
    </Card>
  );
}
