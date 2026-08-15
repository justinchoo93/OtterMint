// Pure investment-performance math. No server-only imports: the API route
// feeds it rows, the UI imports its types. Design and honesty rules are in
// docs/plans/investment-performance.md — in particular: math never trusts
// snapshot rows without a coverage fingerprint (the "legacy" region), and a
// fingerprint change is a measurement boundary, never market movement.

import { classifyTransaction, type ClassifiableTransaction } from "@/lib/cashflow";

export type SeriesQuality = "legacy" | "known";

export interface AggregateRow {
  date: string; // YYYY-MM-DD
  investmentTotal: string | null;
  coverageFingerprint: string | null;
}

export interface AccountSnapshotRow {
  accountId: string;
  name: string;
  date: string;
  balance: string;
}

export interface CoverageEventRow {
  effectiveDate: string;
  assetAdjustment: string;
}

export interface InvestmentFlowRow extends ClassifiableTransaction {
  date: string;
  pending: boolean;
}

export interface PortfolioSeriesPoint {
  date: string;
  value: string;
  segment: number;
  quality: SeriesQuality;
}

export interface CoverageBoundary {
  date: string; // the first date of the new segment
  /** Summed coverage-event adjustments explaining the step; null = unknown. */
  step: string | null;
}

export interface AccountSeries {
  accountId: string;
  name: string;
  points: Array<{ date: string; value: string }>;
}

export interface PortfolioSeries {
  points: PortfolioSeriesPoint[];
  boundaries: CoverageBoundary[];
  accounts: AccountSeries[];
}

export interface Attribution {
  windowStart: string;
  windowEnd: string;
  start: string;
  contributions: string;
  withdrawals: string; // positive magnitude
  /** Residual market P&L; null when a boundary step inside the window is unknown. */
  marketPnl: string | null;
  coverageSteps: string;
  end: string;
}

export interface InvestmentFlow {
  date: string;
  kind: "contribution" | "withdrawal";
  /** Positive cents magnitude. */
  cents: number;
}

const CONTRIBUTION_DETAILED = "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS";
const WITHDRAWAL_DETAILED = "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS";

function toCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Investment contributions/withdrawals from classified transactions: the
 * checking-side transfers the cash-flow classifier marks as savings, narrowed
 * to the investment-fund detailed categories (bank-savings moves excluded).
 */
export function extractInvestmentFlows(rows: InvestmentFlowRow[]): InvestmentFlow[] {
  const flows: InvestmentFlow[] = [];
  for (const row of rows) {
    if (row.pending) continue;
    if (classifyTransaction(row) !== "savings") continue;
    if (row.categoryDetailed === CONTRIBUTION_DETAILED) {
      const cents = toCents(row.amount);
      if (cents > 0) flows.push({ date: row.date, kind: "contribution", cents });
    } else if (row.categoryDetailed === WITHDRAWAL_DETAILED) {
      const cents = toCents(row.amount);
      if (cents < 0) flows.push({ date: row.date, kind: "withdrawal", cents: -cents });
    }
  }
  return flows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function boundaryBetween(prev: AggregateRow, current: AggregateRow): boolean {
  const a = prev.coverageFingerprint;
  const b = current.coverageFingerprint;
  if (a === null && b === null) return false; // one continuous legacy run
  return a !== b;
}

function stepForGap(
  events: CoverageEventRow[],
  afterDate: string,
  throughDate: string,
  bothKnown: boolean
): string | null {
  if (!bothKnown) return null; // legacy transition: step size is unknowable
  const inGap = events.filter(
    (e) => e.effectiveDate > afterDate && e.effectiveDate <= throughDate
  );
  if (inGap.length === 0) return null; // fingerprint changed with no event
  return fromCents(inGap.reduce((sum, e) => sum + toCents(e.assetAdjustment), 0));
}

/**
 * The chart model. Aggregate rows split into segments at fingerprint changes
 * and at legacy↔known transitions; a run of null-fingerprint rows stays one
 * "legacy" segment (drawn distinctly, never trusted by math). Per-account
 * series simply start at each account's first snapshot.
 */
export function buildPortfolioSeries(
  aggregateRows: AggregateRow[],
  accountRows: AccountSnapshotRow[],
  events: CoverageEventRow[]
): PortfolioSeries {
  const rows = aggregateRows
    .filter((r) => r.investmentTotal !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const points: PortfolioSeriesPoint[] = [];
  const boundaries: CoverageBoundary[] = [];
  let segment = 0;

  rows.forEach((row, i) => {
    if (i > 0 && boundaryBetween(rows[i - 1], row)) {
      const bothKnown =
        rows[i - 1].coverageFingerprint !== null &&
        row.coverageFingerprint !== null;
      segment += 1;
      boundaries.push({
        date: row.date,
        step: stepForGap(events, rows[i - 1].date, row.date, bothKnown),
      });
    }
    points.push({
      date: row.date,
      value: fromCents(toCents(row.investmentTotal)),
      segment,
      quality: row.coverageFingerprint === null ? "legacy" : "known",
    });
  });

  const byAccount = new Map<string, AccountSeries>();
  for (const row of accountRows) {
    let series = byAccount.get(row.accountId);
    if (!series) {
      series = { accountId: row.accountId, name: row.name, points: [] };
      byAccount.set(row.accountId, series);
    }
    series.points.push({ date: row.date, value: fromCents(toCents(row.balance)) });
  }
  for (const series of byAccount.values()) {
    series.points.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  return { points, boundaries, accounts: [...byAccount.values()] };
}

/**
 * Start → contributions → market → coverage → end, over the trusted window
 * (first fingerprinted row through the last row). Market P&L is the exact
 * residual; it is null when the window contains a fingerprint change whose
 * step no coverage event explains. Returns null when no trusted rows exist.
 */
export function computeAttribution(
  aggregateRows: AggregateRow[],
  flows: InvestmentFlow[],
  events: CoverageEventRow[]
): Attribution | null {
  const rows = aggregateRows
    .filter((r) => r.investmentTotal !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstKnown = rows.findIndex((r) => r.coverageFingerprint !== null);
  if (firstKnown === -1) return null;
  const trusted = rows.slice(firstKnown);
  if (trusted.length < 2) return null;

  const windowStart = trusted[0].date;
  const windowEnd = trusted[trusted.length - 1].date;
  const startCents = toCents(trusted[0].investmentTotal);
  const endCents = toCents(trusted[trusted.length - 1].investmentTotal);

  let coverageStepCents = 0;
  let stepsKnown = true;
  for (let i = 1; i < trusted.length; i++) {
    if (!boundaryBetween(trusted[i - 1], trusted[i])) continue;
    const step = stepForGap(events, trusted[i - 1].date, trusted[i].date, true);
    if (step === null) stepsKnown = false;
    else coverageStepCents += toCents(step);
  }

  // Flows strictly after the start date (the start snapshot already contains
  // that day's money) through the end date.
  let contributionCents = 0;
  let withdrawalCents = 0;
  for (const flow of flows) {
    if (flow.date <= windowStart || flow.date > windowEnd) continue;
    if (flow.kind === "contribution") contributionCents += flow.cents;
    else withdrawalCents += flow.cents;
  }

  const marketCents =
    endCents - startCents - contributionCents + withdrawalCents - coverageStepCents;

  return {
    windowStart,
    windowEnd,
    start: fromCents(startCents),
    contributions: fromCents(contributionCents),
    withdrawals: fromCents(withdrawalCents),
    marketPnl: stepsKnown ? fromCents(marketCents) : null,
    coverageSteps: fromCents(coverageStepCents),
    end: fromCents(endCents),
  };
}

const MIN_XIRR_DAYS = 30;

function daysBetween(a: string, b: string): number {
  return (
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
    86400000
  );
}

/**
 * Money-weighted annualized return. Convention: the start value is treated as
 * an outflow at windowStart, contributions as outflows on their dates,
 * withdrawals and the end value as inflows. Solved by bisection (cannot
 * diverge). Null for windows under 30 days (annualizing noise) or when no
 * rate in (-99.9%, +1000%) fits.
 */
export function computeXirr(
  flows: InvestmentFlow[],
  startValue: number,
  startDate: string,
  endValue: number,
  endDate: string
): number | null {
  const totalDays = daysBetween(startDate, endDate);
  if (totalDays < MIN_XIRR_DAYS) return null;

  const cashflows: Array<{ t: number; amount: number }> = [
    { t: 0, amount: -startValue },
    ...flows
      .filter((f) => f.date > startDate && f.date <= endDate)
      .map((f) => ({
        t: daysBetween(startDate, f.date) / 365,
        amount: f.kind === "contribution" ? -f.cents / 100 : f.cents / 100,
      })),
    { t: totalDays / 365, amount: endValue },
  ];

  const npv = (rate: number) =>
    cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, cf.t), 0);

  let lo = -0.999;
  let hi = 10;
  let npvLo = npv(lo);
  const npvHi = npv(hi);
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (npvLo * npvHi > 0) return null; // no sign change: no solvable rate

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-7 || hi - lo < 1e-9) return mid;
    if (value * npvLo < 0) {
      hi = mid;
    } else {
      lo = mid;
      npvLo = value;
    }
  }
  return (lo + hi) / 2;
}

export interface DividendRowInput {
  date: string;
  /** Plaid sign convention: dividends credit cash, so amounts are negative. */
  amount: string;
  subtype: string | null;
}

export interface Dividends {
  trailingTwelveMonths: string;
  monthly: Array<{ month: string; total: string }>;
}

// Cash dividend subtypes. "dividend reinvestment" is deliberately absent: it
// is the purchase side of a reinvested dividend and would net the income
// back toward zero.
const DIVIDEND_SUBTYPES = new Set([
  "dividend",
  "qualified dividend",
  "non-qualified dividend",
]);

/**
 * Dividend income by month over the trailing twelve calendar months up to
 * `today`, zero-filled. Income is the credited cash (sign flipped).
 */
export function computeDividends(
  rows: DividendRowInput[],
  today: string
): Dividends {
  const year = Number.parseInt(today.slice(0, 4), 10);
  const month = Number.parseInt(today.slice(5, 7), 10);
  const window: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const total = year * 12 + (month - 1) - i;
    window.push(
      `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
    );
  }

  const byMonth = new Map<string, number>(window.map((m) => [m, 0]));
  for (const row of rows) {
    if (row.subtype === null || !DIVIDEND_SUBTYPES.has(row.subtype)) continue;
    const bucket = row.date.slice(0, 7);
    if (!byMonth.has(bucket)) continue;
    byMonth.set(bucket, (byMonth.get(bucket) ?? 0) + -toCents(row.amount));
  }

  let trailing = 0;
  const monthly = window.map((m) => {
    const cents = byMonth.get(m) ?? 0;
    trailing += cents;
    return { month: m, total: fromCents(cents) };
  });

  return { trailingTwelveMonths: fromCents(trailing), monthly };
}

export interface HoldingRowInput {
  accountId: string;
  accountName: string;
  securityId: string;
  tickerSymbol: string | null;
  name: string;
  value: string;
  costBasis: string | null;
  /** Plaid securities[].type, e.g. "cash", "etf", "equity". */
  securityType: string | null;
  isCashEquivalent: boolean | null;
}

/** Cash / cash-equivalent per Plaid's authoritative security metadata. */
function isCashPosition(row: HoldingRowInput): boolean {
  return row.isCashEquivalent === true || row.securityType === "cash";
}

export interface UnrealizedPosition {
  accountId: string;
  account: string;
  securityId: string;
  ticker: string | null;
  name: string;
  value: string;
  cost: string;
  gain: string;
  gainPct: string;
}

export interface Unrealized {
  total: {
    value: string;
    cost: string;
    gain: string;
    gainPct: string;
    /** Uninvested cash and cash equivalents; no gain to measure. */
    cashValue: string;
    /** Value in non-cash positions without cost basis (genuinely missing data). */
    excludedValue: string;
  };
  byAccount: Array<{
    accountId: string;
    name: string;
    value: string;
    cost: string;
    gain: string;
    gainPct: string;
  }>;
  positions: UnrealizedPosition[];
}

export interface AllocationSlice {
  /** Plaid security type ("equity", "etf", "cash", ...) or "other" when null. */
  type: string;
  value: string;
  /** Percent of total portfolio value, e.g. "51.6". */
  share: string;
  count: number;
}

/**
 * Portfolio allocation by Plaid security type over ALL holdings (cash and
 * basis-less positions included — allocation is about where the money sits,
 * not what it gained). Sorted by value descending.
 */
export function computeAllocation(rows: HoldingRowInput[]): AllocationSlice[] {
  const byType = new Map<string, { cents: number; count: number }>();
  let totalCents = 0;
  for (const row of rows) {
    const type = row.securityType ?? "other";
    const cents = toCents(row.value);
    totalCents += cents;
    const entry = byType.get(type) ?? { cents: 0, count: 0 };
    entry.cents += cents;
    entry.count += 1;
    byType.set(type, entry);
  }
  return [...byType.entries()]
    .map(([type, { cents, count }]) => ({
      type,
      value: fromCents(cents),
      share: totalCents > 0 ? ((cents / totalCents) * 100).toFixed(1) : "0.0",
      count,
    }))
    .sort((a, b) => Number.parseFloat(b.value) - Number.parseFloat(a.value));
}

/**
 * Unrealized gains versus cost basis, over invested positions only. Cash and
 * cash equivalents have no gain to measure and would only dilute the
 * percentage, so they are summed separately as cashValue. Non-cash positions
 * without a basis are excluded from gain figures (null-as-zero would
 * fabricate a +100% gain) and surfaced via excludedValue.
 */
export function computeUnrealized(rows: HoldingRowInput[]): Unrealized {
  const cashCents = rows
    .filter(isCashPosition)
    .reduce((sum, r) => sum + toCents(r.value), 0);
  const invested = rows.filter((r) => !isCashPosition(r));
  const withBasis = invested.filter((r) => r.costBasis !== null);
  const excludedCents = invested
    .filter((r) => r.costBasis === null)
    .reduce((sum, r) => sum + toCents(r.value), 0);

  const pct = (gain: number, cost: number) =>
    cost > 0 ? ((gain / cost) * 100).toFixed(1) : "0.0";

  const positions: UnrealizedPosition[] = withBasis
    .map((r) => {
      const value = toCents(r.value);
      const cost = toCents(r.costBasis);
      return {
        accountId: r.accountId,
        account: r.accountName,
        securityId: r.securityId,
        ticker: r.tickerSymbol,
        name: r.name,
        value: fromCents(value),
        cost: fromCents(cost),
        gain: fromCents(value - cost),
        gainPct: pct(value - cost, cost),
      };
    })
    .sort((a, b) => Number.parseFloat(b.value) - Number.parseFloat(a.value));

  const accountMap = new Map<string, { name: string; value: number; cost: number }>();
  for (const r of withBasis) {
    const entry = accountMap.get(r.accountId) ?? {
      name: r.accountName,
      value: 0,
      cost: 0,
    };
    entry.value += toCents(r.value);
    entry.cost += toCents(r.costBasis);
    accountMap.set(r.accountId, entry);
  }
  const byAccount = [...accountMap.entries()]
    .map(([accountId, a]) => ({
      accountId,
      name: a.name,
      value: fromCents(a.value),
      cost: fromCents(a.cost),
      gain: fromCents(a.value - a.cost),
      gainPct: pct(a.value - a.cost, a.cost),
    }))
    .sort((a, b) => Number.parseFloat(b.gainPct) - Number.parseFloat(a.gainPct));

  const totalValue = withBasis.reduce((sum, r) => sum + toCents(r.value), 0);
  const totalCost = withBasis.reduce((sum, r) => sum + toCents(r.costBasis), 0);

  return {
    total: {
      value: fromCents(totalValue),
      cost: fromCents(totalCost),
      gain: fromCents(totalValue - totalCost),
      gainPct: pct(totalValue - totalCost, totalCost),
      cashValue: fromCents(cashCents),
      excludedValue: fromCents(excludedCents),
    },
    byAccount,
    positions,
  };
}
