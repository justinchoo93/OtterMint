import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { logServerError } from "@/lib/logging";
import {
  accounts,
  accountBalanceSnapshots,
  holdings,
  holdingSnapshots,
  investmentTransactions,
  manualAccounts,
  plaidItems,
  userNetWorthSnapshots,
} from "@/lib/db/schema";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import {
  buildPortfolioSeries,
  computeAccountNetGains,
  type AggregateRow,
  type AccountSnapshotRow,
  type HoldingRowInput,
} from "@/lib/investment-performance";
import { computeUserCoverageFingerprint } from "@/lib/net-worth-history";
import {
  classifyFeedRow,
  type InvestmentAccount,
  type InvestmentActivity,
  type InvestmentPosition,
  type InvestmentsResponse,
} from "@/lib/investments-model";

export type { InvestmentsResponse } from "@/lib/investments-model";

const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;
const ACTIVITY_CAP = 200;

function toCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function byDate<T extends { date: string }>(a: T, b: T): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** The twelve calendar months ending in `today`'s month, as "YYYY-MM". */
function trailingTwelveMonths(today: string): Set<string> {
  const year = Number.parseInt(today.slice(0, 4), 10);
  const month = Number.parseInt(today.slice(5, 7), 10);
  const window = new Set<string>();
  for (let i = 11; i >= 0; i--) {
    const total = year * 12 + (month - 1) - i;
    window.add(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return window;
}

interface FeedRow {
  id: number;
  accountId: string;
  securityId: string | null;
  date: string;
  name: string;
  amount: string;
  type: string;
  subtype: string | null;
  quantity: string | null;
  price: string | null;
}

interface AccountRow {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  currentBalance: string | null;
  institutionName: string;
  itemCreatedAt: Date;
}

interface HoldingSnapshotRow {
  accountId: string;
  securityId: string;
  date: string;
  price: string;
}

type HoldingRow = HoldingRowInput & { quantity: string; price: string };

/**
 * Assemble the page's response from the raw rows. Pure, so the route test can
 * exercise every branch through GET with queued rows.
 */
function buildResponse(input: {
  since: string;
  today: string;
  aggregateRows: AggregateRow[];
  accountRows: AccountRow[];
  feedRows: FeedRow[];
  holdingRows: HoldingRow[];
  holdingSnapshotRows: HoldingSnapshotRow[];
  balanceSnapshotRows: AccountSnapshotRow[];
  plaidAccountIds: string[];
  manualAccountIds: number[];
}): InvestmentsResponse {
  const { since, today } = input;

  // The aggregate line: coverage segments from the fingerprints, then today's
  // live total when nothing about the covered set changed since the last capture.
  const series = buildPortfolioSeries(input.aggregateRows, [], []);
  const points = [...series.points];
  const lastAggregate = [...input.aggregateRows]
    .filter((r) => r.investmentTotal !== null)
    .sort(byDate)
    .at(-1);
  const liveCents = input.accountRows.reduce((sum, a) => sum + toCents(a.currentBalance), 0);
  const fingerprint = computeUserCoverageFingerprint(input.plaidAccountIds, input.manualAccountIds);
  const lastPoint = points.at(-1);
  let liveAppended = false;
  if (lastPoint && lastAggregate && lastPoint.date < today && lastAggregate.coverageFingerprint === fingerprint) {
    points.push({ date: today, value: fromCents(liveCents), segment: lastPoint.segment, quality: "known" });
    liveAppended = true;
  }

  // Per-account lines and lifetime net gain.
  const netGains = new Map(
    computeAccountNetGains(
      input.feedRows.map((r) => ({ accountId: r.accountId, date: r.date, amount: r.amount, type: r.type, subtype: r.subtype })),
      input.accountRows.map((a) => ({
        accountId: a.accountId,
        name: a.name,
        mask: a.mask,
        currentBalance: a.currentBalance,
        itemCreatedAt: a.itemCreatedAt.toISOString().split("T")[0],
      })),
      input.holdingRows,
      input.balanceSnapshotRows,
      today
    ).map((gain) => [gain.accountId, gain] as const)
  );
  const accountsOut: InvestmentAccount[] = input.accountRows.map((account) => {
    const accountPoints = input.balanceSnapshotRows
      .filter((s) => s.accountId === account.accountId && s.date >= since)
      .sort(byDate)
      .map((s) => ({ date: s.date, value: fromCents(toCents(s.balance)) }));
    if (account.currentBalance !== null) {
      const live = { date: today, value: fromCents(toCents(account.currentBalance)) };
      const last = accountPoints.at(-1);
      if (last && last.date === today) accountPoints[accountPoints.length - 1] = live;
      else accountPoints.push(live);
    }
    const gain = netGains.get(account.accountId);
    return {
      accountId: account.accountId,
      name: account.name,
      mask: account.mask,
      institutionName: account.institutionName,
      subtype: account.subtype,
      balance: fromCents(toCents(account.currentBalance)),
      points: accountPoints,
      netGain: gain
        ? { mode: gain.mode, startDate: gain.startDate, netContributions: gain.netContributions, gain: gain.gain, gainPct: gain.gainPct }
        : { mode: "none", startDate: null, netContributions: "0.00", gain: null, gainPct: null },
    };
  });

  // The feed, classified on subtype alone (Plaid's type drifts by institution).
  const classified = input.feedRows.map((row) => ({ row, kind: classifyFeedRow(row) }));
  const inWindow = classified.filter(({ row }) => row.date >= since);
  const flows = inWindow
    .filter(({ kind }) => kind === "deposit" || kind === "withdrawal")
    .map(({ row, kind }) => ({
      date: row.date,
      accountId: row.accountId,
      kind: kind as "deposit" | "withdrawal",
      amount: fromCents(Math.abs(toCents(row.amount))),
    }))
    .sort(byDate);
  const isIncome = (kind: string) => kind === "dividend" || kind === "interest";
  const income = inWindow
    .filter(({ kind }) => isIncome(kind))
    .map(({ row, kind }) => ({
      date: row.date,
      accountId: row.accountId,
      kind: kind as "dividend" | "interest",
      amount: fromCents(-toCents(row.amount)),
    }))
    .sort(byDate);
  const months = trailingTwelveMonths(today);
  const ttm = new Map<string, number>();
  for (const { row, kind } of classified) {
    if (!isIncome(kind) || !months.has(row.date.slice(0, 7))) continue;
    ttm.set(row.accountId, (ttm.get(row.accountId) ?? 0) + -toCents(row.amount));
  }
  const incomeTrailingTwelveMonths = input.accountRows.map((a) => ({
    accountId: a.accountId,
    amount: fromCents(ttm.get(a.accountId) ?? 0),
  }));
  const activityAll: InvestmentActivity[] = inWindow
    .map(({ row, kind }) => ({
      id: row.id,
      date: row.date,
      accountId: row.accountId,
      kind,
      name: row.name,
      amount: fromCents(-toCents(row.amount)),
      quantity: row.quantity,
      price: row.price,
      securityId: row.securityId,
    }))
    .sort((a, b) => byDate(b, a) || b.id - a.id);

  // Positions with the earliest in-window snapshot price for the range change.
  const startByKey = new Map<string, HoldingSnapshotRow>();
  for (const snapshot of [...input.holdingSnapshotRows].filter((s) => s.date >= since).sort(byDate)) {
    const key = `${snapshot.accountId}\u001f${snapshot.securityId}`;
    if (!startByKey.has(key)) startByKey.set(key, snapshot);
  }
  const positions: InvestmentPosition[] = input.holdingRows.map((h) => {
    const start = startByKey.get(`${h.accountId}\u001f${h.securityId}`);
    return {
      accountId: h.accountId,
      accountName: h.accountName,
      securityId: h.securityId,
      tickerSymbol: h.tickerSymbol,
      name: h.name,
      securityType: h.securityType,
      isCashEquivalent: h.isCashEquivalent,
      quantity: h.quantity,
      price: h.price,
      value: h.value,
      costBasis: h.costBasis,
      startPrice: start?.price ?? null,
      startDate: start?.date ?? null,
    };
  });

  return {
    today,
    since,
    portfolio: { points, boundaries: series.boundaries.map((b) => ({ date: b.date })), liveAppended },
    accounts: accountsOut,
    flows,
    income,
    incomeTrailingTwelveMonths,
    positions,
    activity: activityAll.slice(0, ACTIVITY_CAP),
    activityTotal: activityAll.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsed = parseInt(searchParams.get("days") ?? String(DEFAULT_DAYS), 10);
    const days = Number.isNaN(parsed) ? DEFAULT_DAYS : Math.min(Math.max(parsed, 1), MAX_DAYS);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const sinceDate = new Date(now);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
    const since = sinceDate.toISOString().split("T")[0];

    const result = await withUser(userId, async (tx): Promise<InvestmentsResponse> => {
      // Query order matters: src/__tests__/investments-route.test.ts queues
      // mocked results in exactly this sequence.
      const aggregateRows = await tx
        .select({
          date: userNetWorthSnapshots.date,
          investmentTotal: userNetWorthSnapshots.investmentTotal,
          coverageFingerprint: userNetWorthSnapshots.coverageFingerprint,
        })
        .from(userNetWorthSnapshots)
        .where(and(eq(userNetWorthSnapshots.userId, userId), gte(userNetWorthSnapshots.date, since)));

      const accountRows = await tx
        .select({
          accountId: accounts.accountId,
          name: accounts.name,
          mask: accounts.mask,
          subtype: accounts.subtype,
          currentBalance: accounts.currentBalance,
          institutionName: plaidItems.institutionName,
          itemCreatedAt: plaidItems.createdAt,
        })
        .from(accounts)
        .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
        .where(and(eq(plaidItems.userId, userId), eq(accounts.type, "investment")));

      // The whole feed: lifetime net gain and trailing-twelve-month income need
      // history older than the window.
      const feedRows = await tx
        .select({
          id: investmentTransactions.id,
          accountId: investmentTransactions.accountId,
          securityId: investmentTransactions.securityId,
          date: investmentTransactions.date,
          name: investmentTransactions.name,
          amount: investmentTransactions.amount,
          type: investmentTransactions.type,
          subtype: investmentTransactions.subtype,
          quantity: investmentTransactions.quantity,
          price: investmentTransactions.price,
        })
        .from(investmentTransactions)
        .where(eq(investmentTransactions.userId, userId));

      const holdingRows = await tx
        .select({
          accountId: holdings.accountId,
          accountName: accounts.name,
          securityId: holdings.securityId,
          tickerSymbol: holdings.tickerSymbol,
          name: holdings.name,
          quantity: holdings.quantity,
          price: holdings.price,
          value: holdings.value,
          costBasis: holdings.costBasis,
          securityType: holdings.securityType,
          isCashEquivalent: holdings.isCashEquivalent,
        })
        .from(holdings)
        .innerJoin(accounts, eq(holdings.accountId, accounts.accountId))
        .where(eq(holdings.userId, userId));

      const holdingSnapshotRows = await tx
        .select({
          accountId: holdingSnapshots.accountId,
          securityId: holdingSnapshots.securityId,
          date: holdingSnapshots.date,
          price: holdingSnapshots.price,
        })
        .from(holdingSnapshots)
        .where(and(eq(holdingSnapshots.userId, userId), gte(holdingSnapshots.date, since)));

      const balanceSnapshotRows = await tx
        .select({
          accountId: accountBalanceSnapshots.accountId,
          name: accounts.name,
          date: accountBalanceSnapshots.date,
          balance: accountBalanceSnapshots.balance,
        })
        .from(accountBalanceSnapshots)
        .innerJoin(accounts, eq(accountBalanceSnapshots.accountId, accounts.accountId))
        .where(and(eq(accountBalanceSnapshots.userId, userId), eq(accountBalanceSnapshots.type, "investment")));

      // Today's coverage fingerprint, computed the way the snapshot capture does.
      const plaidAccountRows = await tx
        .select({ accountId: accounts.accountId })
        .from(accounts)
        .where(eq(accounts.userId, userId));
      const manualAccountRows = await tx
        .select({ id: manualAccounts.id })
        .from(manualAccounts)
        .where(eq(manualAccounts.userId, userId));

      return buildResponse({
        since,
        today,
        aggregateRows,
        accountRows,
        feedRows,
        holdingRows,
        holdingSnapshotRows,
        balanceSnapshotRows,
        plaidAccountIds: plaidAccountRows.map((r) => r.accountId),
        manualAccountIds: manualAccountRows.map((r) => r.id),
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to compute investment performance", error);
    return NextResponse.json(
      { error: "Failed to compute investment performance" },
      { status: 500 }
    );
  }
}
