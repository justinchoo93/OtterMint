import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { transactions, accounts, plaidItems } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { aggregateCashflow, type CashflowMonth } from "@/lib/cashflow";

export type CashflowResponse = { months: CashflowMonth[] };

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsed = parseInt(searchParams.get("months") ?? "6", 10);
    const months = Number.isNaN(parsed) || parsed < 1 ? 6 : Math.min(parsed, 24);

    // First day of the window's earliest month, as a YYYY-MM-DD string.
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
    )
      .toISOString()
      .split("T")[0];
    const today = now.toISOString().split("T")[0];

    // Scope to the authenticated user via the join (RLS also enforces the
    // boundary on every joined table), matching /api/transactions.
    const rows = await withUser(userId, (tx) =>
      tx
        .select({
          amount: transactions.amount,
          date: transactions.date,
          category: transactions.category,
          categoryDetailed: transactions.categoryDetailed,
          pending: transactions.pending,
          accountType: accounts.type,
          accountSubtype: accounts.subtype,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.accountId))
        .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
        .where(
          and(
            eq(plaidItems.userId, userId),
            eq(transactions.pending, false),
            gte(transactions.date, windowStart)
          )
        )
    );

    const result: CashflowResponse = {
      months: aggregateCashflow(rows, { months, today }),
    };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to compute cashflow analytics", error);
    return NextResponse.json(
      { error: "Failed to compute cashflow analytics" },
      { status: 500 }
    );
  }
}
