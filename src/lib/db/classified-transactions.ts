import { and, eq, gte } from "drizzle-orm";
import { transactions, accounts, plaidItems } from "@/lib/db/schema";
import type { WithUserTx } from "@/lib/db/with-user";
import { applyCategoryRules } from "@/lib/category-rules";

export interface ClassifiedTransactionRow {
  amount: string;
  date: string;
  name: string;
  merchantName: string | null;
  category: string | null;
  categoryDetailed: string | null;
  pending: boolean;
  accountType: string;
  accountSubtype: string | null;
  accountName: string;
}

/**
 * The canonical analytics read of transaction rows: the transactions ⋈
 * accounts ⋈ plaid_items join scoped to the user (RLS also enforces the
 * boundary on every joined table), with category-correction rules applied.
 * Every analytics read goes through this helper — that is what guarantees
 * corrections from src/lib/category-rules.ts apply everywhere. Pending rows
 * are included; the pure aggregations skip them, keeping the pending policy
 * in one layer.
 */
export async function selectClassifiedTransactionRows(
  tx: WithUserTx,
  userId: string,
  since: string
): Promise<ClassifiedTransactionRow[]> {
  const rows = await tx
    .select({
      amount: transactions.amount,
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      category: transactions.category,
      categoryDetailed: transactions.categoryDetailed,
      pending: transactions.pending,
      accountType: accounts.type,
      accountSubtype: accounts.subtype,
      accountName: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.accountId))
    .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
    .where(
      and(eq(plaidItems.userId, userId), gte(transactions.date, since))
    );
  return rows.map(applyCategoryRules);
}
