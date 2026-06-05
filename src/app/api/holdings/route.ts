import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { holdings, accounts, plaidItems } from "@/lib/db/schema";
import { eq, getTableColumns } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";

export type HoldingRow = {
  id: number;
  accountId: string;
  securityId: string;
  name: string;
  tickerSymbol: string | null;
  quantity: string;
  price: string;
  value: string;
  costBasis: string | null;
  isoCurrencyCode: string | null;
};

export async function GET() {
  try {
    const userId = await getUserId();

    const rows = await withUser(userId, (tx) =>
      tx
        .select({ ...getTableColumns(holdings) })
        .from(holdings)
        .innerJoin(accounts, eq(holdings.accountId, accounts.accountId))
        .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
        .where(eq(plaidItems.userId, userId))
    );

    const result: HoldingRow[] = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      securityId: row.securityId,
      name: row.name,
      tickerSymbol: row.tickerSymbol,
      quantity: row.quantity,
      price: row.price,
      value: row.value,
      costBasis: row.costBasis,
      isoCurrencyCode: row.isoCurrencyCode,
    }));

    return NextResponse.json({ holdings: result });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch holdings", error);
    return NextResponse.json(
      { error: "Failed to fetch holdings" },
      { status: 500 }
    );
  }
}
