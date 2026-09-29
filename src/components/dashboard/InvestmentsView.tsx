"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { AccountTiles, type AccountTileData } from "@/components/dashboard/AccountTiles";
import { ActivityCard } from "@/components/dashboard/ActivityCard";
import { AllocationCard } from "@/components/dashboard/AllocationCard";
import { HoldingsTable } from "@/components/dashboard/HoldingsTable";
import { InvestmentHero } from "@/components/dashboard/InvestmentHero";
import { InvestmentSummaryTiles, type SummaryTileData } from "@/components/dashboard/InvestmentSummaryTiles";
import { sinceLabel, todayUtc } from "@/lib/analytics-model";
import { computeAllocation, computeUnrealized, type HoldingRowInput } from "@/lib/investment-performance";
import { formatCurrency, formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";
import {
  INVESTMENT_RANGES,
  allocationRows,
  filterGroups,
  formatShortDate,
  groupPositions,
  investmentDaysForRange,
  latestStretch,
  scopedSeries,
  summarizeStretch,
  type FlowEvent,
  type HoldingsFilter,
  type InvestmentRange,
  type InvestmentsResponse,
  type Scope,
  type SeriesPoint,
} from "@/lib/investments-model";

interface InvestmentsViewProps {
  refreshKey?: number;
}

type LoadState =
  | { status: "loading"; data: InvestmentsResponse | null }
  | { status: "ready"; data: InvestmentsResponse }
  | { status: "error"; data: InvestmentsResponse | null };

const DAY = 86_400_000;

function toNumber(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function signedDelta(amount: number, text: string) {
  return {
    direction: amount > 0 ? ("up" as const) : amount < 0 ? ("down" as const) : ("flat" as const),
    tone: amount > 0 ? ("positive" as const) : amount < 0 ? ("negative" as const) : ("neutral" as const),
    text,
  };
}

export function accountLabelOf(data: InvestmentsResponse): (accountId: string) => string {
  return (accountId) => {
    const account = data.accounts.find((a) => a.accountId === accountId);
    if (!account) return accountId;
    return account.mask ? `${account.institutionName} ····${account.mask}` : account.institutionName;
  };
}

/** Everything the page shows for one scope, derived from one response. */
export function deriveScope(data: InvestmentsResponse, scope: Scope, filter: HoldingsFilter, query: string) {
  const account = scope === "all" ? null : (data.accounts.find((a) => a.accountId === scope) ?? null);
  const inScope = (accountId: string) => scope === "all" || accountId === scope;
  const series = scopedSeries(data, scope);
  const stretch = latestStretch(series);
  const flows: FlowEvent[] = data.flows
    .filter((f) => inScope(f.accountId))
    .map((f) => ({ date: f.date, accountId: f.accountId, kind: f.kind, amount: toNumber(f.amount) }));
  const summary = stretch ? summarizeStretch(stretch, flows) : null;
  const incomeWindow = data.income.filter((i) => inScope(i.accountId)).reduce((t, i) => t + toNumber(i.amount), 0);
  const incomeTrailing = data.incomeTrailingTwelveMonths
    .filter((i) => inScope(i.accountId))
    .reduce((t, i) => t + toNumber(i.amount), 0);
  const scopedPositions = data.positions.filter((p) => inScope(p.accountId));
  const holdingRows: HoldingRowInput[] = scopedPositions.map((p) => ({
    accountId: p.accountId,
    accountName: p.accountName,
    securityId: p.securityId,
    tickerSymbol: p.tickerSymbol,
    name: p.name,
    value: p.value,
    costBasis: p.costBasis,
    // A money-market fund flagged as a cash equivalent is cash for allocation.
    securityType: p.isCashEquivalent ? "cash" : p.securityType,
    isCashEquivalent: p.isCashEquivalent,
  }));
  const unrealized = computeUnrealized(holdingRows);
  const groups = groupPositions(data.positions, scope);
  // Legend counts are distinct securities (AAPL held twice is one stock), not position rows.
  const allocation = allocationRows(computeAllocation(holdingRows)).map((row) => ({
    ...row,
    count: groups.filter((g) => (g.isCash ? "cash" : (g.securityType ?? "other")) === row.type).length || row.count,
  }));
  const visibleGroups = filterGroups(groups, filter, query);
  const totalValue = groups.reduce((t, g) => t + g.value, 0);
  const activity = data.activity.filter((e) => inScope(e.accountId));
  const liveValue = account ? toNumber(account.balance) : data.accounts.reduce((t, a) => t + toNumber(a.balance), 0);

  // The window was clipped when history starts well after the requested start.
  const firstPoint = series[0];
  const clipped = firstPoint !== undefined && Date.parse(firstPoint.date) - Date.parse(data.since) > 7 * DAY;
  let caption = "";
  if (stretch) {
    caption = sinceLabel(stretch.fromDate, data.today);
    if (account && account.netGain.mode === "lifetime" && account.netGain.startDate !== null && account.netGain.startDate >= data.since) {
      caption += " · account opened";
    } else if (clipped && stretch.spansWholeRange) {
      caption += " · earliest history";
    }
  }
  const firstTrusted = scope === "all" ? (data.portfolio.points.find((p) => p.quality === "known")?.date ?? null) : null;
  const legacyBefore = scope === "all" && data.portfolio.points.some((p) => p.quality === "legacy") ? firstTrusted : null;

  return {
    account,
    label: account ? `${account.institutionName} ${account.name}${account.mask ? ` ····${account.mask}` : ""}` : "Portfolio value",
    liveValue,
    series,
    stretch,
    summary,
    flows,
    incomeWindow,
    incomeTrailing,
    unrealized,
    allocation,
    groups,
    visibleGroups,
    totalValue,
    activity,
    caption,
    firstTrustedDate: legacyBefore,
    boundaries: scope === "all" ? data.portfolio.boundaries.map((b) => b.date).filter((d) => d > data.since) : [],
  };
}

/** One tile per account plus All, each with its value, change over the window and net-gain sentence. */
export function accountTiles(data: InvestmentsResponse): AccountTileData[] {
  const lifetimeCount = data.accounts.filter((a) => a.netGain.mode === "lifetime").length;
  const all: AccountTileData = {
    id: "all",
    institution: "",
    title: "All accounts",
    mask: null,
    value: data.accounts.reduce((t, a) => t + toNumber(a.balance), 0),
    change: latestStretch(scopedSeries(data, "all")),
    note: `${plural(data.accounts.length, "account")} · ${lifetimeCount} with lifetime history`,
  };
  const perAccount = data.accounts.map((account): AccountTileData => {
    const gain = account.netGain;
    let note: string;
    if (gain.mode === "lifetime" && gain.gain !== null) {
      note = `${formatSignedWholeCurrency(gain.gain)} lifetime on ${formatWholeCurrency(gain.netContributions)} in`;
    } else if (gain.mode === "anchored" && gain.gain !== null && gain.startDate !== null) {
      note = `${formatSignedWholeCurrency(gain.gain)} since ${formatShortDate(gain.startDate)} · earlier history not visible`;
    } else {
      note = "net gain not measurable yet";
    }
    return {
      id: account.accountId,
      institution: account.institutionName,
      title: account.name,
      mask: account.mask,
      value: toNumber(account.balance),
      change: latestStretch(scopedSeries(data, account.accountId)),
      note,
    };
  });
  return [all, ...perAccount];
}

type ScopeModel = ReturnType<typeof deriveScope>;

/** Market gain, net contributions, income and unrealized gain for the scope. */
export function summaryTiles(model: ScopeModel): SummaryTileData[] {
  const summary = model.summary;
  const dietz = summary?.dietzReturnPct ?? null;
  const unrealizedGain = toNumber(model.unrealized.total.gain);
  const unrealizedCost = toNumber(model.unrealized.total.cost);
  const excluded = toNumber(model.unrealized.total.excludedValue);
  const invested = model.groups.some((g) => !g.isCash);
  return [
    {
      label: "Market gain",
      value: summary ? formatSignedWholeCurrency(summary.marketGain) : "—",
      delta: dietz !== null ? signedDelta(dietz, `${formatSignedPercent(dietz)} return`) : undefined,
      note: dietz !== null ? "money-weighted, this range" : "needs two days of history",
    },
    {
      label: "Net contributions",
      value: formatSignedWholeCurrency(summary?.netContributions ?? 0),
      note: `${plural(summary?.depositCount ?? 0, "deposit")} · ${plural(summary?.withdrawalCount ?? 0, "withdrawal")}`,
    },
    {
      label: "Dividends & interest",
      value: formatCurrency(model.incomeWindow),
      note: `${formatWholeCurrency(model.incomeTrailing)} trailing 12 months`,
    },
    {
      label: "Unrealized gain",
      value: formatSignedWholeCurrency(unrealizedGain),
      delta:
        unrealizedCost > 0
          ? signedDelta(unrealizedGain, `${formatSignedPercent((unrealizedGain / unrealizedCost) * 100)} vs cost`)
          : undefined,
      note:
        excluded > 0
          ? `${formatWholeCurrency(excluded)} without cost basis excluded`
          : unrealizedCost > 0
            ? ""
            : invested
              ? "no cost basis available"
              : "all cash, nothing invested",
    },
  ];
}

export function InvestmentsView({ refreshKey }: InvestmentsViewProps) {
  const [range, setRange] = useState<InvestmentRange>("3M");
  const [scope, setScope] = useState<Scope>("all");
  const [hovered, setHovered] = useState<SeriesPoint | null>(null);
  const [holdingsFilter, setHoldingsFilter] = useState<HoldingsFilter>("all");
  const [holdingsQuery, setHoldingsQuery] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "loading", data: null });
  const today = todayUtc();
  const days = investmentDaysForRange(range, today);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState((current) => ({ status: "loading", data: current.data }));
      try {
        const response = await fetch(`/api/analytics/investments?days=${days}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Investments request failed: ${response.status}`);
        setState({ status: "ready", data: (await response.json()) as InvestmentsResponse });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch investments:", error);
        setState((current) => ({ status: "error", data: current.data }));
      }
    };
    load();
    return () => controller.abort();
  }, [days, refreshKey]);

  const changeRange = (next: InvestmentRange) => {
    setRange(next);
    setHovered(null);
    setActivityExpanded(false);
  };
  const changeScope = useCallback((next: Scope) => {
    setScope(next);
    setHovered(null);
    setActivityExpanded(false);
  }, []);
  const onActivePoint = useCallback((point: SeriesPoint | null) => setHovered(point), []);

  const data = state.data;
  const model = useMemo(
    () => (data ? deriveScope(data, scope, holdingsFilter, holdingsQuery) : null),
    [data, scope, holdingsFilter, holdingsQuery]
  );
  const tiles = useMemo(() => (data ? accountTiles(data) : []), [data]);
  const summary = useMemo(() => (model ? summaryTiles(model) : []), [model]);

  // A scoped account that vanished from a later response falls back to All.
  useEffect(() => {
    if (data && scope !== "all" && !data.accounts.some((a) => a.accountId === scope)) changeScope("all");
  }, [data, scope, changeScope]);

  if (!data || !model) {
    if (state.status === "error") {
      return <EmptyState>Investments couldn&apos;t load. Try Refresh.</EmptyState>;
    }
    return (
      <div className="flex flex-col gap-6" data-testid="investments-skeleton">
        <Card padding="lg">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-10 w-56" />
          <Skeleton className="mt-6 h-[232px]" />
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} radius="tile" className="h-[124px]" />
          ))}
        </div>
      </div>
    );
  }

  if (data.accounts.length === 0) {
    return <EmptyState>Connect an investment account to see performance.</EmptyState>;
  }

  const accountLabel = accountLabelOf(data);
  const showAccount = scope === "all";
  const rangeInfo = INVESTMENT_RANGES.find((r) => r.id === range) ?? INVESTMENT_RANGES[1];
  const positionCount = model.groups.filter((g) => !g.isCash).length;
  const holdingsSubtitle = `${plural(positionCount, "position")} and cash${
    showAccount ? ` across ${plural(data.accounts.length, "account")}` : ` in ${accountLabel(scope)}`
  } · sorted by value`;
  const activityTotal = showAccount ? data.activityTotal : model.activity.length;
  const activitySubtitle = `${rangeInfo.longLabel} · ${plural(activityTotal, "event")}${
    showAccount ? " across all accounts" : " in this account"
  }`;
  const unrealizedGain = toNumber(model.unrealized.total.gain);
  const unrealizedCost = toNumber(model.unrealized.total.cost);

  return (
    <div
      className={`flex flex-col gap-6 animate-fade-in transition-opacity ${state.status === "loading" ? "opacity-60" : ""}`}
      aria-busy={state.status === "loading"}
    >
      <InvestmentHero
        label={model.label}
        value={model.liveValue}
        stretch={model.stretch}
        caption={model.caption}
        hovered={hovered}
        points={model.series}
        range={range}
        onRangeChange={changeRange}
        onActivePoint={onActivePoint}
        firstTrustedDate={model.firstTrustedDate}
        boundaries={model.boundaries}
      />
      <AccountTiles tiles={tiles} scope={scope} onScope={changeScope} />
      <InvestmentSummaryTiles tiles={summary} />
      <HoldingsTable
        groups={model.visibleGroups}
        totalValue={model.totalValue}
        subtitle={holdingsSubtitle}
        showAccount={showAccount}
        changeHeader={range === "ALL" ? "All-time change" : `${rangeInfo.label} change`}
        rangeLabel={rangeInfo.label}
        filter={holdingsFilter}
        onFilter={setHoldingsFilter}
        query={holdingsQuery}
        onQuery={setHoldingsQuery}
        totals={{ gain: unrealizedGain, gainPct: unrealizedCost > 0 ? (unrealizedGain / unrealizedCost) * 100 : null }}
        accountLabel={accountLabel}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start">
        <AllocationCard rows={model.allocation} total={model.totalValue} />
        <ActivityCard
          events={model.activity}
          total={activityTotal}
          subtitle={activitySubtitle}
          showAccount={showAccount}
          accountLabel={accountLabel}
          expanded={activityExpanded}
          onToggle={() => setActivityExpanded((v) => !v)}
        />
      </div>
      {state.status === "error" && (
        <p className="text-xs text-ink-muted">Couldn&apos;t refresh investments. Showing the last loaded range.</p>
      )}
    </div>
  );
}
