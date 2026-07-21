import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";
import { plaidItems, accounts } from "@/lib/db/schema";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { logServerError } from "@/lib/logging";
import { FIELD_LIMITS, validateBoundedString } from "@/lib/validate-request";
import { syncTransactions } from "@/lib/sync-transactions";
import { syncHoldings } from "@/lib/sync-holdings";
import { eq } from "drizzle-orm";
import { AccountType } from "plaid";
import { saveCoverageEvent } from "@/lib/coverage-events";
import { plaidCoverageContribution } from "@/lib/net-worth-history";
import {
  recomputeGroupNetWorthSnapshotsForUser,
  recomputeUserNetWorthSnapshot,
} from "@/lib/recompute-net-worth";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { public_token, institution } = await request.json();

    if (typeof public_token !== "string" || public_token.trim().length === 0) {
      return NextResponse.json(
        { error: "public_token is required" },
        { status: 400 }
      );
    }

    if (typeof institution !== "object" || institution === null) {
      return NextResponse.json(
        { error: "institution is required" },
        { status: 400 }
      );
    }

    const idResult = validateBoundedString(
      institution.institution_id,
      "institution_id",
      FIELD_LIMITS.INSTITUTION_ID
    );
    if (!idResult.success) {
      return NextResponse.json({ error: idResult.error }, { status: 400 });
    }

    const nameResult = validateBoundedString(
      institution.name,
      "institution name",
      FIELD_LIMITS.INSTITUTION_NAME
    );
    if (!nameResult.success) {
      return NextResponse.json({ error: nameResult.error }, { status: 400 });
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    const { access_token, item_id } = exchangeResponse.data;

    // Encrypt the access token. Fetch the accounts (with balances) BEFORE opening
    // the per-user transaction so the external Plaid call does not hold the tx
    // open. Use /accounts/get, NOT /accounts/balance/get: the latter forces a
    // real-time refresh that requires the separate `balance` product entitlement
    // (which our production access does not include — it 400s INVALID_PRODUCT).
    // /accounts/get returns the same accounts+balances shape with no extra product.
    const encryptedToken = encrypt(access_token);
    const accountsResponse = await plaidClient.accountsGet({
      access_token,
    });

    // Insert the item and its accounts under the user's RLS scope so the
    // WITH CHECK on plaid_items/accounts passes and both writes are atomic.
    const plaidItem = await withUser(userId, async (tx) => {
      const [item] = await tx
        .insert(plaidItems)
        .values({
          userId,
          institutionId: institution.institution_id,
          institutionName: institution.name,
          accessTokenEncrypted: encryptedToken,
          itemId: item_id,
        })
        .returning();

      for (const acct of accountsResponse.data.accounts) {
        await tx.insert(accounts).values({
          userId,
          plaidItemId: item.id,
          accountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name ?? null,
          type: acct.type,
          subtype: acct.subtype ?? null,
          mask: acct.mask ?? null,
          currentBalance: acct.balances.current?.toString() ?? null,
          availableBalance: acct.balances.available?.toString() ?? null,
          limitAmount: acct.balances.limit?.toString() ?? null,
          isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
          lastRefreshedAt: new Date(),
        });

        await saveCoverageEvent(
          userId,
          {
            effectiveDate: new Date().toISOString().split("T")[0],
            ...plaidCoverageContribution({
              accountId: acct.account_id,
              type: acct.type,
              currentBalance: acct.balances.current?.toString() ?? null,
            }),
          },
          tx
        );
      }

      // The accounts, first-known coverage adjustments, fingerprint, and
      // canonical personal snapshot are one local transaction. Plaid history
      // sync remains best-effort below and cannot create a partial baseline.
      await recomputeUserNetWorthSnapshot(userId, tx);

      return item;
    });

    // Best-effort initial sync so transactions + holdings show up immediately
    // instead of only after the accounts go stale (the refresh route skips items
    // refreshed <2h ago, and the link above just stamped them fresh). Kept in a
    // SEPARATE transaction and swallowed on failure: a slow or erroring Plaid sync
    // right after linking must never roll back a successful link — anything missed
    // backfills on the next refresh.
    try {
      await withUser(userId, async (tx) => {
        const { nextCursor } = await syncTransactions(
          access_token,
          null,
          userId,
          tx
        );
        await tx
          .update(plaidItems)
          .set({ transactionsCursor: nextCursor, updatedAt: new Date() })
          .where(eq(plaidItems.id, plaidItem.id));

        const investmentAccountIds = accountsResponse.data.accounts
          .filter((acct) => acct.type === AccountType.Investment)
          .map((acct) => acct.account_id);
        if (investmentAccountIds.length > 0) {
          await syncHoldings(access_token, investmentAccountIds, userId, tx);
        }
      });
    } catch (err) {
      logServerError(
        "Initial sync after link failed (will backfill on refresh)",
        err
      );
    }

    try {
      await withUser(userId, (tx) =>
        recomputeGroupNetWorthSnapshotsForUser(userId, tx)
      );
    } catch (err) {
      logServerError("Group snapshot after link failed (will retry on refresh)", err);
    }

    return NextResponse.json({ success: true, itemId: plaidItem.id });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to exchange token", error);
    return NextResponse.json(
      { error: "Failed to exchange token" },
      { status: 500 }
    );
  }
}
