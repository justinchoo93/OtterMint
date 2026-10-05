import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { transactions, accounts, plaidItems } from "@/lib/db/schema";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { applyCategoryRules } from "@/lib/category-rules";
import { applyUserCategories } from "@/lib/category-memory";
import { selectCategoryMemories } from "@/lib/db/classified-transactions";

export type TransactionRow = {
  id: number;
  accountId: string;
  transactionId: string;
  amount: string;
  date: string;
  merchantName: string | null;
  name: string;
  category: string | null;
  categoryDetailed: string | null;
  pending: boolean;
  isoCurrencyCode: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsed = parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 200);

    // Scope transactions to the authenticated user via join (RLS also enforces
    // the boundary on every joined table).
    const { rows, memories } = await withUser(userId, async (tx) => ({
      rows: await tx
        .select({ ...getTableColumns(transactions) })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.accountId))
        .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
        .where(eq(plaidItems.userId, userId))
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(limit),
      memories: await selectCategoryMemories(tx, userId),
    }));

    // Corrected categories and the owner's choices everywhere the user sees
    // them, consistent with the analytics (src/lib/category-rules.ts,
    // src/lib/category-memory.ts).
    const corrected = applyUserCategories(rows, rows.map(applyCategoryRules), memories);
    const result: TransactionRow[] = corrected.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionId: row.transactionId,
      amount: row.amount,
      date: row.date,
      merchantName: row.merchantName,
      name: row.name,
      category: row.category,
      categoryDetailed: row.categoryDetailed,
      pending: row.pending,
      isoCurrencyCode: row.isoCurrencyCode,
    }));

    return NextResponse.json({ transactions: result });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch transactions", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
