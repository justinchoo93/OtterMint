"use client";

import { useEffect, useState } from "react";
import { Card, DeltaIndicator, Skeleton } from "@/components/ui";
import { NetWorthChart, type ChartMode, type NetWorthHistory } from "@/components/dashboard/NetWorthChart";
import { comparableChange, normalizationContradictions, sinceLabel, todayUtc } from "@/lib/analytics-model";
import { formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";
import { computeNetWorthTotals } from "@/lib/net-worth-totals";
import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

interface NetWorthOverviewProps {
  accounts: AccountWithInstitution[];
  manualAccounts: ManualAccountRow[];
  /** Days of history to request (see netWorthDaysForRange). */
  days: number;
  /** Set for the household view. */
  groupId?: string;
  refreshKey?: number;
}

type LoadState =
  | { status: "loading"; history: NetWorthHistory | null }
  | { status: "ready"; history: NetWorthHistory }
  | { status: "error"; history: NetWorthHistory | null };

export function NetWorthOverview({
  accounts,
  manualAccounts,
  days,
  groupId,
  refreshKey,
}: NetWorthOverviewProps) {
  const [state, setState] = useState<LoadState>({ status: "loading", history: null });
  // null until the reader picks a mode; the default depends on the data.
  const [mode, setMode] = useState<ChartMode | null>(null);
  const url = groupId
    ? `/api/groups/${groupId}/net-worth?days=${days}`
    : `/api/net-worth?days=${days}`;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState((current) => ({ status: "loading", history: current.history }));
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        const data = (await response.json()) as Partial<NetWorthHistory>;
        setState({
          status: "ready",
          history: {
            snapshots: data.snapshots ?? [],
            coverageEvents: data.coverageEvents ?? [],
            periodChange: data.periodChange ?? null,
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch net worth history:", error);
        setState((current) => ({ status: "error", history: current.history }));
      }
    };
    load();
    return () => controller.abort();
  }, [url, refreshKey]);

  const totals = computeNetWorthTotals(accounts, manualAccounts);
  const history = state.history;
  const normalizedAvailable =
    !groupId &&
    (history?.snapshots.some(
      (point) => point.quality === "flat_normalized" && point.adjustedNetWorth !== null
    ) ??
      false);
  const contradictions = history && normalizedAvailable ? normalizationContradictions(history.snapshots) : [];
  const defaultMode: ChartMode = contradictions.length > 0 ? "reported" : "normalized";
  const activeMode: ChartMode = normalizedAvailable ? (mode ?? defaultMode) : "reported";
  const change = history ? comparableChange(history.snapshots, activeMode) : null;
  const liabilityShare = totals.assets > 0 ? Math.round((totals.liabilities / totals.assets) * 100) : null;
  const assetShare =
    totals.assets + totals.liabilities > 0
      ? (totals.assets / (totals.assets + totals.liabilities)) * 100
      : 100;

  return (
    <Card padding="lg" aria-label={groupId ? "Household net worth" : "Net worth"}>
      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="flex flex-col lg:col-start-1 lg:row-start-1">
          <span className="text-caption font-medium text-ink-secondary">
            {groupId ? "Household net worth" : "Net worth"}
          </span>
          <span className="mt-2 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.025em] text-ink sm:text-hero">
            {formatWholeCurrency(totals.netWorth)}
          </span>
          {change && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <DeltaIndicator
                size="md"
                direction={change.amount > 0 ? "up" : change.amount < 0 ? "down" : "flat"}
                tone={change.amount > 0 ? "positive" : change.amount < 0 ? "negative" : "neutral"}
              >
                {formatSignedWholeCurrency(change.amount)}
                {change.pct !== null ? ` (${formatSignedPercent(change.pct)})` : ""}
              </DeltaIndicator>
              <span className="text-ink-secondary">
                {sinceLabel(change.fromDate, todayUtc())}
                {change.estimated ? ", includes estimates" : ""}
              </span>
            </div>
          )}
        </div>

        <div
          className={`mt-6 min-w-0 transition-opacity lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 ${
            state.status === "loading" && history ? "opacity-60" : ""
          }`}
          aria-busy={state.status === "loading"}
        >
          {history ? (
            <NetWorthChart
              history={history}
              mode={activeMode}
              normalizedAvailable={normalizedAvailable}
              onModeChange={setMode}
              contradictedDates={contradictions}
              isHousehold={Boolean(groupId)}
            />
          ) : state.status === "error" ? (
            <p className="text-caption text-ink-muted">Net worth history couldn&apos;t load. Try Refresh.</p>
          ) : (
            <div className="flex flex-col gap-3" data-testid="net-worth-skeleton">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-[176px] sm:h-[232px]" />
            </div>
          )}
          {history && state.status === "error" && (
            <p className="mt-2 text-xs text-ink-muted">Couldn&apos;t refresh history. Showing the last loaded range.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5 border-t border-line-subtle pt-5 lg:col-start-1 lg:row-start-2 lg:mt-7">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink-secondary">
              <span aria-hidden className="h-2 w-2 rounded-[2px] bg-series-income" />
              Assets
            </span>
            <span className="font-semibold text-ink">{formatWholeCurrency(totals.assets)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink-secondary">
              <span aria-hidden className="h-2 w-2 rounded-[2px] bg-series-spending" />
              Liabilities
            </span>
            <span className="font-semibold text-ink">{formatWholeCurrency(totals.liabilities)}</span>
          </div>
          <div className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden>
            <span className="rounded-l-[3px] bg-series-income" style={{ width: `${assetShare}%` }} />
            <span className="flex-1 rounded-r-[3px] bg-series-spending" />
          </div>
          {liabilityShare !== null && (
            <p className="text-xs leading-relaxed text-ink-muted">Liabilities are {liabilityShare}% of assets.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
