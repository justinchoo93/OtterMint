import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, plaidItems, manualAccounts } from "@/lib/db/schema";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { syncTransactions } from "@/lib/sync-transactions";
import { syncHoldings } from "@/lib/sync-holdings";
import { computeSnapshot, saveSnapshot } from "@/lib/compute-snapshot";
import { eq } from "drizzle-orm";
import { PlaidError } from "plaid";

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

function isPlaidError(err: unknown): err is { response: { data: PlaidError } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as Record<string, unknown>).response === "object"
  );
}

export async function POST() {
  const allItems = await db.select().from(plaidItems);
  let refreshedCount = 0;
  const errors: { institutionName: string; error: string }[] = [];

  for (const item of allItems) {
    try {
      // Check if any account for this item is stale
      const itemAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.plaidItemId, item.id));

      const isStale = itemAccounts.some((acct) => {
        if (!acct.lastRefreshedAt) return true;
        return Date.now() - acct.lastRefreshedAt.getTime() > STALE_THRESHOLD_MS;
      });

      if (!isStale && itemAccounts.length > 0) continue;

      const accessToken = decrypt(item.accessTokenEncrypted);

      // Refresh balances
      const balanceResponse = await plaidClient.accountsBalanceGet({
        access_token: accessToken,
      });

      for (const plaidAcct of balanceResponse.data.accounts) {
        await db
          .update(accounts)
          .set({
            currentBalance: plaidAcct.balances.current?.toString() ?? null,
            availableBalance: plaidAcct.balances.available?.toString() ?? null,
            limitAmount: plaidAcct.balances.limit?.toString() ?? null,
            lastRefreshedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(accounts.accountId, plaidAcct.account_id));
      }

      // Sync transactions
      const syncResult = await syncTransactions(
        accessToken,
        item.transactionsCursor
      );

      // Update cursor and clear any previous errors
      await db
        .update(plaidItems)
        .set({
          transactionsCursor: syncResult.nextCursor,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.id, item.id));

      // Sync holdings for investment accounts
      const investmentAccountIds = itemAccounts
        .filter((a) => a.type === "investment")
        .map((a) => a.accountId);

      if (investmentAccountIds.length > 0) {
        await syncHoldings(accessToken, investmentAccountIds);
      }

      refreshedCount++;
    } catch (err) {
      // Handle Plaid-specific errors (e.g. ITEM_LOGIN_REQUIRED)
      if (isPlaidError(err)) {
        const plaidErr = err.response.data;
        const errorCode = plaidErr.error_code ?? "UNKNOWN";
        const errorMessage = plaidErr.error_message ?? "Unknown Plaid error";

        await db
          .update(plaidItems)
          .set({
            errorCode,
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(plaidItems.id, item.id));

        errors.push({
          institutionName: item.institutionName,
          error: errorCode,
        });
        console.error(
          `Plaid error for ${item.institutionName}: ${errorCode} - ${errorMessage}`
        );
      } else {
        console.error(`Failed to refresh ${item.institutionName}:`, err);
        errors.push({
          institutionName: item.institutionName,
          error: "REFRESH_FAILED",
        });
      }
    }
  }

  // Always compute and save snapshot (even if some items failed)
  try {
    const allAccounts = await db.select().from(accounts);
    const allManual = await db.select().from(manualAccounts);
    const snapshotData = computeSnapshot(allAccounts, allManual);
    await saveSnapshot(snapshotData);
  } catch (err) {
    console.error("Failed to save snapshot:", err);
  }

  return NextResponse.json({
    success: true,
    refreshedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
