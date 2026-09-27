"use client";

import { Card, CardHeader, cx, EmptyState } from "@/components/ui";
import type { CategoryRow } from "@/lib/analytics-model";
import { formatSignedPercent, formatWholeCurrency } from "@/lib/format";

interface CategoryListProps {
  rows: CategoryRow[];
  periodLabel: string;
  /** Selected row key ("OTHER" for the folded row), or null. */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

/** "Where it went": spending by category, ranked, one bar color for every row. */
export function CategoryList({ rows, periodLabel, selectedKey, onSelect }: CategoryListProps) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <Card aria-label="Spending by category" className="flex flex-col">
      <CardHeader title="Where it went" subtitle={`Spending by category · ${periodLabel}`} />
      {rows.length === 0 ? (
        <EmptyState className="mt-4">No spending in this period.</EmptyState>
      ) : (
        <>
          <ul className="mt-3.5 flex flex-col gap-0.5">
            {rows.map((row) => {
              const selected = selectedKey === row.key;
              const label =
                row.key === "OTHER" ? `Other · ${row.memberKeys.length} categories` : row.label;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? null : row.key)}
                    data-category-key={row.key}
                    className={cx(
                      "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_76px_44px] items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-left transition-colors sm:min-h-10 sm:grid-cols-[minmax(0,1fr)_84px_52px]",
                      selected ? "bg-surface-hover" : "hover:bg-surface-raised"
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-[5px]">
                      <span className="truncate text-sm text-ink">{label}</span>
                      <span aria-hidden className="block h-1 rounded-sm bg-chart-grid">
                        <span
                          className="block h-1 rounded-sm bg-series-spending"
                          style={{ width: `${row.barPct}%` }}
                        />
                      </span>
                    </span>
                    <span className="text-right font-mono text-[13px] text-ink tabular-nums">
                      {formatWholeCurrency(row.total)}
                    </span>
                    <span
                      className={cx(
                        "text-right text-xs font-semibold",
                        !row.delta || row.delta.direction === "flat"
                          ? "text-ink-muted"
                          : row.delta.good
                            ? "text-positive"
                            : "text-negative"
                      )}
                    >
                      {row.delta ? formatSignedPercent(row.delta.pct, 0) : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto pt-3 text-xs text-ink-muted">{formatWholeCurrency(total)} total spending</p>
        </>
      )}
    </Card>
  );
}
