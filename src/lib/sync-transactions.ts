import { plaidClient } from "@/lib/plaid";
import { transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/with-user";

interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  nextCursor: string;
}

export async function syncTransactions(
  accessToken: string,
  cursor: string | null,
  userId: string,
  executor: DbExecutor
): Promise<SyncResult> {
  const db = executor;
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let hasMore = true;
  let currentCursor = cursor;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor ?? undefined,
    });

    const { added, modified, removed, has_more, next_cursor } = response.data;

    // Insert new transactions
    for (const txn of added) {
      await db
        .insert(transactions)
        .values({
          userId,
          accountId: txn.account_id,
          transactionId: txn.transaction_id,
          amount: txn.amount.toString(),
          date: txn.date,
          name: txn.name,
          merchantName: txn.merchant_name ?? null,
          category: txn.personal_finance_category?.primary ?? null,
          pending: txn.pending,
          isoCurrencyCode: txn.iso_currency_code ?? "USD",
        })
        .onConflictDoUpdate({
          target: transactions.transactionId,
          set: {
            amount: txn.amount.toString(),
            date: txn.date,
            name: txn.name,
            merchantName: txn.merchant_name ?? null,
            category: txn.personal_finance_category?.primary ?? null,
            pending: txn.pending,
          },
        });
    }
    totalAdded += added.length;

    // Update modified transactions
    for (const txn of modified) {
      await db
        .insert(transactions)
        .values({
          userId,
          accountId: txn.account_id,
          transactionId: txn.transaction_id,
          amount: txn.amount.toString(),
          date: txn.date,
          name: txn.name,
          merchantName: txn.merchant_name ?? null,
          category: txn.personal_finance_category?.primary ?? null,
          pending: txn.pending,
          isoCurrencyCode: txn.iso_currency_code ?? "USD",
        })
        .onConflictDoUpdate({
          target: transactions.transactionId,
          set: {
            amount: txn.amount.toString(),
            date: txn.date,
            name: txn.name,
            merchantName: txn.merchant_name ?? null,
            category: txn.personal_finance_category?.primary ?? null,
            pending: txn.pending,
          },
        });
    }
    totalModified += modified.length;

    // Remove deleted transactions
    for (const txn of removed) {
      await db
        .delete(transactions)
        .where(eq(transactions.transactionId, txn.transaction_id));
    }
    totalRemoved += removed.length;

    hasMore = has_more;
    currentCursor = next_cursor;
  }

  return {
    added: totalAdded,
    modified: totalModified,
    removed: totalRemoved,
    nextCursor: currentCursor!,
  };
}
