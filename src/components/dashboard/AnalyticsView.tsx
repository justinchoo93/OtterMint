"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Chip, EmptyState, SegmentedControl, Skeleton } from "@/components/ui";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { CategoryList } from "@/components/dashboard/CategoryList";
import { NetWorthOverview } from "@/components/dashboard/NetWorthOverview";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  ANALYTICS_RANGES,
  CASHFLOW_FETCH_MONTHS,
  firstDataMonthIndex,
  netWorthDaysForRange,
  periodDelta,
  rankCategories,
  resolvePeriod,
  sparklineSeries,
  spanLabel,
  sumPeriod,
  todayUtc,
  type AnalyticsRange,
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

const RANGE_OPTIONS = ANALYTICS_RANGES.map((r) => ({ value: r.id, label: r.label }));

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
  const [range, setRange] = useState<AnalyticsRange>("6M");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
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
  const period = useMemo(
    () => resolvePeriod(months, { range, month: selectedMonth }),
    [months, range, selectedMonth]
  );
  const firstData = firstDataMonthIndex(months);

  const changeRange = (next: AnalyticsRange) => {
    setRange(next);
    setSelectedMonth(null);
    setDetail(null);
  };

  const caption = isHousehold ? null : (period.comparisonLabel ?? period.historyStartsLabel);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl
          ariaLabel="Time range"
          options={RANGE_OPTIONS}
          value={range}
          onChange={changeRange}
          fullWidth
          className="sm:inline-flex sm:w-auto"
        />
        {(selectedMonth || caption) && (
          <div className="flex flex-wrap items-center gap-3">
            {selectedMonth && !isHousehold && (
              <Chip label={period.periodLabel} dismissLabel="Clear month" onDismiss={() => setSelectedMonth(null)} />
            )}
            {caption && <span className="text-caption text-ink-muted">{caption}</span>}
          </div>
        )}
      </div>

      <NetWorthOverview
        accounts={accounts}
        manualAccounts={manualAccounts}
        days={netWorthDaysForRange(range, todayUtc())}
        groupId={groupId}
        refreshKey={refreshKey}
      />

      {isHousehold ? (
        <EmptyState>Household spending analytics are not available yet.</EmptyState>
      ) : cashflow.status === "loading" && months.length === 0 ? (
        <div className="flex flex-col gap-6" data-testid="cashflow-skeleton">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {TILES.map((tile) => (
              <Skeleton key={tile.kind} className="h-[124px] rounded-tile" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-card" />
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
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          detail={detail}
          onDetailChange={setDetail}
        />
      )}
    </div>
  );
}

interface CashflowSectionsProps {
  months: CashflowMonth[];
  period: ReturnType<typeof resolvePeriod>;
  firstData: number;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  detail: AnalyticsDetail;
  onDetailChange: (detail: AnalyticsDetail) => void;
}

function CashflowSections({
  months,
  period,
  firstData,
  selectedMonth,
  onSelectMonth,
  detail,
  onDetailChange,
}: CashflowSectionsProps) {
  const totals = sumPeriod(period.periodMonths);
  const prior = period.priorMonths ? sumPeriod(period.priorMonths) : null;
  const rows = rankCategories(period.periodMonths, period.priorMonths);
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
            onClick={() => onDetailChange(detail?.kind === tile.kind ? null : { kind: tile.kind })}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CashflowChart
          months={period.windowMonths}
          windowLabel={spanLabel(period.windowMonths)}
          selectedMonth={selectedMonth}
          onSelectMonth={onSelectMonth}
        />
        <CategoryList
          rows={rows}
          periodLabel={period.periodLabel}
          selectedKey={detail?.kind === "category" ? detail.key : null}
          onSelect={(key) => onDetailChange(key ? { kind: "category", key } : null)}
        />
      </div>
    </>
  );
}
