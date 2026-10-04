// Pure model behind the Analytics view: time ranges, period resolution,
// comparisons, category ranking, cash-flow chart geometry and the net-worth
// change figure. No React or server imports; every function is unit tested in
// src/__tests__/analytics-model.test.ts. Decisions are recorded in
// docs/plans/analytics-redesign.md (Decision Log).

import { labelForCategoryKey, type CashflowMonth } from "@/lib/cashflow";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";

export type PeriodPresetId = "MTD" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

/**
 * What a page is showing: a quick range, one calendar month, one calendar
 * year, or a custom span of months. Month keys are "YYYY-MM"; a range is
 * inclusive at both ends. See docs/plans/period-picker.md.
 */
export type Period =
  | { kind: "preset"; id: PeriodPresetId }
  | { kind: "month"; month: string }
  | { kind: "year"; year: number }
  | { kind: "range"; from: string; to: string };

/** The quick ranges, in display order. `months` is set for the rolling ones. */
export const PERIOD_PRESETS: ReadonlyArray<{
  id: PeriodPresetId;
  label: string;
  months: number | null;
}> = [
  { id: "MTD", label: "MTD", months: null },
  { id: "3M", label: "3M", months: 3 },
  { id: "6M", label: "6M", months: 6 },
  { id: "YTD", label: "YTD", months: null },
  { id: "1Y", label: "1Y", months: 12 },
  { id: "ALL", label: "All", months: null },
];

/** Months of cash flow fetched once; periods and comparisons slice from it. */
export const CASHFLOW_FETCH_MONTHS = 60;
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

const DAY_MS = 86_400_000;

function keyOf(year: number, index: number): string {
  return `${year}-${String(index + 1).padStart(2, "0")}`;
}

/** The month `delta` months after (or before) a "YYYY-MM" key. */
export function addMonths(key: string, delta: number): string {
  const { year, index } = parseMonthKey(key);
  const total = year * 12 + index + delta;
  return keyOf(Math.floor(total / 12), ((total % 12) + 12) % 12);
}

function monthDiff(from: string, to: string): number {
  const a = parseMonthKey(from);
  const b = parseMonthKey(to);
  return (b.year - a.year) * 12 + (b.index - a.index);
}

function lastDayOfMonth(key: string): string {
  const { year, index } = parseMonthKey(key);
  return `${key}-${String(new Date(Date.UTC(year, index + 1, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** "Apr–Sep 2026", "Oct 2025–Sep 2026", or "August 2026" when both keys are the same month. */
export function spanKeysLabel(firstKey: string, lastKey: string): string {
  const first = parseMonthKey(firstKey);
  const last = parseMonthKey(lastKey);
  if (firstKey === lastKey) return monthLongLabel(firstKey);
  return first.year === last.year
    ? `${SHORT_MONTHS[first.index]}–${SHORT_MONTHS[last.index]} ${last.year}`
    : `${SHORT_MONTHS[first.index]} ${first.year}–${SHORT_MONTHS[last.index]} ${last.year}`;
}

/** "Apr–Sep 2026", "Oct 2025–Sep 2026", or "August 2026" for one month. */
export function spanLabel(months: CashflowMonth[]): string {
  if (months.length === 0) return "";
  return spanKeysLabel(months[0].month, months[months.length - 1].month);
}

/**
 * One representation per period: the current month is MTD, the current year
 * is YTD, a one-month range is that month, and a backwards range is swapped.
 */
export function normalizePeriod(period: Period, today: string): Period {
  const current = today.slice(0, 7);
  if (period.kind === "range") {
    const from = period.from <= period.to ? period.from : period.to;
    const to = period.from <= period.to ? period.to : period.from;
    if (from === to) return normalizePeriod({ kind: "month", month: from }, today);
    return from === period.from ? period : { kind: "range", from, to };
  }
  if (period.kind === "month") return period.month === current ? { kind: "preset", id: "MTD" } : period;
  if (period.kind === "year") return String(period.year) === today.slice(0, 4) ? { kind: "preset", id: "YTD" } : period;
  return period;
}

export interface PeriodDescription {
  /** The normalized period. */
  period: Period;
  /** Text of the period button: "May–Oct 2026", "Oct 1–3, 2026", "September 2026", "2025". */
  buttonLabel: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** Today when the period reaches the current month, else the last day of its last month. */
  endDate: string;
  endsToday: boolean;
  /** What the arrows step by; null for rolling ranges, All and custom ranges. */
  stepUnit: "month" | "year" | null;
  /** "YYYY-MM" */
  firstMonth: string;
  lastMonth: string;
}

/** Labels, dates and step unit from the period and today alone (no month list needed). */
export function describePeriod(period: Period, today: string): PeriodDescription {
  const p = normalizePeriod(period, today);
  const current = today.slice(0, 7);
  const year = today.slice(0, 4);
  const day = Number(today.slice(8, 10));
  const short = SHORT_MONTHS[Number(today.slice(5, 7)) - 1];

  let firstMonth: string;
  let lastMonth = current;
  let buttonLabel: string;
  let stepUnit: PeriodDescription["stepUnit"] = null;
  let startDate: string | null = null;

  if (p.kind === "month") {
    firstMonth = lastMonth = p.month;
    buttonLabel = monthLongLabel(p.month);
    stepUnit = "month";
  } else if (p.kind === "year") {
    firstMonth = `${p.year}-01`;
    lastMonth = `${p.year}-12`;
    buttonLabel = String(p.year);
    stepUnit = "year";
  } else if (p.kind === "range") {
    firstMonth = p.from;
    lastMonth = p.to;
    buttonLabel = spanKeysLabel(p.from, p.to);
  } else if (p.id === "MTD") {
    firstMonth = current;
    buttonLabel = day === 1 ? `${short} 1, ${year}` : `${short} 1–${day}, ${year}`;
    stepUnit = "month";
  } else if (p.id === "YTD") {
    firstMonth = `${year}-01`;
    buttonLabel = today.slice(5) === "01-01" ? `Jan 1, ${year}` : `Jan 1–${short} ${day}, ${year}`;
    stepUnit = "year";
  } else if (p.id === "ALL") {
    startDate = new Date(Date.parse(`${today}T00:00:00Z`) - ALL_RANGE_DAYS * DAY_MS).toISOString().slice(0, 10);
    firstMonth = startDate.slice(0, 7);
    buttonLabel = "All time";
  } else {
    const months = PERIOD_PRESETS.find((r) => r.id === p.id)?.months ?? 6;
    firstMonth = addMonths(current, -(months - 1));
    buttonLabel = spanKeysLabel(firstMonth, current);
  }

  const endsToday = lastMonth === current;
  return {
    period: p,
    buttonLabel,
    startDate: startDate ?? `${firstMonth}-01`,
    endDate: endsToday ? today : lastDayOfMonth(lastMonth),
    endsToday,
    stepUnit,
    firstMonth,
    lastMonth,
  };
}

export interface ResolvedPeriod {
  /** Months drawn in the cash-flow chart: the period, or six months of context around a short one. */
  windowMonths: CashflowMonth[];
  /** Months the tiles and categories summarize. */
  periodMonths: CashflowMonth[];
  /** The months the period is compared with, when real data covers them. */
  priorMonths: CashflowMonth[] | null;
  /** True when windowMonths is wider than periodMonths and the chart should highlight the period. */
  highlightPeriod: boolean;
  periodLabel: string;
  /** Text of the period button; for rolling ranges it reflects clipping to the first data month. */
  buttonLabel: string;
  comparisonLabel: string | null;
  comparisonShortLabel: string | null;
  historyStartsLabel: string | null;
  startDate: string;
  endDate: string;
  endsToday: boolean;
  stepUnit: "month" | "year" | null;
}

const FALLBACK_PERIOD: Period = { kind: "preset", id: "6M" };

export function resolvePeriod(months: CashflowMonth[], period: Period, today: string): ResolvedPeriod {
  const described = describePeriod(period, today);
  const p = described.period;
  const dates = {
    startDate: described.startDate,
    endDate: described.endDate,
    endsToday: described.endsToday,
    stepUnit: described.stepUnit,
  };
  const count = months.length;
  if (count === 0) {
    return {
      windowMonths: [],
      periodMonths: [],
      priorMonths: null,
      highlightPeriod: false,
      periodLabel: described.buttonLabel,
      buttonLabel: described.buttonLabel,
      comparisonLabel: null,
      comparisonShortLabel: null,
      historyStartsLabel: null,
      ...dates,
    };
  }

  const first = firstDataMonthIndex(months);
  const isAll = p.kind === "preset" && p.id === "ALL";
  const wanted = isAll ? 0 : monthDiff(months[0].month, described.firstMonth);
  const end = Math.min(count - 1, monthDiff(months[0].month, described.lastMonth));
  // A stale month, year or range that no longer overlaps the data falls back to 6M.
  if (p.kind !== "preset" && (end < 0 || wanted > count - 1 || (first !== null && end < first))) {
    return resolvePeriod(months, FALLBACK_PERIOD, today);
  }

  let start = Math.max(0, wanted);
  const clipped = first !== null && first > start;
  if (clipped) start = Math.min(first, end);
  const periodMonths = months.slice(start, end + 1);
  const length = periodMonths.length;

  const contextStart = Math.max(first ?? 0, end - 5, 0);
  const windowMonths = length >= 3 ? periodMonths : months.slice(Math.min(contextStart, start), end + 1);
  const highlightPeriod = windowMonths.length > length;

  const isPreset = (id: PeriodPresetId) => p.kind === "preset" && p.id === id;
  const calendarYear = p.kind === "year" || isPreset("YTD");
  let priorStart: number;
  let priorEnd: number;
  if (calendarYear) {
    priorStart = start - 12;
    priorEnd = end - 12;
  } else {
    priorStart = start - length;
    priorEnd = start - 1;
  }
  const wholeYear = p.kind !== "year" || length === 12;
  const priorMonths =
    !isAll && wholeYear && first !== null && length > 0 && priorStart >= 0 && priorStart >= first
      ? months.slice(priorStart, priorEnd + 1)
      : null;

  const knownStart = first !== null && first > 0;
  const priorMissingForData = !isAll && priorMonths === null && first !== null && priorStart < first;
  const historyStartsLabel =
    knownStart && (clipped || priorMissingForData)
      ? `History starts ${monthShortLabel(months[first].month)} ${months[first].month.slice(0, 4)}`
      : null;

  const periodLabel =
    length === 1
      ? `${monthLongLabel(periodMonths[0].month)}${periodMonths[0].partial ? " · month to date" : ""}`
      : spanLabel(periodMonths);

  const rolling = p.kind === "preset" && p.id !== "MTD" && p.id !== "YTD";
  const buttonLabel = rolling && length > 0 ? spanLabel(periodMonths) : described.buttonLabel;

  let comparisonLabel: string | null = null;
  let comparisonShortLabel: string | null = null;
  if (priorMonths) {
    const day = Number(today.slice(8, 10));
    if (isPreset("MTD")) {
      const days = day === 1 ? "1" : `1–${day}`;
      const key = priorMonths[0].month;
      comparisonLabel = `Compared with ${LONG_MONTHS[parseMonthKey(key).index]} ${days}`;
      comparisonShortLabel = `vs ${monthShortLabel(key)} ${days}`;
    } else if (isPreset("YTD")) {
      comparisonLabel = `Compared with ${spanLabel(priorMonths)}`;
      comparisonShortLabel = `vs ${priorMonths[0].month.slice(0, 4)} to date`;
    } else if (p.kind === "year") {
      comparisonLabel = `Compared with ${p.year - 1}`;
      comparisonShortLabel = `vs ${p.year - 1}`;
    } else if (length === 1) {
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
    highlightPeriod,
    periodLabel,
    buttonLabel,
    comparisonLabel,
    comparisonShortLabel,
    historyStartsLabel,
    ...dates,
  };
}

/** The first and last months the picker may select, "YYYY-MM". */
export interface PeriodBounds {
  firstMonth: string;
  lastMonth: string;
}

/**
 * The neighbouring month or year for the arrows; null when the period has no
 * step unit or the neighbour lies outside the bounds.
 */
export function stepPeriod(period: Period, direction: -1 | 1, bounds: PeriodBounds, today: string): Period | null {
  const described = describePeriod(period, today);
  if (described.stepUnit === "month") {
    const month = addMonths(described.firstMonth, direction);
    if (month < bounds.firstMonth || month > bounds.lastMonth) return null;
    return normalizePeriod({ kind: "month", month }, today);
  }
  if (described.stepUnit === "year") {
    const year = Number(described.firstMonth.slice(0, 4)) + direction;
    if (`${year}-12` < bounds.firstMonth || `${year}-01` > bounds.lastMonth) return null;
    return normalizePeriod({ kind: "year", year }, today);
  }
  return null;
}

/** The period for a drag or Shift-click between two month keys, in either order. */
export function periodFromSpan(a: string, b: string, today: string): Period {
  return normalizePeriod({ kind: "range", from: a, to: b }, today);
}

export interface MonthCell {
  /** "YYYY-MM" */
  month: string;
  /** "Jan" */
  label: string;
  /** Outside the bounds. */
  disabled: boolean;
  inRange: boolean;
  /** Drawn solid: the one selected month, or an end of a range. */
  solid: boolean;
  /** Today's month. */
  current: boolean;
}

/** The picker's twelve cells for a year, January first. */
export function monthGridCells(
  year: number,
  selection: { from: string; to: string; solidEnds: boolean },
  bounds: PeriodBounds,
  today: string
): MonthCell[] {
  const single = selection.from === selection.to;
  return SHORT_MONTHS.map((label, index) => {
    const month = keyOf(year, index);
    const disabled = month < bounds.firstMonth || month > bounds.lastMonth;
    const inRange = !disabled && month >= selection.from && month <= selection.to;
    const isEnd = month === selection.from || month === selection.to;
    return {
      month,
      label,
      disabled,
      inRange,
      solid: inRange && (single || (selection.solidEnds && isEnd)),
      current: month === today.slice(0, 7),
    };
  });
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

/** Days fetched before the period's first day so the previous close can be the baseline. */
const BASELINE_DAYS = 7;

/**
 * The net-worth request for a period: days of history counted back from today
 * (a week more than the period, so the previous close is included) and the
 * date to trim to, null when the period reaches today.
 */
export function netWorthWindow(
  dates: Pick<PeriodDescription, "startDate" | "endDate" | "endsToday">,
  today: string
): { days: number; startDate: string; endDate: string | null } {
  const span = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dates.startDate}T00:00:00Z`)) / DAY_MS);
  return {
    days: Math.min(Math.max(span + BASELINE_DAYS, 1), ALL_RANGE_DAYS),
    startDate: dates.startDate,
    endDate: dates.endsToday ? null : dates.endDate,
  };
}

/**
 * The points a period shows: everything up to the end date, with only the last
 * point before the start date kept, as the baseline.
 */
export function trimHistory<T extends { date: string }>(snapshots: T[], startDate: string, endDate: string | null): T[] {
  const upToEnd = endDate === null ? snapshots : snapshots.filter((s) => s.date <= endDate);
  const firstInside = upToEnd.findIndex((s) => s.date >= startDate);
  if (firstInside === -1) return [];
  return upToEnd.slice(Math.max(0, firstInside - 1));
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

/**
 * First-of-month ticks across the range; every third month on long ranges.
 * When the data starts within the first ten days of a month, the axis starts
 * on that month's first day so its label is shown. Shared by the net-worth
 * and investment charts.
 */
export function monthTicks(min: number, max: number): { ticks: number[]; dense: boolean; start: number } | null {
  const first = new Date(min);
  const monthStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const start = min - monthStart <= 10 * 86_400_000 ? monthStart : min;
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth() + (start === monthStart ? 0 : 1);
  const ticks: number[] = [];
  for (;;) {
    const t = Date.UTC(year, month, 1);
    if (t > max) break;
    ticks.push(t);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  if (ticks.length < 2) return null;
  const dense = ticks.length > 12;
  return { ticks: dense ? ticks.filter((_, i) => i % 3 === 0) : ticks, dense, start };
}

/** "2026-08" for a UTC timestamp. */
export function monthKeyOf(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

/** "since Jul 1", or "since Mar 31, 2025" when the year differs from today's. */
export function sinceLabel(fromDate: string, today: string): string {
  const year = fromDate.slice(0, 4);
  const month = SHORT_MONTHS[Number(fromDate.slice(5, 7)) - 1];
  const day = Number(fromDate.slice(8, 10));
  return year === today.slice(0, 4) ? `since ${month} ${day}` : `since ${month} ${day}, ${year}`;
}

/** "Sep 1–30" or "Aug 31–Sep 30", with the year appended when it differs from today's. */
export function betweenLabel(fromDate: string, toDate: string, today: string): string {
  const fromMonth = SHORT_MONTHS[Number(fromDate.slice(5, 7)) - 1];
  const toMonth = SHORT_MONTHS[Number(toDate.slice(5, 7)) - 1];
  const fromDay = Number(fromDate.slice(8, 10));
  const toDay = Number(toDate.slice(8, 10));
  const year = toDate.slice(0, 4);
  const sameMonth = fromDate.slice(0, 7) === toDate.slice(0, 7);
  const fromYear = fromDate.slice(0, 4) === year ? "" : `, ${fromDate.slice(0, 4)}`;
  const span = sameMonth ? `${fromMonth} ${fromDay}–${toDay}` : `${fromMonth} ${fromDay}${fromYear}–${toMonth} ${toDay}`;
  return year === today.slice(0, 4) && !fromYear ? span : `${span}, ${year}`;
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
