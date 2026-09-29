// Pure model behind the Analytics view: time ranges, period resolution,
// comparisons, category ranking, cash-flow chart geometry and the net-worth
// change figure. No React or server imports; every function is unit tested in
// src/__tests__/analytics-model.test.ts. Decisions are recorded in
// docs/plans/analytics-redesign.md (Decision Log).

import { labelForCategoryKey, type CashflowMonth } from "@/lib/cashflow";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";

export type AnalyticsRange = "3M" | "6M" | "1Y" | "ALL";

export const ANALYTICS_RANGES: ReadonlyArray<{
  id: AnalyticsRange;
  label: string;
  months: number;
}> = [
  { id: "3M", label: "3M", months: 3 },
  { id: "6M", label: "6M", months: 6 },
  { id: "1Y", label: "1Y", months: 12 },
  { id: "ALL", label: "All", months: 24 },
];

/** Months of cash flow fetched once; ranges and comparisons slice from it. */
export const CASHFLOW_FETCH_MONTHS = 24;
/** Net-worth history requested for the All range (the routes' cap). */
export const ALL_RANGE_DAYS = 3650;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseMonthKey(key: string): { year: number; index: number } {
  return { year: Number(key.slice(0, 4)), index: Number(key.slice(5, 7)) - 1 };
}

/** "Aug" */
export function monthShortLabel(key: string): string {
  return SHORT_MONTHS[parseMonthKey(key).index];
}

/** "August 2026" */
export function monthLongLabel(key: string): string {
  const { year, index } = parseMonthKey(key);
  return `${LONG_MONTHS[index]} ${year}`;
}

/** "Oct ’24", for dense month axes. */
export function monthAxisLabel(key: string): string {
  const { year } = parseMonthKey(key);
  return `${monthShortLabel(key)} ’${String(year).slice(2)}`;
}

/** Today's date as the cash-flow route computes it (UTC), "YYYY-MM-DD". */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** Index of the first month with any income, spending or savings; null when none. */
export function firstDataMonthIndex(months: CashflowMonth[]): number | null {
  const index = months.findIndex(
    (m) => toCents(m.income) !== 0 || toCents(m.spending) !== 0 || toCents(m.savings) !== 0
  );
  return index === -1 ? null : index;
}

export interface PeriodSelection {
  range: AnalyticsRange;
  /** "YYYY-MM" of a selected month inside the range, or null. */
  month: string | null;
}

export interface ResolvedPeriod {
  /** Months drawn in the cash-flow chart (the range, clipped to data start). */
  windowMonths: CashflowMonth[];
  /** Months the tiles and categories summarize: the window or one selected month. */
  periodMonths: CashflowMonth[];
  /** Equal-length months immediately before the period, when real data covers them. */
  priorMonths: CashflowMonth[] | null;
  periodLabel: string;
  comparisonLabel: string | null;
  comparisonShortLabel: string | null;
  historyStartsLabel: string | null;
}

/** "Apr–Sep 2026", "Oct 2025–Sep 2026", or "August 2026" for one month. */
export function spanLabel(months: CashflowMonth[]): string {
  if (months.length === 0) return "";
  const first = parseMonthKey(months[0].month);
  const last = parseMonthKey(months[months.length - 1].month);
  if (months.length === 1) return monthLongLabel(months[0].month);
  return first.year === last.year
    ? `${SHORT_MONTHS[first.index]}–${SHORT_MONTHS[last.index]} ${last.year}`
    : `${SHORT_MONTHS[first.index]} ${first.year}–${SHORT_MONTHS[last.index]} ${last.year}`;
}

export function resolvePeriod(months: CashflowMonth[], selection: PeriodSelection): ResolvedPeriod {
  const rangeMonths = ANALYTICS_RANGES.find((r) => r.id === selection.range)?.months ?? 6;
  const first = firstDataMonthIndex(months);
  const count = months.length;

  let windowStart = Math.max(0, count - rangeMonths);
  const clipped = first !== null && first > windowStart;
  if (clipped) windowStart = first;
  const windowMonths = months.slice(windowStart);

  let periodStart = windowStart;
  let periodEnd = count;
  if (selection.month) {
    const selected = months.findIndex((m, i) => i >= windowStart && m.month === selection.month);
    if (selected !== -1) {
      periodStart = selected;
      periodEnd = selected + 1;
    }
  }
  const periodMonths = months.slice(periodStart, periodEnd);
  const length = periodMonths.length;
  const single = periodEnd - periodStart === 1 && selection.month !== null && periodMonths[0]?.month === selection.month;
  const partialOnly = length === 1 && periodMonths[0].partial;

  const priorStart = periodStart - length;
  const priorMonths =
    !partialOnly && first !== null && length > 0 && priorStart >= 0 && priorStart >= first
      ? months.slice(priorStart, periodStart)
      : null;

  const knownStart = first !== null && first > 0;
  const priorMissingForData = !partialOnly && priorMonths === null && first !== null && priorStart < first;
  const historyStartsLabel =
    knownStart && (clipped || priorMissingForData)
      ? `History starts ${monthShortLabel(months[first].month)} ${months[first].month.slice(0, 4)}`
      : null;

  let periodLabel: string;
  if (single) {
    periodLabel = `${monthLongLabel(periodMonths[0].month)}${periodMonths[0].partial ? " · month to date" : ""}`;
  } else {
    periodLabel = spanLabel(periodMonths);
  }

  let comparisonLabel: string | null = null;
  let comparisonShortLabel: string | null = null;
  if (priorMonths) {
    if (length === 1) {
      comparisonLabel = `Compared with ${monthLongLabel(priorMonths[0].month)}`;
      comparisonShortLabel = `vs ${monthShortLabel(priorMonths[0].month)}`;
    } else {
      comparisonLabel = `Compared with the previous ${length} months`;
      comparisonShortLabel = `vs prior ${length} mo`;
    }
  }

  return {
    windowMonths,
    periodMonths,
    priorMonths,
    periodLabel,
    comparisonLabel,
    comparisonShortLabel,
    historyStartsLabel,
  };
}

export interface PeriodTotals {
  income: number;
  spending: number;
  savings: number;
  netCashFlow: number;
}

/** Sum a period in integer cents so totals match the API to the cent. */
export function sumPeriod(months: CashflowMonth[]): PeriodTotals {
  let income = 0;
  let spending = 0;
  let savings = 0;
  for (const m of months) {
    income += toCents(m.income);
    spending += toCents(m.spending);
    savings += toCents(m.savings);
  }
  return {
    income: income / 100,
    spending: spending / 100,
    savings: savings / 100,
    netCashFlow: (income - spending) / 100,
  };
}

export interface Delta {
  pct: number;
  direction: "up" | "down" | "flat";
  /** Whether the change is good for the reader. */
  good: boolean;
}

export function periodDelta(current: number, prior: number, upIsGood: boolean): Delta | null {
  if (prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const direction = Math.round(pct * 10) === 0 ? "flat" : pct > 0 ? "up" : "down";
  const good = direction === "flat" ? true : (direction === "up") === upIsGood;
  return { pct, direction, good };
}

/** The last twelve complete months at or after the first data month. */
export function sparklineSeries(
  months: CashflowMonth[],
  key: keyof PeriodTotals,
  firstDataIndex: number | null
): number[] {
  if (firstDataIndex === null) return [];
  return months
    .filter((m, i) => i >= firstDataIndex && !m.partial)
    .slice(-12)
    .map((m) => sumPeriod([m])[key]);
}

export interface CategoryRow {
  /** Category key, or "OTHER" for the folded tail. */
  key: string;
  label: string;
  total: number;
  /** Bar width: share of the largest positive row, 0 to 100. */
  barPct: number;
  delta: Delta | null;
  /** Keys this row covers: [key] for ordinary rows, the folded keys for Other. */
  memberKeys: string[];
}

function categoryCents(months: CashflowMonth[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const m of months) {
    for (const c of m.spendingByCategory) {
      totals.set(c.key, (totals.get(c.key) ?? 0) + toCents(c.total));
    }
  }
  return totals;
}

export function rankCategories(
  period: CashflowMonth[],
  prior: CashflowMonth[] | null,
  top = 8
): CategoryRow[] {
  const totals = categoryCents(period);
  const priorTotals = prior ? categoryCents(prior) : null;
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = entries.filter(([, cents]) => cents > 0).slice(0, top);
  const keptKeys = new Set(kept.map(([key]) => key));
  const folded = entries.filter(([key]) => !keptKeys.has(key));

  const rows: Array<Omit<CategoryRow, "barPct">> = kept.map(([key, cents]) => ({
    key,
    label: labelForCategoryKey(key),
    total: cents / 100,
    delta: null,
    memberKeys: [key],
  }));
  if (folded.length > 0) {
    rows.push({
      key: "OTHER",
      label: "Other",
      total: folded.reduce((sum, [, cents]) => sum + cents, 0) / 100,
      delta: null,
      memberKeys: folded.map(([key]) => key),
    });
  }

  const maxTotal = Math.max(0, ...rows.map((r) => r.total));
  return rows.map((row) => {
    const priorTotal = priorTotals
      ? row.memberKeys.reduce((sum, key) => sum + (priorTotals.get(key) ?? 0), 0) / 100
      : 0;
    return {
      ...row,
      barPct: maxTotal > 0 ? Math.min(100, Math.max(0, (row.total / maxTotal) * 100)) : 0,
      delta: priorTotals ? periodDelta(row.total, priorTotal, false) : null,
    };
  });
}

/**
 * One category's row for the period, whether or not it made the top of the
 * ranking (a folded key still has transactions to show). Null when the key has
 * no spending in the period.
 */
export function categoryRowFor(
  period: CashflowMonth[],
  prior: CashflowMonth[] | null,
  key: string
): CategoryRow | null {
  const cents = categoryCents(period);
  if (!cents.has(key)) return null;
  const total = (cents.get(key) ?? 0) / 100;
  const priorTotal = prior ? (categoryCents(prior).get(key) ?? 0) / 100 : 0;
  return {
    key,
    label: labelForCategoryKey(key),
    total,
    barPct: 0,
    delta: prior ? periodDelta(total, priorTotal, false) : null,
    memberKeys: [key],
  };
}

function niceStep(span: number, targetCount: number): number {
  if (span <= 0) return 1;
  const raw = span / targetCount;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * power >= raw) return factor * power;
  }
  return 10 * power;
}

export interface CashflowColumnLayout {
  /** Distance of the zero line from the top of the plot, in percent. */
  baselinePct: number;
  /** Gridline values and their distance from the top, in percent. */
  ticks: Array<{ value: number; pct: number }>;
  /** Segment heights in percent of the plot height. */
  columns: Array<{
    month: string;
    incomePct: number;
    spendingPct: number;
    savedPct: number;
    /** Negative savings (a withdrawal) stack above income instead of below spending. */
    savedAbove: boolean;
  }>;
}

const LABEL_HEADROOM = 1.08;

export function layoutCashflowColumns(months: CashflowMonth[]): CashflowColumnLayout {
  const values = months.map((m) => {
    const t = sumPeriod([m]);
    return { month: m.month, income: Math.max(t.income, 0), spending: Math.max(t.spending, 0), savings: t.savings };
  });
  const upMax = Math.max(0, ...values.map((v) => v.income + Math.max(-v.savings, 0)));
  const downMax = Math.max(0, ...values.map((v) => v.spending + Math.max(v.savings, 0)));
  const up = upMax * LABEL_HEADROOM;
  const down = downMax * LABEL_HEADROOM;
  const total = up + down;

  if (total === 0) {
    return {
      baselinePct: 50,
      ticks: [{ value: 0, pct: 50 }],
      columns: values.map((v) => ({ month: v.month, incomePct: 0, spendingPct: 0, savedPct: 0, savedAbove: false })),
    };
  }

  const baselinePct = (up / total) * 100;
  const pct = (amount: number) => (amount / total) * 100;
  const step = niceStep(Math.max(upMax, downMax), 3);
  const ticks: CashflowColumnLayout["ticks"] = [];
  for (let k = -Math.floor(down / step); k <= Math.floor(up / step); k++) {
    ticks.push({ value: k * step, pct: baselinePct - pct(k * step) });
  }

  return {
    baselinePct,
    ticks,
    columns: values.map((v) => ({
      month: v.month,
      incomePct: pct(v.income),
      spendingPct: pct(v.spending),
      savedPct: pct(Math.abs(v.savings)),
      savedAbove: v.savings < 0,
    })),
  };
}

/**
 * Days of net-worth history for a range, measured from the first day of the
 * range's first month so the line and the cash-flow window start together.
 */
export function netWorthDaysForRange(range: AnalyticsRange, today: string): number {
  if (range === "ALL") return ALL_RANGE_DAYS;
  const months = ANALYTICS_RANGES.find((r) => r.id === range)?.months ?? 6;
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const start = Date.UTC(year, monthIndex - (months - 1), 1);
  const end = Date.UTC(year, monthIndex, Number(today.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

export interface ComparableChange {
  amount: number;
  pct: number | null;
  /** Date of the first point in the comparable stretch. */
  fromDate: string;
  spansWholeRange: boolean;
  /** The stretch contains reconstructed (estimated) points. */
  estimated: boolean;
}

/**
 * Whether one side (assets or liabilities) of an account-change edge moved in
 * a way the recorded adjustment explains. If "no addition happened" explains
 * the jump better than the adjustment does, by more than half the adjustment
 * and more than 1% of that side's total, the adjustment never showed up.
 */
function sideContradicted(adjustment: number, jump: number, level: number): boolean {
  if (Math.abs(adjustment) < 0.005) return false;
  const organicIfReal = Math.abs(jump - adjustment);
  const organicIfNot = Math.abs(jump);
  return organicIfReal - organicIfNot > Math.max(Math.abs(adjustment) * 0.5, Math.abs(level) * 0.01);
}

/**
 * Across an account-change edge inside one comparison segment, normalization
 * lifts earlier points by the recorded adjustment, so the newly covered
 * balance should appear on its side of the ledger at the edge. Each side is
 * checked on its own so a market move in investments cannot mask, or mimic,
 * a card's liability appearing. A contradiction (e.g. a re-created manual
 * account recorded as new while its predecessor was already counted) means
 * measuring across the edge would report a change that did not happen.
 */
function normalizationHolds(before: NetWorthSnapshotRow, after: NetWorthSnapshotRow): boolean {
  if (before.coverageSegment === after.coverageSegment) return true;
  const n = (value: string | null | undefined) => Number.parseFloat(value ?? "0");
  const assetAdjustment =
    n(before.adjustedTotalAssets) - n(before.totalAssets) - (n(after.adjustedTotalAssets) - n(after.totalAssets));
  const liabilityAdjustment =
    n(before.adjustedTotalLiabilities) -
    n(before.totalLiabilities) -
    (n(after.adjustedTotalLiabilities) - n(after.totalLiabilities));
  return (
    !sideContradicted(assetAdjustment, n(after.totalAssets) - n(before.totalAssets), n(after.totalAssets)) &&
    !sideContradicted(
      liabilityAdjustment,
      n(after.totalLiabilities) - n(before.totalLiabilities),
      n(after.totalLiabilities)
    )
  );
}

/**
 * Dates of account changes whose normalization the balances contradict (see
 * normalizationHolds). The chart opens in Reported mode when there are any.
 */
export function normalizationContradictions(snapshots: NetWorthSnapshotRow[]): string[] {
  const dates: string[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const before = snapshots[i - 1];
    const after = snapshots[i];
    if (before.comparisonSegment !== after.comparisonSegment) continue;
    if (before.adjustedNetWorth == null || after.adjustedNetWorth == null) continue;
    if (!normalizationHolds(before, after)) dates.push(after.date);
  }
  return dates;
}

/**
 * Change within the most recent comparable stretch: same comparison segment
 * with adjusted values in Normalized mode, same coverage segment with raw
 * values in Reported mode. Never measures across an unknown coverage change,
 * nor across an account change whose normalization does not hold.
 */
export function comparableChange(
  snapshots: NetWorthSnapshotRow[],
  mode: "normalized" | "reported"
): ComparableChange | null {
  if (snapshots.length < 2) return null;
  const valueOf = (p: NetWorthSnapshotRow) => (mode === "normalized" ? p.adjustedNetWorth : p.netWorth);
  const segmentOf = (p: NetWorthSnapshotRow) =>
    mode === "normalized" ? p.comparisonSegment : p.coverageSegment;

  const lastIndex = snapshots.length - 1;
  const last = snapshots[lastIndex];
  if (valueOf(last) == null) return null;
  let start = lastIndex;
  while (start > 0) {
    const previous = snapshots[start - 1];
    if (segmentOf(previous) !== segmentOf(last) || valueOf(previous) == null) break;
    if (mode === "normalized" && !normalizationHolds(previous, snapshots[start])) break;
    start--;
  }
  if (start === lastIndex) return null;

  const startValue = Number.parseFloat(valueOf(snapshots[start]) as string);
  const endValue = Number.parseFloat(valueOf(last) as string);
  const amount = Math.round((endValue - startValue) * 100) / 100;
  return {
    amount,
    pct: startValue !== 0 ? (amount / Math.abs(startValue)) * 100 : null,
    fromDate: snapshots[start].date,
    spansWholeRange: start === 0,
    estimated: snapshots.slice(start).some((p) => p.quality === "reconstructed"),
  };
}

/** Padded, nicely rounded y-scale that never forces zero in (nor pads below it), with its gridline ticks. */
export function netWorthScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(max) * 0.01, 1);
  // Padding never pushes a non-negative series below zero.
  const lo = min >= 0 ? Math.max(0, min - pad) : min - pad;
  const hi = max + pad;
  const step = niceStep(hi - lo, 4);
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) ticks.push(k * step);
  return { domain: [first * step, last * step], ticks };
}

/** The y-domain half of netWorthScale. */
export function netWorthDomain(values: number[]): [number, number] {
  return netWorthScale(values).domain;
}

/** "since Jul 1", or "since Mar 31, 2025" when the year differs from today's. */
export function sinceLabel(fromDate: string, today: string): string {
  const year = fromDate.slice(0, 4);
  const month = SHORT_MONTHS[Number(fromDate.slice(5, 7)) - 1];
  const day = Number(fromDate.slice(8, 10));
  return year === today.slice(0, 4) ? `since ${month} ${day}` : `since ${month} ${day}, ${year}`;
}

// ---------------------------------------------------------------------------
// The Analytics tab (docs/plans/analytics-tab.md): like-for-like comparisons,
// the savings rate, category trends and the year-to-date comparison.

/** The month's figures counted only through today's day of the month, when the API supplied them. */
export function asToDate(month: CashflowMonth): CashflowMonth {
  if (!month.toDate) return month;
  return {
    ...month,
    income: month.toDate.income,
    spending: month.toDate.spending,
    savings: month.toDate.savings,
    netCashFlow: month.toDate.netCashFlow,
    spendingByCategory: month.toDate.spendingByCategory,
  };
}

/**
 * The prior window with its last month counted through the same day of the
 * month when the period ends in the current, partial month, so a partial
 * September compares with a partial March rather than a whole one.
 */
export function likeForLikePrior(period: ResolvedPeriod): CashflowMonth[] | null {
  const prior = period.priorMonths;
  if (!prior || prior.length === 0) return prior;
  const last = period.periodMonths[period.periodMonths.length - 1];
  if (!last?.partial) return prior;
  return [...prior.slice(0, -1), asToDate(prior[prior.length - 1])];
}

/** Share of the month's income kept (net cash flow over income, in percent); null without income. */
export function monthRate(month: CashflowMonth): number | null {
  const income = toCents(month.income);
  if (income === 0) return null;
  return (toCents(month.netCashFlow) / income) * 100;
}

/** Share of income kept across the months as a whole; null without income. */
export function windowRate(months: CashflowMonth[]): number | null {
  const totals = sumPeriod(months);
  if (totals.income === 0) return null;
  return (totals.netCashFlow / totals.income) * 100;
}

export interface SavingsRateSummary {
  rate: number | null;
  /** Change in percentage points against the prior window; null without one. */
  deltaPoints: number | null;
  best: { month: string; rate: number } | null;
  lowest: { month: string; rate: number } | null;
}

/** The savings-rate card's figures: the window's rate, its change, and the best and lowest complete months. */
export function savingsRateSummary(
  window: CashflowMonth[],
  prior: CashflowMonth[] | null
): SavingsRateSummary {
  const rate = windowRate(window);
  const priorRate = prior ? windowRate(prior) : null;
  const complete = window.filter((m) => !m.partial);
  const candidates = (complete.length > 0 ? complete : window)
    .map((m) => ({ month: m.month, rate: monthRate(m) }))
    .filter((p): p is { month: string; rate: number } => p.rate !== null);
  let best: { month: string; rate: number } | null = null;
  let lowest: { month: string; rate: number } | null = null;
  for (const p of candidates) {
    if (!best || p.rate > best.rate) best = p;
    if (!lowest || p.rate < lowest.rate) lowest = p;
  }
  return {
    rate,
    deltaPoints: rate !== null && priorRate !== null ? rate - priorRate : null,
    best,
    lowest,
  };
}

/**
 * Ticks every ten points for a rate line: from zero (or ten below the lowest
 * negative rate) to ten above the highest, so the baseline is always drawn and
 * the line never touches the top.
 */
export function rateScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 0;
  const lo = min >= 0 ? 0 : Math.floor((min - 4) / 10) * 10;
  const hi = Math.max(lo + 10, Math.ceil((max + 4) / 10) * 10);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

export interface CategoryTrendRow extends CategoryRow {
  /** Spending per window month, oldest first, summed over memberKeys, in dollars. */
  series: number[];
  /** Mean per month over the window's complete months (all months when none is complete). */
  average: number;
}

function categoryCentsIn(month: CashflowMonth, keys: Set<string>): number {
  let cents = 0;
  for (const c of month.spendingByCategory) if (keys.has(c.key)) cents += toCents(c.total);
  return cents;
}

/**
 * The category-trends rows: the ranking's rows with a per-month series and an
 * average, sorted fastest-growing first when there is a comparison (rows
 * without one after them, Other always last) and by size otherwise.
 */
export function categoryTrends(
  window: CashflowMonth[],
  prior: CashflowMonth[] | null,
  top = 8
): CategoryTrendRow[] {
  const complete = window.filter((m) => !m.partial);
  const averaging = complete.length > 0 ? complete : window;
  const rows = rankCategories(window, prior, top).map((row) => {
    const keys = new Set(row.memberKeys);
    const series = window.map((m) => categoryCentsIn(m, keys) / 100);
    const averageCents = averaging.reduce((sum, m) => sum + categoryCentsIn(m, keys), 0);
    return { ...row, series, average: averaging.length ? averageCents / averaging.length / 100 : 0 };
  });
  if (!prior) return rows;
  const bucket = (r: CategoryTrendRow) => (r.key === "OTHER" ? 2 : r.delta ? 0 : 1);
  return rows.sort(
    (a, b) => bucket(a) - bucket(b) || (b.delta?.pct ?? 0) - (a.delta?.pct ?? 0) || b.total - a.total
  );
}

export interface YearToDate {
  /** January through the current month of this year. */
  thisYear: CashflowMonth[];
  /** The same months of last year, the last one counted to the same day; null when data does not cover them. */
  lastYear: CashflowMonth[] | null;
  totals: PeriodTotals;
  lastTotals: PeriodTotals | null;
  deltas: {
    income: Delta | null;
    spending: Delta | null;
    savings: Delta | null;
    netCashFlow: Delta | null;
  };
  highest: { month: string; total: number } | null;
  lowest: { month: string; total: number } | null;
  /** Spending per calendar month of this year, January first; null for months not reached yet. */
  strip: Array<number | null>;
  /** "Jan–Sep 2026" */
  label: string;
  /** "Compared with Jan–Sep 2025", or null. */
  comparisonLabel: string | null;
  /** Why the comparison is like for like, or why there is none. */
  note: string | null;
}

/** This year so far against the same months of last year. Null when this year has no data yet. */
export function yearToDate(months: CashflowMonth[], today: string): YearToDate | null {
  const year = today.slice(0, 4);
  const first = firstDataMonthIndex(months);
  const thisYear = months.filter((m) => m.month.startsWith(year) && m.month <= today.slice(0, 7));
  if (first === null || thisYear.length === 0) return null;
  if (months.indexOf(thisYear[thisYear.length - 1]) < first) return null;

  const lastYearKey = String(Number(year) - 1);
  const found = thisYear.map((m) => months.find((x) => x.month === `${lastYearKey}${m.month.slice(4)}`) ?? null);
  const covered =
    found.every((m): m is CashflowMonth => m !== null) && months.indexOf(found[0] as CashflowMonth) >= first;
  const current = thisYear[thisYear.length - 1];
  let lastYear: CashflowMonth[] | null = null;
  if (covered) {
    const whole = found as CashflowMonth[];
    lastYear = current.partial ? [...whole.slice(0, -1), asToDate(whole[whole.length - 1])] : whole;
  }

  const totals = sumPeriod(thisYear);
  const lastTotals = lastYear ? sumPeriod(lastYear) : null;
  const delta = (key: keyof PeriodTotals, upIsGood: boolean) =>
    lastTotals ? periodDelta(totals[key], lastTotals[key], upIsGood) : null;

  let highest: { month: string; total: number } | null = null;
  let lowest: { month: string; total: number } | null = null;
  for (const m of thisYear) {
    if (m.partial) continue;
    const total = sumPeriod([m]).spending;
    if (!highest || total > highest.total) highest = { month: m.month, total };
    if (!lowest || total < lowest.total) lowest = { month: m.month, total };
  }

  const strip = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const m = thisYear.find((x) => x.month === key);
    return m ? sumPeriod([m]).spending : null;
  });

  const note = lastYear
    ? current.partial
      ? `${lastYearKey} is counted through the same day of the month, so the current month compares like for like.`
      : null
    : `History starts ${monthShortLabel(months[first].month)} ${months[first].month.slice(0, 4)}`;

  return {
    thisYear,
    lastYear,
    totals,
    lastTotals,
    deltas: {
      income: delta("income", true),
      spending: delta("spending", false),
      savings: delta("savings", true),
      netCashFlow: delta("netCashFlow", true),
    },
    highest,
    lowest,
    strip,
    label: spanLabel(thisYear),
    comparisonLabel: lastYear ? `Compared with ${spanLabel(lastYear)}` : null,
    note,
  };
}
