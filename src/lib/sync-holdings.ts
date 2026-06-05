import { plaidClient } from "@/lib/plaid";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

interface SyncHoldingsResult {
  count: number;
}

export async function syncHoldings(
  accessToken: string,
  investmentAccountIds: string[],
  userId: string
): Promise<SyncHoldingsResult> {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });

  const { holdings: plaidHoldings, securities } = response.data;

  // Build security lookup
  const securityMap = new Map(
    securities.map((s) => [s.security_id, s])
  );

  // Delete existing holdings for these investment accounts
  if (investmentAccountIds.length > 0) {
    await db
      .delete(holdings)
      .where(inArray(holdings.accountId, investmentAccountIds));
  }

  // Insert fresh holdings
  for (const holding of plaidHoldings) {
    const security = securityMap.get(holding.security_id);

    await db.insert(holdings).values({
      userId,
      accountId: holding.account_id,
      securityId: holding.security_id,
      name: security?.name ?? "Unknown Security",
      tickerSymbol: security?.ticker_symbol ?? null,
      quantity: holding.quantity.toString(),
      price: holding.institution_price.toString(),
      value: holding.institution_value.toString(),
      costBasis: holding.cost_basis?.toString() ?? null,
      isoCurrencyCode: holding.iso_currency_code ?? "USD",
    });
  }

  return { count: plaidHoldings.length };
}
