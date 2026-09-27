"use client";

import { useState, type CSSProperties } from "react";
import { Card, CardHeader, cx, LegendKey } from "@/components/ui";
import {
  layoutCashflowColumns,
  monthAxisLabel,
  monthLongLabel,
  monthShortLabel,
  sumPeriod,
} from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";
import { formatCompactCurrency, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";

interface CashflowChartProps {
  /** The months drawn, oldest first. */
  months: CashflowMonth[];
  /** Label for the subtitle, e.g. "Apr–Sep 2026". */
  windowLabel: string;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}

const SERIES = [
  { key: "income", label: "Income", color: "var(--series-income)" },
  { key: "spending", label: "Spending", color: "var(--series-spending)" },
  { key: "saved", label: "Saved", color: "var(--series-saved)" },
] as const;

function barWidth(count: number): number {
  if (count <= 6) return 24;
  if (count <= 12) return 16;
  return 10;
}

/**
 * Diverging monthly cash flow: income rises above the zero line, spending and
 * saving hang below it (a net withdrawal from savings stacks above income).
 * Each month is a toggle button that scopes the tiles and categories.
 */
export function CashflowChart({ months, windowLabel, selectedMonth, onSelectMonth }: CashflowChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const layout = layoutCashflowColumns(months);
  const width = barWidth(months.length);
  const dense = months.length > 12;
  // Dense charts label only a selected month; the readout and details carry the rest.
  const labelled = selectedMonth ?? (dense ? null : months[months.length - 1]?.month ?? null);

  return (
    <Card aria-label="Cash flow">
      <CardHeader
        title="Cash flow"
        subtitle={`Income above the line, spending and saving below · ${windowLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {SERIES.map((s) => (
              <LegendKey key={s.key} color={s.color} shape="square">
                {s.label}
              </LegendKey>
            ))}
          </div>
        }
      />

      <div className="relative mt-5 h-[220px] sm:h-[340px]">
        {layout.ticks.map((tick) => (
          <div key={tick.value} className="absolute right-0 left-0 h-0" style={{ top: `${tick.pct}%` }}>
            <span className="absolute -top-[7px] left-0 font-mono text-micro text-ink-muted tabular-nums">
              {tick.value === 0 ? "0" : formatCompactCurrency(tick.value)}
            </span>
            <div
              className={cx(
                "absolute right-0 left-11 h-px",
                tick.value === 0 ? "bg-chart-baseline" : "bg-chart-grid"
              )}
            />
          </div>
        ))}

        <div className="absolute inset-y-0 right-0 left-11 flex">
          {months.map((month, index) => {
            const column = layout.columns[index];
            const totals = sumPeriod([month]);
            const selected = selectedMonth === month.month;
            const upPct = column.incomePct + (column.savedAbove ? column.savedPct : 0);
            const downPct = column.spendingPct + (column.savedAbove ? 0 : column.savedPct);
            const bar: CSSProperties = { width, marginLeft: -width / 2 };
            const edge = index === 0 ? "left" : index === months.length - 1 ? "right" : "center";
            const floating = cx(
              "pointer-events-none absolute whitespace-nowrap",
              edge === "left" ? "left-0" : edge === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
            );
            return (
              <button
                key={month.month}
                type="button"
                aria-pressed={selected}
                data-month={month.month}
                aria-label={`${monthLongLabel(month.month)}${month.partial ? " (month to date)" : ""}: income ${formatWholeCurrency(totals.income)}, spending ${formatWholeCurrency(totals.spending)}, saved ${formatWholeCurrency(totals.savings)}`}
                onClick={() => onSelectMonth(selected ? null : month.month)}
                onPointerEnter={() => setHovered(month.month)}
                onPointerLeave={() => setHovered((h) => (h === month.month ? null : h))}
                onFocus={() => setHovered(month.month)}
                onBlur={() => setHovered((h) => (h === month.month ? null : h))}
                className={cx(
                  "relative h-full min-w-0 flex-1 rounded-lg transition-colors",
                  selected ? "bg-surface-hover" : "hover:bg-surface-raised"
                )}
              >
                {column.incomePct > 0 && (
                  <span
                    className={cx("absolute left-1/2 bg-series-income", !column.savedAbove && "rounded-t")}
                    style={{ ...bar, bottom: `${100 - layout.baselinePct}%`, height: `${column.incomePct}%` }}
                  />
                )}
                {column.savedAbove && column.savedPct > 0 && (
                  <span
                    className="absolute left-1/2 rounded-t bg-series-saved"
                    style={{
                      ...bar,
                      bottom: `calc(${100 - layout.baselinePct + column.incomePct}% + 2px)`,
                      height: `max(0px, calc(${column.savedPct}% - 2px))`,
                    }}
                  />
                )}
                {column.spendingPct > 0 && (
                  <span
                    className={cx(
                      "absolute left-1/2 bg-series-spending",
                      (column.savedAbove || column.savedPct === 0) && "rounded-b"
                    )}
                    style={{ ...bar, top: `calc(${layout.baselinePct}% + 1px)`, height: `${column.spendingPct}%` }}
                  />
                )}
                {!column.savedAbove && column.savedPct > 0 && (
                  <span
                    className="absolute left-1/2 rounded-b bg-series-saved"
                    style={{
                      ...bar,
                      top: `calc(${layout.baselinePct + column.spendingPct}% + 3px)`,
                      height: `max(0px, calc(${column.savedPct}% - 2px))`,
                    }}
                  />
                )}
                {labelled === month.month && (
                  <>
                    <span
                      aria-hidden
                      className={cx(floating, "rounded bg-surface/90 px-1 text-micro font-semibold text-ink")}
                      style={{ bottom: `calc(${100 - layout.baselinePct + upPct}% + 4px)` }}
                    >
                      {/* Everything above the line: income plus any withdrawal from savings. */}
                      {formatSignedWholeCurrency(totals.income + Math.max(-totals.savings, 0))}
                    </span>
                    <span
                      aria-hidden
                      className={cx(floating, "rounded bg-surface/90 px-1 text-micro font-semibold text-ink")}
                      style={{ top: `calc(${layout.baselinePct + downPct}% + 4px)` }}
                    >
                      {formatWholeCurrency(-(totals.spending + Math.max(totals.savings, 0)))}
                    </span>
                  </>
                )}
                {hovered === month.month && (
                  <span
                    aria-hidden
                    className={cx(
                      floating,
                      "top-1 z-10 flex flex-col gap-1 rounded-control border border-line bg-surface-raised px-3 py-2 text-left text-xs shadow-popover"
                    )}
                  >
                    <span className="text-ink-secondary">
                      {monthLongLabel(month.month)}
                      {month.partial ? " · to date" : ""}
                    </span>
                    {[
                      { label: "Income", value: totals.income, color: "var(--series-income)" },
                      { label: "Spending", value: totals.spending, color: "var(--series-spending)" },
                      { label: "Saved", value: totals.savings, color: "var(--series-saved)" },
                    ].map((row) => (
                      <span key={row.label} className="flex items-center gap-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />
                        <span className="font-semibold text-ink">{formatWholeCurrency(row.value)}</span>
                        <span className="text-ink-muted">{row.label}</span>
                      </span>
                    ))}
                    <span className="flex items-center gap-2 border-t border-line-subtle pt-1">
                      <span className="w-3" />
                      <span className="font-semibold text-ink">{formatSignedWholeCurrency(totals.netCashFlow)}</span>
                      <span className="text-ink-muted">Net</span>
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 ml-11 flex" aria-hidden>
        {months.map((month, index) => (
          <span
            key={month.month}
            className={cx(
              "min-w-0 flex-1 text-center font-mono text-micro whitespace-nowrap",
              selectedMonth === month.month ? "font-semibold text-ink" : "text-ink-muted"
            )}
          >
            {dense ? (index % 3 === 0 ? monthAxisLabel(month.month) : "") : monthShortLabel(month.month)}
          </span>
        ))}
      </div>
    </Card>
  );
}
