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
 * Across an account-change edge inside one comparison segment, normalization
 * lifts earlier points by the recorded adjustment, so the adjusted series
 * should move only by ordinary day-to-day change. When the adjusted series
 * instead jumps by more than half the adjustment (and more than 1% of net
 * worth), the recorded adjustment never showed up in the balance, e.g. a
 * re-created manual account whose predecessor's removal was not recorded,
 * and measuring across the edge would report a change that did not happen.
 */
function normalizationHolds(before: NetWorthSnapshotRow, after: NetWorthSnapshotRow): boolean {
  if (before.coverageSegment === after.coverageSegment) return true;
  const rawBefore = Number.parseFloat(before.netWorth);
  const rawAfter = Number.parseFloat(after.netWorth);
  const adjBefore = Number.parseFloat(before.adjustedNetWorth as string);
  const adjAfter = Number.parseFloat(after.adjustedNetWorth as string);
  const adjustment = adjBefore - rawBefore - (adjAfter - rawAfter);
  const adjustedJump = Math.abs(adjAfter - adjBefore);
  return adjustedJump <= Math.max(Math.abs(adjustment) * 0.5, Math.abs(adjAfter) * 0.01);
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
