import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { plaidItems, accounts } from "@/lib/db/schema";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { logServerError } from "@/lib/logging";
import { FIELD_LIMITS, validateBoundedString } from "@/lib/validate-request";

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

    // Encrypt and store the access token
    const encryptedToken = encrypt(access_token);
    const [plaidItem] = await db
      .insert(plaidItems)
      .values({
        userId,
        institutionId: institution.institution_id,
        institutionName: institution.name,
        accessTokenEncrypted: encryptedToken,
        itemId: item_id,
      })
      .returning();

    // Fetch initial accounts and balances
    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token,
    });

    for (const acct of balanceResponse.data.accounts) {
      await db.insert(accounts).values({
        userId,
        plaidItemId: plaidItem.id,
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
