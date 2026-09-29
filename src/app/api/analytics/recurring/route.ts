import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
import { aggregateCashflow } from "@/lib/cashflow";
import { detectRecurringCharges, type RecurringSummary } from "@/lib/recurring";

export type RecurringResponse = RecurringSummary;

/** Thirteen months: the current one and the twelve before it. */
const WINDOW_MONTHS = 13;

/**
 * GET /api/analytics/recurring
 * The merchants that charge the user on a steady schedule, detected from the
 * last thirteen months of classified transactions, with their monthly cost as
 * a share of the average complete month's spending. Reads through the shared
 * classified-rows helper so category corrections apply, exactly as the
 * cash-flow routes do.
 */
export async function GET() {
  try {
    const userId = await getUserId();

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (WINDOW_MONTHS - 1), 1))
      .toISOString()
      .split("T")[0];

    const rows = await withUser(userId, (tx) => selectClassifiedTransactionRows(tx, userId, since));

    // Average spending over the complete months with any activity.
    const months = aggregateCashflow(rows, { months: WINDOW_MONTHS, today });
    const active = months.filter(
      (m) =>
        !m.partial &&
        (Number.parseFloat(m.income) !== 0 ||
          Number.parseFloat(m.spending) !== 0 ||
          Number.parseFloat(m.savings) !== 0)
    );
    const averageMonthlySpending =
      active.length > 0
        ? active.reduce((sum, m) => sum + Number.parseFloat(m.spending), 0) / active.length
        : null;

    const result: RecurringResponse = detectRecurringCharges(rows, { today, averageMonthlySpending });
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to detect recurring charges", error);
    return NextResponse.json({ error: "Failed to detect recurring charges" }, { status: 500 });
  }
}
