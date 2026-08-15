import { eq } from "drizzle-orm";
import {
  accounts,
  accountBalanceSnapshots,
  holdings,
  holdingSnapshots,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/with-user";

/**
 * Capture today's per-account balances (all Plaid accounts) and per-holding
 * values (investment accounts) into the history tables. Daily upsert: the
 * last capture of a UTC day wins, matching user_net_worth_snapshots
 * semantics. History accrues from first deploy and is not reconstructible
 * backward. See docs/plans/investment-performance.md.
 */
export async function captureAccountSnapshots(
  userId: string,
  executor: DbExecutor
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const plaidAccounts = await executor
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  for (const account of plaidAccounts) {
    // A null balance means Plaid has no figure; skip rather than storing zero.
    if (account.currentBalance === null) continue;
    await executor
      .insert(accountBalanceSnapshots)
      .values({
        userId,
        accountId: account.accountId,
        date: today,
        balance: account.currentBalance,
        type: account.type,
        subtype: account.subtype,
      })
      .onConflictDoUpdate({
        target: [accountBalanceSnapshots.accountId, accountBalanceSnapshots.date],
        set: {
          balance: account.currentBalance,
          type: account.type,
          subtype: account.subtype,
        },
      });
  }

  const investmentAccountIds = new Set(
    plaidAccounts
      .filter((account) => account.type === "investment")
      .map((account) => account.accountId)
  );
  if (investmentAccountIds.size === 0) return;

  const userHoldings = await executor
    .select()
    .from(holdings)
    .where(eq(holdings.userId, userId));

  for (const holding of userHoldings) {
    if (!investmentAccountIds.has(holding.accountId)) continue;
    await executor
      .insert(holdingSnapshots)
      .values({
        userId,
        accountId: holding.accountId,
        securityId: holding.securityId,
        tickerSymbol: holding.tickerSymbol,
        quantity: holding.quantity,
        price: holding.price,
        value: holding.value,
        costBasis: holding.costBasis,
        date: today,
      })
      .onConflictDoUpdate({
        target: [
          holdingSnapshots.accountId,
          holdingSnapshots.securityId,
          holdingSnapshots.date,
        ],
        set: {
          tickerSymbol: holding.tickerSymbol,
          quantity: holding.quantity,
          price: holding.price,
          value: holding.value,
          costBasis: holding.costBasis,
        },
      });
  }
}
