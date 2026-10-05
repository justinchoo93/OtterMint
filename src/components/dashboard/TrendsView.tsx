"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { CategoryTrendsCard } from "@/components/dashboard/CategoryTrendsCard";
import { NeedsCategoryCard } from "@/components/dashboard/NeedsCategoryCard";
import { PeriodBar } from "@/components/dashboard/PeriodBar";
import { RecurringChargesCard, type RecurringState } from "@/components/dashboard/RecurringChargesCard";
import { SavingsRateCard } from "@/components/dashboard/SavingsRateCard";
import { YearToDateCard } from "@/components/dashboard/YearToDateCard";
import {
  CASHFLOW_FETCH_MONTHS,
  categoryTrends,
  firstDataMonthIndex,
  likeForLikePrior,
  resolvePeriod,
  todayUtc,
  yearToDate,
  type Period,
} from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";
import type { RecurringSummary } from "@/lib/recurring";

interface TrendsViewProps {
  /** Set for the household view, which has no analytics yet. */
  groupId?: string;
  refreshKey?: number;
  /** Called after the owner changes a category, so every view refetches. */
  onCategorized?: () => void;
}

type CashflowState = {
  status: "loading" | "ready" | "error";
  months: CashflowMonth[];
};

/**
 * The Analytics destination: what is changing (savings rate and category
 * trends, scoped by the period bar), this year against last, and what
 * repeats (recurring charges, not scoped).
 */
export function TrendsView({ groupId, refreshKey, onCategorized }: TrendsViewProps) {
  const [selection, setSelection] = useState<Period>({ kind: "preset", id: "1Y" });
  const [cashflow, setCashflow] = useState<CashflowState>({ status: "loading", months: [] });
  const [recurring, setRecurring] = useState<RecurringState>({ status: "loading", summary: null });
  const isHousehold = Boolean(groupId);

  useEffect(() => {
    if (isHousehold) return;
    const controller = new AbortController();
    const load = async () => {
      setCashflow((current) => ({ status: "loading", months: current.months }));
      try {
        const response = await fetch(`/api/analytics/cashflow?months=${CASHFLOW_FETCH_MONTHS}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Cashflow request failed: ${response.status}`);
        const data = (await response.json()) as { months?: CashflowMonth[] };
        setCashflow({ status: "ready", months: data.months ?? [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch cashflow:", error);
        setCashflow((current) => ({ status: "error", months: current.months }));
      }
    };
    load();
    return () => controller.abort();
  }, [isHousehold, refreshKey]);

  useEffect(() => {
    if (isHousehold) return;
    const controller = new AbortController();
    const load = async () => {
      setRecurring((current) => ({ status: "loading", summary: current.summary }));
      try {
        const response = await fetch("/api/analytics/recurring", { signal: controller.signal });
        if (!response.ok) throw new Error(`Recurring request failed: ${response.status}`);
        const data = (await response.json()) as RecurringSummary;
        setRecurring({ status: "ready", summary: data });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch recurring charges:", error);
        setRecurring((current) => ({ status: "error", summary: current.summary }));
      }
    };
    load();
    return () => controller.abort();
  }, [isHousehold, refreshKey]);

  const months = cashflow.months;
  const today = todayUtc();
  const period = useMemo(() => resolvePeriod(months, selection, today), [months, selection, today]);
  const prior = useMemo(() => likeForLikePrior(period), [period]);
  const rows = useMemo(() => categoryTrends(period.periodMonths, prior), [period, prior]);
  const ytd = useMemo(() => yearToDate(months, today), [months, today]);
  const firstData = firstDataMonthIndex(months);
  const partialLast = period.periodMonths[period.periodMonths.length - 1]?.partial ?? false;
  const currentMonth = today.slice(0, 7);

  if (isHousehold) {
    return <EmptyState>Household analytics are not available yet.</EmptyState>;
  }

  const caption = period.comparisonLabel ?? period.historyStartsLabel;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PeriodBar
        period={selection}
        onChange={setSelection}
        bounds={{ firstMonth: firstData !== null ? months[firstData].month : currentMonth, lastMonth: currentMonth }}
        today={today}
        label={period.buttonLabel}
        caption={
          <>
            {caption && <span>{caption}</span>}
            <span>Sets the window for savings rate and category trends</span>
          </>
        }
      />

      {cashflow.status === "loading" && months.length === 0 ? (
        <div className="flex flex-col gap-6" data-testid="trends-skeleton">
          <Skeleton radius="card" className="h-[380px]" />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Skeleton radius="card" className="h-[520px]" />
            <Skeleton radius="card" className="h-[520px]" />
          </div>
        </div>
      ) : cashflow.status === "error" && months.length === 0 ? (
        <Card>
          <EmptyState>Cash flow couldn&apos;t load. Try Refresh.</EmptyState>
        </Card>
      ) : firstData === null ? (
        <Card>
          <EmptyState>No transactions yet. Connect an account and refresh to sync.</EmptyState>
        </Card>
      ) : (
        <>
          <SavingsRateCard
            window={period.windowMonths}
            period={period.periodMonths}
            prior={prior}
            comparison={period.stepUnit ? period.comparisonShortLabel : null}
          />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <CategoryTrendsCard
              rows={rows}
              windowLabel={period.buttonLabel}
              comparisonShortLabel={period.comparisonShortLabel}
              partialLast={partialLast}
            />
            <YearToDateCard data={ytd} />
          </div>
        </>
      )}

      <NeedsCategoryCard refreshKey={refreshKey} onCategorized={onCategorized} />

      <RecurringChargesCard state={recurring} />
    </div>
  );
}
