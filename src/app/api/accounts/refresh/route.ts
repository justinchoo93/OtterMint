import { NextResponse } from "next/server";
import {
  accounts,
  plaidItems,
} from "@/lib/db/schema";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { syncTransactions } from "@/lib/sync-transactions";
import { syncHoldings } from "@/lib/sync-holdings";
import { eq } from "drizzle-orm";
import { PlaidError } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logServerError } from "@/lib/logging";
import {
  recomputeGroupNetWorthSnapshotsForUser,
  recomputeUserNetWorthSnapshot,
} from "@/lib/recompute-net-worth";

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
  let userId: string;
  try {
    userId = await getUserId();
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const limited = await enforceRateLimit("accountsRefresh", userId);
  if (limited) return limited;

  let refreshedCount = 0;
  const errors: { institutionName: string; error: string }[] = [];

  // All DB work runs under the caller's RLS context. The single transaction
  // wraps the per-item refresh + sync writers and the snapshot recompute;
  // the group-snapshot block relies on the group-aware read policies to see
  // fellow members' financial rows.
  await withUser(userId, async (tx) => {
  const userItems = await tx
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  for (const item of userItems) {
    try {
      const itemAccounts = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.plaidItemId, item.id));

      const isStale = itemAccounts.some((acct) => {
        if (!acct.lastRefreshedAt) return true;
        return Date.now() - acct.lastRefreshedAt.getTime() > STALE_THRESHOLD_MS;
      });

      if (!isStale && itemAccounts.length > 0) continue;

      const accessToken = decrypt(item.accessTokenEncrypted);

      // Fetch accounts + balances. Use /accounts/get, NOT /accounts/balance/get:
      // the latter forces a real-time refresh that needs the `balance` product
      // entitlement our production access lacks (400 INVALID_PRODUCT). /accounts/get
      // returns the same shape (balances as of Plaid's last update) with no extra
      // product; syncTransactions below prompts Plaid to keep the item current.
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      for (const plaidAcct of accountsResponse.data.accounts) {
        await tx
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
        item.transactionsCursor,
        userId,
        tx
      );

      await tx
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
        await syncHoldings(accessToken, investmentAccountIds, userId, tx);
      }

      refreshedCount++;
    } catch (err) {
      if (isPlaidError(err)) {
        const plaidErr = err.response.data;
        const errorCode = plaidErr.error_code ?? "UNKNOWN";
        const errorMessage = plaidErr.error_message ?? "Unknown Plaid error";

        await tx
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
        logServerError(
          `Plaid error for ${item.institutionName}: ${errorCode}`,
          undefined
        );
      } else {
        logServerError(`Failed to refresh ${item.institutionName}`, err);
        errors.push({
          institutionName: item.institutionName,
          error: "REFRESH_FAILED",
        });
      }
    }
  }

  // Persist the refreshed totals and source-set fingerprint. Group snapshots
  // remain best-effort so one household issue cannot discard a successful
  // personal refresh.
  try {
    await recomputeUserNetWorthSnapshot(userId, tx);
  } catch (err) {
    logServerError("Failed to save user snapshot", err);
  }

  try {
    await recomputeGroupNetWorthSnapshotsForUser(userId, tx);
  } catch (err) {
    logServerError("Failed to save group snapshots", err);
  }
  });

  return NextResponse.json({
    success: true,
    refreshedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
