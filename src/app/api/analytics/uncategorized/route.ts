import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
import { groupUncategorized, type UncategorizedGroup } from "@/lib/category-memory";

export type UncategorizedResponse = {
  groups: UncategorizedGroup[];
  /** Transactions across every group. */
  count: number;
  /** Money out across every group, positive. */
  outflow: string;
  /** Money in across every group, positive. */
  inflow: string;
};

/**
 * GET /api/analytics/uncategorized
 * Posted transactions with no category, grouped by the merchant key a memory
 * saved from them would get, largest first: the "Needs a category" queue.
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const rows = await withUser(userId, (tx) => selectClassifiedTransactionRows(tx, userId, "1970-01-01"));
    const groups = groupUncategorized(rows);
    let outflowCents = 0;
    let inflowCents = 0;
    for (const group of groups) {
      const cents = Math.round(Number.parseFloat(group.total) * 100);
      if (cents >= 0) outflowCents += cents;
      else inflowCents -= cents;
    }
    const result: UncategorizedResponse = {
      groups,
      count: groups.reduce((sum, group) => sum + group.count, 0),
      outflow: (outflowCents / 100).toFixed(2),
      inflow: (inflowCents / 100).toFixed(2),
    };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to list uncategorized transactions", error);
    return NextResponse.json({ error: "Failed to list uncategorized transactions" }, { status: 500 });
  }
}
