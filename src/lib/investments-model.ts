// Pure model behind the Investments view: ranges, feed classification, the
// comparable stretch and its money-weighted summary, holdings grouping and
// the chart axis. No React or server imports; every function is unit tested
// in src/__tests__/investments-model.test.ts. Decisions are recorded in
// docs/plans/investments-redesign.md (Decision Log).

import {
  ALL_RANGE_DAYS,
  monthAxisLabel,
  monthKeyOf,
  monthShortLabel,
  monthTicks,
} from "@/lib/analytics-model";
import type { AllocationSlice, PortfolioSeriesPoint } from "@/lib/investment-performance";

const DAY = 86_400_000;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------------------------------------------------------------------------
// The API response the view consumes (the route re-exports this type).

export type ActivityKind =
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "deposit"
  | "withdrawal"
  | "reinvestment"
  | "split"
  | "other";

export interface InvestmentAccount {
  accountId: string;
  name: string;
  mask: string | null;
  institutionName: string;
  subtype: string | null;
  /** accounts.current_balance, the live figure. */
  balance: string;
  /** Window snapshots plus today's live point. */
  points: Array<{ date: string; value: string }>;
  netGain: {
    mode: "lifetime" | "anchored" | "none";
    startDate: string | null;
    netContributions: string;
    gain: string | null;
    gainPct: string | null;
  };
}

export interface InvestmentPosition {
  accountId: string;
  accountName: string;
  securityId: string;
  tickerSymbol: string | null;
  name: string;
  securityType: string | null;
  isCashEquivalent: boolean | null;
  quantity: string;
  price: string;
  value: string;
  costBasis: string | null;
  /** Price in the earliest holding snapshot on or after the window start; null without one. */
  startPrice: string | null;
  startDate: string | null;
}

export interface InvestmentActivity {
  id: number;
  date: string;
  accountId: string;
  kind: ActivityKind;
  name: string;
  /** Signed for the reader: a buy is negative, a sale, dividend or deposit positive. */
  amount: string;
  quantity: string | null;
  price: string | null;
  securityId: string | null;
}

export interface InvestmentsResponse {
  today: string;
  since: string;
  portfolio: {
    points: PortfolioSeriesPoint[];
    boundaries: Array<{ date: string }>;
    liveAppended: boolean;
  };
  accounts: InvestmentAccount[];
  flows: Array<{ date: string; accountId: string; kind: "deposit" | "withdrawal"; amount: string }>;
  income: Array<{ date: string; accountId: string; kind: "dividend" | "interest"; amount: string }>;
  incomeTrailingTwelveMonths: Array<{ accountId: string; amount: string }>;
  positions: InvestmentPosition[];
  activity: InvestmentActivity[];
  activityTotal: number;
}

// ---------------------------------------------------------------------------
// Ranges

export type InvestmentRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

export const INVESTMENT_RANGES: ReadonlyArray<{
  id: InvestmentRange;
  label: string;
  longLabel: string;
  months: number | null;
}> = [
  { id: "1M", label: "1M", longLabel: "Past month", months: 1 },
  { id: "3M", label: "3M", longLabel: "Past 3 months", months: 3 },
  { id: "6M", label: "6M", longLabel: "Past 6 months", months: 6 },
  { id: "YTD", label: "YTD", longLabel: "Year to date", months: null },
  { id: "1Y", label: "1Y", longLabel: "Past year", months: 12 },
  { id: "ALL", label: "All", longLabel: "All history", months: null },
];

/**
 * Whole days from the range's first day to today: the first of this month for
 * 1M, the first of the month two months back for 3M, and so on (the same rule
 * as the dashboard's netWorthDaysForRange); January 1 for YTD; ten years for All.
 */
export function investmentDaysForRange(range: InvestmentRange, today: string): number {
  if (range === "ALL") return ALL_RANGE_DAYS;
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const day = Number(today.slice(8, 10));
  const end = Date.UTC(year, monthIndex, day);
  const months = INVESTMENT_RANGES.find((r) => r.id === range)?.months ?? 3;
  const start = range === "YTD" ? Date.UTC(year, 0, 1) : Date.UTC(year, monthIndex - (months - 1), 1);
  return Math.round((end - start) / DAY);
}

export type Scope = "all" | string;

// ---------------------------------------------------------------------------
// Feed classification (subtype only: Plaid's type field drifts across institutions)

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  reinvestment: "Reinvestment",
  split: "Split",
  other: "Other",
};

const EXTERNAL_FLOW_SUBTYPES = new Set(["transfer", "deposit", "withdrawal", "contribution", "distribution"]);
const DIVIDEND_SUBTYPES = new Set(["dividend", "qualified dividend", "non-qualified dividend"]);

function toCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Plaid feed sign convention: positive = cash left the account, so a deposit is negative. */
export function classifyFeedRow(row: { type: string; subtype: string | null; amount: string }): ActivityKind {
  const subtype = (row.subtype ?? "").toLowerCase();
  if (subtype === "buy") return "buy";
  if (subtype === "sell") return "sell";
  if (DIVIDEND_SUBTYPES.has(subtype)) return "dividend";
  if (subtype === "dividend reinvestment") return "reinvestment";
  if (subtype === "interest") return "interest";
  if (subtype === "split") return "split";
  if (EXTERNAL_FLOW_SUBTYPES.has(subtype)) {
    const cents = toCents(row.amount);
    if (cents < 0) return "deposit";
    if (cents > 0) return "withdrawal";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Series, stretches and the money-weighted summary

export interface SeriesPoint {
  date: string;
  value: number;
  segment: number;
}

/** The aggregate for All (segments from coverage changes), or one account's points as a single segment. */
export function scopedSeries(response: InvestmentsResponse, scope: Scope): SeriesPoint[] {
  if (scope === "all") {
    return response.portfolio.points.map((p) => ({ date: p.date, value: Number.parseFloat(p.value), segment: p.segment }));
  }
  const account = response.accounts.find((a) => a.accountId === scope);
  if (!account) return [];
  return account.points.map((p) => ({ date: p.date, value: Number.parseFloat(p.value), segment: 0 }));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export interface Stretch {
  fromDate: string;
  toDate: string;
  startValue: number;
  endValue: number;
  amount: number;
  /** Null when the stretch starts from zero. */
  pct: number | null;
  spansWholeRange: boolean;
  days: number;
}

/**
 * The trailing run of points that share the last point's segment: the latest
 * stretch over which values are comparable (no change in the set of covered
 * accounts). Null with fewer than two comparable points.
 */
export function latestStretch(points: SeriesPoint[]): Stretch | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  let start = points.length - 1;
  while (start > 0 && points[start - 1].segment === last.segment) start--;
  const run = points.slice(start);
  if (run.length < 2) return null;
  const startValue = run[0].value;
  const amount = round2(last.value - startValue);
  return {
    fromDate: run[0].date,
    toDate: last.date,
    startValue,
    endValue: last.value,
    amount,
    pct: startValue !== 0 ? (amount / Math.abs(startValue)) * 100 : null,
    spansWholeRange: start === 0,
    days: daysBetween(run[0].date, last.date),
  };
}

export interface FlowEvent {
  date: string;
  accountId: string;
  kind: "deposit" | "withdrawal";
  /** Positive magnitude in dollars. */
  amount: number;
}

export interface StretchSummary {
  contributions: number;
  withdrawals: number;
  netContributions: number;
  marketGain: number;
  /** Modified-Dietz money-weighted return for the stretch, in percent; null when not measurable. */
  dietzReturnPct: number | null;
  depositCount: number;
  withdrawalCount: number;
}

/**
 * Flows strictly after the start date through the end date (the start point
 * already contains that day's money). Market gain is the residual after
 * net contributions; the return weights each flow by the fraction of the
 * stretch remaining after it (modified Dietz).
 */
export function summarizeStretch(stretch: Stretch, flows: FlowEvent[]): StretchSummary {
  let contributions = 0;
  let withdrawals = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  let weighted = 0;
  for (const flow of flows) {
    if (flow.date <= stretch.fromDate || flow.date > stretch.toDate) continue;
    const weight = stretch.days > 0 ? daysBetween(flow.date, stretch.toDate) / stretch.days : 0;
    if (flow.kind === "deposit") {
      contributions += flow.amount;
      depositCount += 1;
      weighted += flow.amount * weight;
    } else {
      withdrawals += flow.amount;
      withdrawalCount += 1;
      weighted -= flow.amount * weight;
    }
  }
  const netContributions = round2(contributions - withdrawals);
  const marketGain = round2(stretch.amount - netContributions);
  const denominator = stretch.startValue + weighted;
  const dietzReturnPct = stretch.days > 0 && denominator > 0 ? (marketGain / denominator) * 100 : null;
  return {
    contributions: round2(contributions),
    withdrawals: round2(withdrawals),
    netContributions,
    marketGain,
    dietzReturnPct,
    depositCount,
    withdrawalCount,
  };
}

// ---------------------------------------------------------------------------
// Holdings

export interface HoldingGroup {
  /** "cash", "t:<ticker>" or "s:<security id>". */
  key: string;
  securityIds: string[];
  ticker: string | null;
  name: string;
  securityType: string | null;
  isCash: boolean;
  /** Shares, or contracts for an option (holdings store contracts × 100). */
  quantity: number;
  contracts: boolean;
  price: number;
  value: number;
  /** Null when any member lacks a cost basis, and always for cash. */
  cost: number | null;
  accountIds: string[];
  startPrice: number | null;
  changePct: number | null;
}

function isCashPosition(position: Pick<InvestmentPosition, "isCashEquivalent" | "securityType">): boolean {
  return position.isCashEquivalent === true || position.securityType === "cash";
}

/** One row per security across the scoped accounts, sorted by value with cash pinned last. */
export function groupPositions(positions: InvestmentPosition[], scope: Scope): HoldingGroup[] {
  const groups = new Map<string, HoldingGroup>();
  for (const position of positions) {
    if (scope !== "all" && position.accountId !== scope) continue;
    const isCash = isCashPosition(position);
    const key = isCash ? "cash" : position.tickerSymbol ? `t:${position.tickerSymbol}` : `s:${position.securityId}`;
    const contracts = !isCash && position.securityType === "derivative";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        securityIds: [],
        ticker: isCash ? null : position.tickerSymbol,
        name: isCash ? "Money market sweep" : position.name,
        securityType: isCash ? "cash" : position.securityType,
        isCash,
        quantity: 0,
        contracts,
        price: isCash ? 0 : Number.parseFloat(position.price),
        value: 0,
        cost: isCash ? null : 0,
        accountIds: [],
        startPrice: null,
        changePct: null,
      };
      groups.set(key, group);
    }
    if (!isCash) {
      group.quantity += Number.parseFloat(position.quantity) / (contracts ? 100 : 1);
      if (group.cost !== null) {
        group.cost = position.costBasis === null ? null : group.cost + Number.parseFloat(position.costBasis);
      }
      if (group.startPrice === null && position.startPrice !== null) {
        group.startPrice = Number.parseFloat(position.startPrice);
      }
    }
    group.value += Number.parseFloat(position.value);
    if (!group.accountIds.includes(position.accountId)) group.accountIds.push(position.accountId);
    if (!group.securityIds.includes(position.securityId)) group.securityIds.push(position.securityId);
  }
  const rows = [...groups.values()].map((group) => ({
    ...group,
    quantity: Math.round(group.quantity * 1e8) / 1e8,
    value: round2(group.value),
    cost: group.cost === null ? null : round2(group.cost),
    changePct: !group.isCash && group.startPrice ? (group.price / group.startPrice - 1) * 100 : null,
  }));
  return rows.sort((a, b) => Number(a.isCash) - Number(b.isCash) || b.value - a.value);
}

export type HoldingsFilter = "all" | "equity" | "etf" | "derivative" | "cash";

export const HOLDINGS_FILTERS: ReadonlyArray<{ id: HoldingsFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "equity", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "derivative", label: "Options" },
  { id: "cash", label: "Cash" },
];

export function filterGroups(groups: HoldingGroup[], filter: HoldingsFilter, query: string): HoldingGroup[] {
  const needle = query.trim().toLowerCase();
  return groups.filter((group) => {
    if (filter === "cash" && !group.isCash) return false;
    if (filter !== "all" && filter !== "cash" && (group.isCash || group.securityType !== filter)) return false;
    if (!needle) return true;
    return (group.ticker ?? "").toLowerCase().includes(needle) || group.name.toLowerCase().includes(needle);
  });
}

/** OCC option symbol: underlying, YYMMDD expiry, C or P, strike × 1000 in eight digits. */
export function parseOccSymbol(
  symbol: string
): { underlying: string; expiry: string; kind: "call" | "put"; strike: number } | null {
  const match = /^([A-Z.]{1,6})(\d{6})([CP])(\d{8})$/.exec(symbol);
  if (!match) return null;
  const [, underlying, date, kind, strike] = match;
  return {
    underlying,
    expiry: `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`,
    kind: kind === "C" ? "call" : "put",
    strike: Number.parseInt(strike, 10) / 1000,
  };
}

/** "Dec 18, 2026" */
export function formatLongDate(date: string): string {
  return `${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}

/** "Dec 18" */
export function formatShortDate(date: string): string {
  return `${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

const longDate = formatLongDate;

/** "AAPL $260 call" with "Expires Dec 18, 2026" for a parseable option; otherwise the ticker (or name) and the name. */
export function formatSecurityLabel(
  ticker: string | null,
  name: string,
  securityType: string | null
): { label: string; detail: string } {
  if (securityType === "derivative" && ticker) {
    const option = parseOccSymbol(ticker);
    if (option) {
      return {
        label: `${option.underlying} $${option.strike} ${option.kind}`,
        detail: `Expires ${longDate(option.expiry)}`,
      };
    }
  }
  return { label: ticker ?? name, detail: name };
}

// ---------------------------------------------------------------------------
// Chart axis

/** Weekly "Sep 8" ticks for spans of 45 days or fewer, otherwise the shared first-of-month ticks. */
export function investmentAxisTicks(
  minTs: number,
  maxTs: number
): { ticks: number[]; label: (ts: number) => string; start: number } {
  const dayLabel = (ts: number) => {
    const d = new Date(ts);
    return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
  const spanDays = (maxTs - minTs) / DAY;
  const months = spanDays > 45 ? monthTicks(minTs, maxTs) : null;
  if (!months) {
    const ticks: number[] = [];
    for (let t = minTs; t <= maxTs; t += 7 * DAY) ticks.push(t);
    return { ticks, label: dayLabel, start: minTs };
  }
  return {
    ticks: months.ticks,
    label: (ts) => (months.dense ? monthAxisLabel(monthKeyOf(ts)) : monthShortLabel(monthKeyOf(ts))),
    start: months.start,
  };
}

// ---------------------------------------------------------------------------
// Allocation

/** Colors follow the security type in the fixed categorical order, never the rank. */
export const ALLOCATION_TYPES: ReadonlyArray<{ type: string; label: string; color: string }> = [
  { type: "etf", label: "ETFs", color: "var(--chart-cat-1)" },
  { type: "equity", label: "Single stocks", color: "var(--chart-cat-2)" },
  { type: "derivative", label: "Options", color: "var(--chart-cat-3)" },
  { type: "mutual fund", label: "Mutual funds", color: "var(--chart-cat-4)" },
  { type: "fixed income", label: "Bonds", color: "var(--chart-cat-5)" },
  { type: "other", label: "Other", color: "var(--chart-cat-6)" },
  { type: "cash", label: "Cash", color: "var(--chart-cat-other)" },
];

export interface AllocationRow {
  type: string;
  label: string;
  color: string;
  value: number;
  share: number;
  count: number;
}

/** Slices from computeAllocation mapped onto labels and colors, unknown types folded into Other. */
export function allocationRows(slices: AllocationSlice[]): AllocationRow[] {
  const byType = new Map<string, AllocationRow>();
  for (const slice of slices) {
    const known = ALLOCATION_TYPES.find((t) => t.type === slice.type) ?? ALLOCATION_TYPES.find((t) => t.type === "other")!;
    const row = byType.get(known.type) ?? { type: known.type, label: known.label, color: known.color, value: 0, share: 0, count: 0 };
    row.value = round2(row.value + Number.parseFloat(slice.value));
    row.share = Math.round((row.share + Number.parseFloat(slice.share)) * 10) / 10;
    row.count += slice.count;
    byType.set(known.type, row);
  }
  return ALLOCATION_TYPES.filter((t) => byType.has(t.type)).map((t) => byType.get(t.type)!);
}
