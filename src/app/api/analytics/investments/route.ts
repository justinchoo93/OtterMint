import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import {
  accounts,
  accountBalanceSnapshots,
  holdings,
  investmentTransactions,
  userNetWorthCoverageEvents,
  userNetWorthSnapshots,
} from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
import {
  buildPortfolioSeries,
  computeAllocation,
  computeAttribution,
  computeDividends,
  computeUnrealized,
  computeXirr,
  extractInvestmentFlows,
  type AllocationSlice,
  type Attribution,
  type Dividends,
  type PortfolioSeries,
  type Unrealized,
} from "@/lib/investment-performance";

export type InvestmentsResponse = {
  series: PortfolioSeries;
  attribution: Attribution | null;
  /** Money-weighted annualized return, e.g. "0.1042"; null until computable. */
  xirr: string | null;
  unrealized: Unrealized;
  /** Individual contribution/withdrawal events for chart markers. */
  flows: Array<{ date: string; kind: "contribution" | "withdrawal"; amount: string }>;
  /** Dividend income over the trailing twelve months. */
  dividends: Dividends;
  /** Portfolio allocation by security type, all holdings included. */
  allocation: AllocationSlice[];
};

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsed = parseInt(searchParams.get("days") ?? "90", 10);
    const days = Number.isNaN(parsed)
      ? 90
      : Math.min(Math.max(parsed, 30), 730);

    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
    const since = sinceDate.toISOString().split("T")[0];

    const result = await withUser(userId, async (tx): Promise<InvestmentsResponse> => {
      const aggregateRows = await tx
        .select({
          date: userNetWorthSnapshots.date,
          investmentTotal: userNetWorthSnapshots.investmentTotal,
          coverageFingerprint: userNetWorthSnapshots.coverageFingerprint,
        })
        .from(userNetWorthSnapshots)
        .where(
          and(
            eq(userNetWorthSnapshots.userId, userId),
            gte(userNetWorthSnapshots.date, since)
          )
        );

      const accountRows = await tx
        .select({
          accountId: accountBalanceSnapshots.accountId,
          name: accounts.name,
          date: accountBalanceSnapshots.date,
          balance: accountBalanceSnapshots.balance,
        })
        .from(accountBalanceSnapshots)
        .innerJoin(
          accounts,
          eq(accountBalanceSnapshots.accountId, accounts.accountId)
        )
        .where(
          and(
            eq(accountBalanceSnapshots.userId, userId),
            eq(accountBalanceSnapshots.type, "investment"),
            gte(accountBalanceSnapshots.date, since)
          )
        );

      const eventRows = await tx
        .select({
          effectiveDate: userNetWorthCoverageEvents.effectiveDate,
          assetAdjustment: userNetWorthCoverageEvents.assetAdjustment,
        })
        .from(userNetWorthCoverageEvents)
        .where(
          and(
            eq(userNetWorthCoverageEvents.userId, userId),
            gte(userNetWorthCoverageEvents.effectiveDate, since)
          )
        );

      // Shared helper: user-scoped join with category-correction rules
      // applied, so corrected transfers reach extractInvestmentFlows.
      const flowRows = await selectClassifiedTransactionRows(tx, userId, since);

      // Dividends use their own trailing-12-month window, independent of the
      // chart's days parameter.
      const dividendSinceDate = new Date();
      dividendSinceDate.setUTCFullYear(dividendSinceDate.getUTCFullYear() - 1);
      const dividendRows = await tx
        .select({
          date: investmentTransactions.date,
          amount: investmentTransactions.amount,
          subtype: investmentTransactions.subtype,
        })
        .from(investmentTransactions)
        .where(
          and(
            eq(investmentTransactions.userId, userId),
            gte(
              investmentTransactions.date,
              dividendSinceDate.toISOString().split("T")[0]
            )
          )
        );

      const holdingRows = await tx
        .select({
          accountId: holdings.accountId,
          accountName: accounts.name,
          securityId: holdings.securityId,
          tickerSymbol: holdings.tickerSymbol,
          name: holdings.name,
          value: holdings.value,
          costBasis: holdings.costBasis,
          securityType: holdings.securityType,
          isCashEquivalent: holdings.isCashEquivalent,
        })
        .from(holdings)
        .innerJoin(accounts, eq(holdings.accountId, accounts.accountId))
        .where(eq(holdings.userId, userId));

      const flows = extractInvestmentFlows(flowRows);
      const series = buildPortfolioSeries(aggregateRows, accountRows, eventRows);
      const attribution = computeAttribution(aggregateRows, flows, eventRows);

      // XIRR only when the trusted window's flows are complete: market P&L
      // resolved AND no net coverage step (a connected account's balance is
      // not a user flow, so any non-zero step would corrupt the rate).
      let xirr: string | null = null;
      if (attribution?.marketPnl != null && attribution.coverageSteps === "0.00") {
        const rate = computeXirr(
          flows,
          Number.parseFloat(attribution.start),
          attribution.windowStart,
          Number.parseFloat(attribution.end),
          attribution.windowEnd
        );
        if (rate !== null) xirr = rate.toFixed(4);
      }

      return {
        series,
        attribution,
        xirr,
        unrealized: computeUnrealized(holdingRows),
        allocation: computeAllocation(holdingRows),
        flows: flows.map((flow) => ({
          date: flow.date,
          kind: flow.kind,
          amount: (flow.cents / 100).toFixed(2),
        })),
        dividends: computeDividends(
          dividendRows,
          new Date().toISOString().split("T")[0]
        ),
      };
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
