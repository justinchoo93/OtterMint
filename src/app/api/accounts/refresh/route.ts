import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  accounts,
  plaidItems,
  manualAccounts,
  groupMembers,
} from "@/lib/db/schema";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { syncTransactions } from "@/lib/sync-transactions";
import { syncHoldings } from "@/lib/sync-holdings";
import { computeSnapshot, saveUserSnapshot, saveGroupSnapshot } from "@/lib/compute-snapshot";
import { eq, inArray } from "drizzle-orm";
import { PlaidError } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { enforceRateLimit } from "@/lib/rate-limit";

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

  const userItems = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  let refreshedCount = 0;
  const errors: { institutionName: string; error: string }[] = [];

  for (const item of userItems) {
    try {
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

  // Compute and save user snapshot
  try {
    const userPlaidItems = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.userId, userId));
    const userItemIds = userPlaidItems.map((i) => i.id);

    const userAccounts =
      userItemIds.length > 0
        ? await db
            .select()
            .from(accounts)
            .where(inArray(accounts.plaidItemId, userItemIds))
        : [];

    const userManual = await db
      .select()
      .from(manualAccounts)
      .where(eq(manualAccounts.userId, userId));

    const snapshotData = computeSnapshot(userAccounts, userManual);
    await saveUserSnapshot(userId, snapshotData);

    // Also recompute group snapshots for any groups this user is in
    const userGroups = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    for (const { groupId } of userGroups) {
      try {
        // Get all member user IDs in this group
        const members = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, groupId));

        const memberIds = members.map((m) => m.userId);

        // Get all plaid items for group members
        const memberPlaidItems = await db
          .select()
          .from(plaidItems)
          .where(inArray(plaidItems.userId, memberIds));
        const memberItemIds = memberPlaidItems.map((i) => i.id);

        const groupPlaidAccounts =
          memberItemIds.length > 0
            ? await db
                .select()
                .from(accounts)
                .where(inArray(accounts.plaidItemId, memberItemIds))
            : [];

        const groupManualAccounts = await db
          .select()
          .from(manualAccounts)
          .where(inArray(manualAccounts.userId, memberIds));

        const groupSnapshot = computeSnapshot(
          groupPlaidAccounts,
          groupManualAccounts
        );
        await saveGroupSnapshot(groupId, groupSnapshot);
      } catch (err) {
        console.error(`Failed to save group snapshot for ${groupId}:`, err);
      }
    }
  } catch (err) {
    console.error("Failed to save snapshot:", err);
  }

  return NextResponse.json({
    success: true,
    refreshedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
