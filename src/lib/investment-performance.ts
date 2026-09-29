// Pure investment-performance math. No server-only imports: the API route
// feeds it rows, the UI imports its types. Design and honesty rules are in
// docs/plans/investment-performance.md — in particular: math never trusts
// snapshot rows without a coverage fingerprint (the "legacy" region), and a
// fingerprint change is a measurement boundary, never market movement.


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

function toCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
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

export interface AccountFeedRow {
  accountId: string;
  date: string; // YYYY-MM-DD
  /** Plaid sign: positive = cash out of the account. */
  amount: string;
  type: string;
  subtype: string | null;
}

export interface AccountInfoRow {
  accountId: string;
  name: string;
  mask: string | null;
  currentBalance: string | null;
  /** YYYY-MM-DD of plaid_items.created_at; proxy for the feed backfill start. */
  itemCreatedAt: string;
}

export interface AccountNetGain {
  accountId: string;
  name: string;
  mask: string | null;
  mode: "lifetime" | "anchored" | "none";
  /** Inception (lifetime) or anchor snapshot date; null for none. */
  startDate: string | null;
  /** Window-scoped, positive magnitudes. */
  contributions: string;
  withdrawals: string;
  netContributions: string;
  balance: string;
  gain: string | null;
  gainPct: string | null;
  contributionSeries: Array<{ date: string; cumulative: string }>;
  balanceSeries: Array<{ date: string; value: string }>;
}

// External cash movements, matched on subtype alone — Plaid's type field
// drifts across institutions. Corporate actions and option mechanics
// (split, merger, spin off, assignment, exercise) are deliberately absent.
const EXTERNAL_FLOW_SUBTYPES = new Set([
  "transfer",
  "deposit",
  "withdrawal",
  "contribution",
  "distribution",
]);

function isExternalFlow(row: AccountFeedRow): boolean {
  return (
    row.subtype !== null && EXTERNAL_FLOW_SUBTYPES.has(row.subtype.toLowerCase())
  );
}

const BACKFILL_MONTHS = 24;
const BACKFILL_MARGIN_DAYS = 7;

/** Earliest first-transaction date compatible with a birth we witnessed. */
function backfillThreshold(itemCreatedAt: string): string {
  const d = new Date(itemCreatedAt + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - BACKFILL_MONTHS);
  d.setUTCDate(d.getUTCDate() + BACKFILL_MARGIN_DAYS);
  return d.toISOString().split("T")[0];
}

/**
 * True net gain per account: balance minus net external contributions, which
 * by identity includes realized and unrealized gains, dividends, and interest.
 * "Lifetime" only when the account's birth is provably inside the feed: the
 * holdings cash rows reconcile the feed to exactly zero, the earliest feed row
 * is an external cash-in, and it postdates the item's backfill start by a
 * margin. Otherwise the figure anchors at the earliest balance snapshot, or is
 * withheld entirely. Rules and evidence: docs/plans/account-net-gain.md.
 */
export function computeAccountNetGains(
  feedRows: AccountFeedRow[],
  accountRows: AccountInfoRow[],
  holdingRows: HoldingRowInput[],
  snapshotRows: AccountSnapshotRow[],
  today: string
): AccountNetGain[] {
  const feedByAccount = new Map<string, AccountFeedRow[]>();
  for (const row of feedRows) {
    const list = feedByAccount.get(row.accountId) ?? [];
    list.push(row);
    feedByAccount.set(row.accountId, list);
  }
  const snapshotsByAccount = new Map<string, AccountSnapshotRow[]>();
  for (const row of snapshotRows) {
    const list = snapshotsByAccount.get(row.accountId) ?? [];
    list.push(row);
    snapshotsByAccount.set(row.accountId, list);
  }

  const results: AccountNetGain[] = [];
  for (const account of accountRows) {
    if (account.currentBalance === null) continue;
    const balanceCents = toCents(account.currentBalance);

    const rows = [...(feedByAccount.get(account.accountId) ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    const accountHoldings = holdingRows.filter(
      (h) => h.accountId === account.accountId
    );
    const cashCents = accountHoldings
      .filter(isCashPosition)
      .reduce((sum, h) => sum + toCents(h.value), 0);
    const feedSumCents = rows.reduce((sum, r) => sum + toCents(r.amount), 0);

    const first = rows[0];
    const lifetime =
      accountHoldings.length > 0 &&
      rows.length > 0 &&
      cashCents + feedSumCents === 0 &&
      isExternalFlow(first) &&
      toCents(first.amount) < 0 &&
      first.date >= backfillThreshold(account.itemCreatedAt);

    const snapshots = [...(snapshotsByAccount.get(account.accountId) ?? [])].sort(
      (a, b) => (a.date < b.date ? -1 : 1)
    );
    const anchor = snapshots[0];

    let mode: AccountNetGain["mode"];
    let startDate: string | null;
    let anchorCents = 0;
    if (lifetime) {
      mode = "lifetime";
      startDate = first.date;
    } else if (anchor) {
      mode = "anchored";
      startDate = anchor.date;
      anchorCents = toCents(anchor.balance);
    } else {
      mode = "none";
      startDate = null;
    }

    // Anchored windows count flows strictly after the anchor: the anchor
    // snapshot already contains that day's money (the same convention as the
    // stretch summary in src/lib/investments-model.ts).
    const externals = rows.filter(isExternalFlow);
    const windowExternals =
      mode === "anchored"
        ? externals.filter((r) => r.date > startDate!)
        : externals;

    let contributionCents = 0;
    let withdrawalCents = 0;
    for (const row of windowExternals) {
      const cents = toCents(row.amount);
      if (cents < 0) contributionCents += -cents;
      else withdrawalCents += cents;
    }
    const netContributionCents = contributionCents - withdrawalCents;

    let gainCents: number | null = null;
    let baseCents = 0;
    if (mode === "lifetime") {
      gainCents = balanceCents - netContributionCents;
      baseCents = netContributionCents;
    } else if (mode === "anchored") {
      gainCents = balanceCents - anchorCents - netContributionCents;
      baseCents = anchorCents + netContributionCents;
    }

    const contributionSeries: Array<{ date: string; cumulative: string }> = [];
    if (mode === "anchored") {
      contributionSeries.push({ date: startDate!, cumulative: "0.00" });
    }
    let running = 0;
    for (const row of windowExternals) {
      running += -toCents(row.amount);
      const last = contributionSeries[contributionSeries.length - 1];
      if (last && last.date === row.date) {
        last.cumulative = fromCents(running);
      } else {
        contributionSeries.push({ date: row.date, cumulative: fromCents(running) });
      }
    }
    const lastContribution = contributionSeries[contributionSeries.length - 1];
    if (lastContribution && lastContribution.date !== today) {
      contributionSeries.push({ date: today, cumulative: lastContribution.cumulative });
    }

    const balanceSeries: Array<{ date: string; value: string }> = snapshots
      .filter((s) => startDate === null || s.date >= startDate)
      .map((s) => ({ date: s.date, value: fromCents(toCents(s.balance)) }));
    const lastBalance = balanceSeries[balanceSeries.length - 1];
    if (lastBalance && lastBalance.date === today) {
      lastBalance.value = fromCents(balanceCents);
    } else {
      balanceSeries.push({ date: today, value: fromCents(balanceCents) });
    }

    results.push({
      accountId: account.accountId,
      name: account.name,
      mask: account.mask,
      mode,
      startDate,
      contributions: fromCents(contributionCents),
      withdrawals: fromCents(withdrawalCents),
      netContributions: fromCents(netContributionCents),
      balance: fromCents(balanceCents),
      gain: gainCents === null ? null : fromCents(gainCents),
      gainPct:
        gainCents !== null && baseCents > 0
          ? ((gainCents / baseCents) * 100).toFixed(1)
          : null,
      contributionSeries,
      balanceSeries,
    });
  }

  return results.sort(
    (a, b) => Number.parseFloat(b.balance) - Number.parseFloat(a.balance)
  );
}
