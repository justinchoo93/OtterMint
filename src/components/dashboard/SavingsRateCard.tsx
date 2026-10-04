"use client";

import { Card, DeltaIndicator, EmptyState } from "@/components/ui";
import { SavingsRateChart } from "@/components/dashboard/SavingsRateChart";
import { monthLongLabel, savingsRateSummary, spanLabel, sumPeriod } from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";
import { formatSignedPoints, formatWholeCurrency } from "@/lib/format";

interface SavingsRateCardProps {
  /** The months the line draws, oldest first: the period, or six months of context around a short one. */
  window: CashflowMonth[];
  /** The months the figures summarize. */
  period: CashflowMonth[];
  /** The months the period is compared with, its last month counted like for like; null when data does not cover it. */
  prior: CashflowMonth[] | null;
  /** "vs Aug 1–26" or "vs 2024" for calendar periods; the default names the previous months. */
  comparison?: string | null;
}

/** The share of income kept: a hero figure, its change against the prior window, and one line by month. */
export function SavingsRateCard({ window, period, prior, comparison }: SavingsRateCardProps) {
  const summary = savingsRateSummary(period, prior);
  const totals = sumPeriod(period);
  // Best and lowest need at least two months to mean anything.
  const extremes = period.length >= 2;
  const savedShare = totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : null;
  const partial = period.some((m) => m.partial);
  const points = summary.deltaPoints;
  const direction =
    points === null ? "flat" : Math.round(points * 10) === 0 ? "flat" : points > 0 ? "up" : "down";

  return (
    <Card padding="lg" aria-label="Savings rate">
      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="flex flex-col lg:col-start-1 lg:row-start-1">
          <span className="text-caption font-medium text-ink-secondary">Savings rate</span>
          <span className="mt-2 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.025em] text-ink sm:text-hero">
            {summary.rate === null ? "—" : `${Math.round(summary.rate)}%`}
          </span>
          <span className="mt-2 text-caption text-ink-secondary">of income kept · {spanLabel(period)}</span>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {points !== null && prior ? (
              <>
                <DeltaIndicator
                  size="md"
                  direction={direction}
                  tone={direction === "flat" ? "neutral" : direction === "up" ? "positive" : "negative"}
                >
                  {formatSignedPoints(points)}
                </DeltaIndicator>
                <span className="text-ink-secondary">{comparison ?? `vs the previous ${prior.length} months`}</span>
              </>
            ) : (
              <span className="text-ink-secondary">no earlier months to compare</span>
            )}
          </div>
        </div>

        <div className="mt-6 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-secondary">
            <span>Share of income kept each month</span>
            {extremes && (summary.best || summary.lowest) && (
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {summary.best && (
                  <span>
                    Best {monthLongLabel(summary.best.month)} · {Math.round(summary.best.rate)}%
                  </span>
                )}
                {summary.lowest && (
                  <span>
                    Lowest {monthLongLabel(summary.lowest.month)} · {Math.round(summary.lowest.rate)}%
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="mt-3">
            {summary.rate === null ? (
              <EmptyState>No income in this range.</EmptyState>
            ) : (
              <SavingsRateChart months={window} />
            )}
          </div>
          <details className="group mt-3 text-xs text-ink-muted">
            <summary className="cursor-pointer list-none py-3.5 select-none hover:text-ink-secondary sm:py-0 [&::-webkit-details-marker]:hidden">
              <span className="text-accent underline decoration-accent/40 underline-offset-2">About this chart</span>
            </summary>
            <div className="mt-2 space-y-1.5 leading-relaxed">
              <p>Each point is the month&apos;s income minus its spending, as a share of its income. A month with no income has no point.</p>
              {partial && (
                <p>
                  The current month is month to date
                  {prior
                    ? ", and the last month of the previous window is counted through the same day of the month, so the comparison is like for like"
                    : ""}
                  .
                </p>
              )}
            </div>
          </details>
        </div>

        <div className="mt-6 flex flex-col gap-2.5 border-t border-line-subtle pt-5 lg:col-start-1 lg:row-start-2 lg:mt-7">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Income</span>
            <span className="font-semibold text-ink">{formatWholeCurrency(totals.income)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Kept</span>
            <span className="font-semibold text-ink">{formatWholeCurrency(totals.netCashFlow)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-secondary">Moved to savings</span>
            <span className="flex items-baseline gap-2">
              <span className="font-semibold text-ink">{formatWholeCurrency(totals.savings)}</span>
              {savedShare !== null && <span className="text-xs text-ink-muted">{savedShare}% of income</span>}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Kept is income minus spending. Moved to savings counts transfers into savings and investment accounts.
          </p>
        </div>
      </div>
    </Card>
  );
}
