import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { plaidItems, accounts } from "@/lib/db/schema";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { public_token, institution } = await request.json();

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
    console.error("Failed to exchange token:", error);
    return NextResponse.json(
      { error: "Failed to exchange token" },
      { status: 500 }
    );
  }
}
