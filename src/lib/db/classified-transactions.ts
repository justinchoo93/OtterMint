import { and, eq, gte } from "drizzle-orm";
import { transactions, accounts, plaidItems, categoryMemories } from "@/lib/db/schema";
import type { WithUserTx } from "@/lib/db/with-user";
import { applyCategoryRules } from "@/lib/category-rules";
import { applyUserCategories, type CategoryMemory } from "@/lib/category-memory";
import { enrichDescriptors } from "@/lib/descriptor-enrichment";

export interface ClassifiedTransactionRow {
  id: number;
  amount: string;
  date: string;
  name: string;
  /** Plaid's merchant name, or the one descriptor enrichment joined. */
  merchantName: string | null;
  /** The merchant name as stored, before enrichment; what memories match on. */
  storedMerchantName: string | null;
  category: string | null;
  categoryDetailed: string | null;
  /** The owner's choice for this one transaction, as stored. */
  userCategory: string | null;
  userCategoryDetailed: string | null;
  pending: boolean;
  accountType: string;
  accountSubtype: string | null;
  accountName: string;
}

export interface StoredCategoryMemory extends CategoryMemory {
  id: number;
}

/** The owner's remembered categories (src/lib/category-memory.ts). */
export async function selectCategoryMemories(tx: WithUserTx, userId: string): Promise<StoredCategoryMemory[]> {
  return tx
    .select({
      id: categoryMemories.id,
      matchKey: categoryMemories.matchKey,
      category: categoryMemories.category,
      categoryDetailed: categoryMemories.categoryDetailed,
    })
    .from(categoryMemories)
    .where(eq(categoryMemories.userId, userId));
}

/**
 * The canonical analytics read of transaction rows, with the memories it
 * applied: the transactions ⋈ accounts ⋈ plaid_items join scoped to the user
 * (RLS also enforces the boundary on every joined table). Categories are
 * decided in this order, last word first: the owner's choice for the one
 * transaction, then a memory, then the code rules (src/lib/category-rules.ts),
 * then descriptor enrichment (src/lib/descriptor-enrichment.ts), then Plaid.
 * Memories match on the stored columns only, never on enrichment's output.
 * Pending rows are included; the pure aggregations skip them.
 */
export async function loadClassifiedTransactions(
  tx: WithUserTx,
  userId: string,
  since: string
): Promise<{ rows: ClassifiedTransactionRow[]; memories: StoredCategoryMemory[] }> {
  const stored = await tx
    .select({
      id: transactions.id,
      amount: transactions.amount,
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      category: transactions.category,
      categoryDetailed: transactions.categoryDetailed,
      userCategory: transactions.userCategory,
      userCategoryDetailed: transactions.userCategoryDetailed,
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
  const memories = await selectCategoryMemories(tx, userId);
  const processed = enrichDescriptors(stored).map(applyCategoryRules);
  const rows = applyUserCategories(stored, processed, memories).map((row, i) => ({
    ...row,
    storedMerchantName: stored[i].merchantName,
  }));
  return { rows, memories };
}

/**
 * Every analytics read of transaction rows goes through this helper (or
 * loadClassifiedTransactions) — that is what guarantees the enrichment, the
 * corrections and the owner's choices apply everywhere.
 */
export async function selectClassifiedTransactionRows(
  tx: WithUserTx,
  userId: string,
  since: string
): Promise<ClassifiedTransactionRow[]> {
  return (await loadClassifiedTransactions(tx, userId, since)).rows;
}
