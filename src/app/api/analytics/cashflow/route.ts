import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
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

    // The shared helper scopes to the user, joins accounts for the
    // classifiable fields, and applies category-correction rules.
    const rows = await withUser(userId, (tx) =>
      selectClassifiedTransactionRows(tx, userId, windowStart)
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
