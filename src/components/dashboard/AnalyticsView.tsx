"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { AnalyticsDetails } from "@/components/dashboard/AnalyticsDetails";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { CategoryList } from "@/components/dashboard/CategoryList";
import { NetWorthOverview } from "@/components/dashboard/NetWorthOverview";
import { PeriodBar } from "@/components/dashboard/PeriodBar";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  addMonths,
  CASHFLOW_FETCH_MONTHS,
  firstDataMonthIndex,
  likeForLikePrior,
  monthShortLabel,
  netWorthWindow,
  normalizePeriod,
  periodDelta,
  rankCategories,
  resolvePeriod,
  sparklineSeries,
  spanLabel,
  sumPeriod,
  todayUtc,
  type Period,
  type PeriodTotals,
} from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";
import { formatWholeCurrency } from "@/lib/format";
import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

export type AnalyticsDetail =
  | { kind: "income" | "spending" | "saved" | "net" }
  | { kind: "category"; key: string }
  | null;

interface AnalyticsViewProps {
  accounts: AccountWithInstitution[];
  manualAccounts: ManualAccountRow[];
  /** Set for the household view, which has net worth only. */
  groupId?: string;
  refreshKey?: number;
}

type CashflowState =
  | { status: "loading"; months: CashflowMonth[] }
  | { status: "ready"; months: CashflowMonth[] }
  | { status: "error"; months: CashflowMonth[] };

const TILES: Array<{
  kind: "income" | "spending" | "saved" | "net";
  label: string;
  key: keyof PeriodTotals;
  upIsGood: boolean;
}> = [
  { kind: "income", label: "Income", key: "income", upIsGood: true },
  { kind: "spending", label: "Spending", key: "spending", upIsGood: false },
  { kind: "saved", label: "Saved", key: "savings", upIsGood: true },
  { kind: "net", label: "Net cash flow", key: "netCashFlow", upIsGood: true },
];

export function AnalyticsView({ accounts, manualAccounts, groupId, refreshKey }: AnalyticsViewProps) {
  const [selection, setSelection] = useState<Period>({ kind: "preset", id: "6M" });
  const [detail, setDetail] = useState<AnalyticsDetail>(null);
  const [cashflow, setCashflow] = useState<CashflowState>({ status: "loading", months: [] });
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

  const months = cashflow.months;
  const today = todayUtc();
  const period = useMemo(() => resolvePeriod(months, selection, today), [months, selection, today]);
  const firstData = firstDataMonthIndex(months);
  const currentMonth = today.slice(0, 7);
  // The household view has no cash flow list to bound the picker with.
  const firstMonth =
    firstData !== null
      ? months[firstData].month
      : isHousehold
        ? addMonths(currentMonth, -(CASHFLOW_FETCH_MONTHS - 1))
        : currentMonth;
  const netWorth = netWorthWindow(period, today);

  const changePeriod = (next: Period) => {
    setSelection(next);
    setDetail(null);
  };

  const caption = isHousehold ? null : (period.comparisonLabel ?? period.historyStartsLabel);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <PeriodBar
        period={selection}
        onChange={changePeriod}
        bounds={{ firstMonth, lastMonth: currentMonth }}
        today={today}
        label={period.buttonLabel}
        caption={caption && <span>{caption}</span>}
      />

      <NetWorthOverview
        key={groupId ?? "personal"}
        accounts={accounts}
        manualAccounts={manualAccounts}
        days={netWorth.days}
        startDate={netWorth.startDate}
        endDate={netWorth.endDate}
        endLabel={`${monthShortLabel(period.endDate)} ${period.endDate.slice(0, 4)}`}
        groupId={groupId}
        refreshKey={refreshKey}
      />

      {isHousehold ? (
        <EmptyState>Household spending analytics are not available yet.</EmptyState>
      ) : cashflow.status === "loading" && months.length === 0 ? (
        <div className="flex flex-col gap-6" data-testid="cashflow-skeleton">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {TILES.map((tile) => (
              <Skeleton key={tile.kind} radius="tile" className="h-[124px]" />
            ))}
          </div>
          <Skeleton radius="card" className="h-[420px]" />
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
        <CashflowSections
          months={months}
          period={period}
          firstData={firstData}
          // A column click keeps an open details panel, as selecting a month always has.
          onSelectMonth={(month) => setSelection(normalizePeriod({ kind: "month", month }, today))}
          detail={detail}
          onDetailChange={setDetail}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}

interface CashflowSectionsProps {
  months: CashflowMonth[];
  period: ReturnType<typeof resolvePeriod>;
  firstData: number;
  onSelectMonth: (month: string) => void;
  detail: AnalyticsDetail;
  onDetailChange: (detail: AnalyticsDetail) => void;
  refreshKey?: number;
}

function focusFirst(selector: string) {
  (document.querySelector(selector) as HTMLElement | null)?.focus();
}

function CashflowSections({
  months,
  period,
  firstData,
  onSelectMonth,
  detail,
  onDetailChange,
  refreshKey,
}: CashflowSectionsProps) {
  const totals = sumPeriod(period.periodMonths);
  // Like for like: a period ending in the current month compares with the same days of the prior one.
  const priorMonths = likeForLikePrior(period);
  const prior = priorMonths ? sumPeriod(priorMonths) : null;
  const rows = rankCategories(period.periodMonths, priorMonths);
  const kept = totals.income > 0 ? `${Math.round((totals.netCashFlow / totals.income) * 100)}% kept` : undefined;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {TILES.map((tile) => (
          <StatTile
            key={tile.kind}
            label={tile.label}
            value={formatWholeCurrency(totals[tile.key])}
            delta={prior ? periodDelta(totals[tile.key], prior[tile.key], tile.upIsGood) : null}
            comparisonShortLabel={period.comparisonShortLabel}
            extra={tile.kind === "net" ? kept : undefined}
            spark={sparklineSeries(months, tile.key, firstData)}
            pressed={detail?.kind === tile.kind}
            tileId={tile.kind}
            onClick={() => onDetailChange(detail?.kind === tile.kind ? null : { kind: tile.kind })}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CashflowChart
          months={period.windowMonths}
          windowLabel={spanLabel(period.windowMonths)}
          highlighted={period.highlightPeriod ? period.periodMonths.map((m) => m.month) : []}
          onSelectMonth={onSelectMonth}
        />
        <CategoryList
          rows={rows}
          periodLabel={period.periodLabel}
          selectedKey={detail?.kind === "category" ? detail.key : null}
          onSelect={(key) => onDetailChange(key ? { kind: "category", key } : null)}
        />
      </div>

      <AnalyticsDetails
        detail={detail}
        periodMonths={period.periodMonths}
        priorMonths={priorMonths}
        periodLabel={period.periodLabel}
        comparisonLabel={period.comparisonLabel}
        rows={rows}
        refreshKey={refreshKey}
        onClose={() => {
          // Return focus to the tile or row that opened the panel before it unmounts.
          if (detail?.kind === "category") focusFirst(`[data-category-key="${detail.key}"]`);
          else if (detail) focusFirst(`[data-tile="${detail.kind}"]`);
          onDetailChange(null);
        }}
      />
    </>
  );
}
