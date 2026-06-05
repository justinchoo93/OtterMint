import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import { accounts, plaidItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export type AccountWithInstitution = {
  id: number;
  accountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: string | null;
  availableBalance: string | null;
  limitAmount: string | null;
  isoCurrencyCode: string | null;
  lastRefreshedAt: string | null;
  institutionName: string;
  errorCode: string | null;
};

export type PlaidItemStatus = {
  id: number;
  itemId: string;
  institutionName: string;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function GET() {
  try {
    const userId = await getUserId();

    const allItems = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.userId, userId));

    const allAccounts: AccountWithInstitution[] = [];
    const itemStatuses: PlaidItemStatus[] = [];

    for (const item of allItems) {
      itemStatuses.push({
        id: item.id,
        itemId: item.itemId,
        institutionName: item.institutionName,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      });

      const itemAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.plaidItemId, item.id));

      for (const acct of itemAccounts) {
        allAccounts.push({
          id: acct.id,
          accountId: acct.accountId,
          name: acct.name,
          officialName: acct.officialName,
          type: acct.type,
          subtype: acct.subtype,
          mask: acct.mask,
          currentBalance: acct.currentBalance,
          availableBalance: acct.availableBalance,
          limitAmount: acct.limitAmount,
          isoCurrencyCode: acct.isoCurrencyCode,
          lastRefreshedAt: acct.lastRefreshedAt?.toISOString() ?? null,
          institutionName: item.institutionName,
          errorCode: item.errorCode,
        });
      }
    }

    return NextResponse.json({ accounts: allAccounts, itemStatuses });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch accounts", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
