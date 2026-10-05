import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { loadClassifiedTransactions } from "@/lib/db/classified-transactions";
import { defaultApplyToSimilar, findMemory, memoryKeyForRow, similarRows } from "@/lib/category-memory";
import { parseSerialId } from "@/lib/validate-request";

export type SimilarSample = { id: number; date: string; name: string; amount: string };

export type SimilarResponse = {
  /** The memory key a save with "apply to similar" writes; empty when the row cannot be matched. */
  key: string;
  /** Merchant name or descriptor, for the picker's title and sentence. */
  label: string;
  /** Other transactions the memory would decide. */
  similarCount: number;
  /** Up to three of them, newest first. */
  samples: SimilarSample[];
  /** Whether "apply to similar" starts ticked. */
  defaultApply: boolean;
  /** The transaction's category as shown now. */
  category: string | null;
  categoryDetailed: string | null;
  /** The transaction carries its own choice (Reset applies). */
  hasOwnChoice: boolean;
  /** A memory decides the transaction today. */
  hasMemory: boolean;
  pending: boolean;
};

const SAMPLE_LIMIT = 3;

/**
 * GET /api/transactions/:id/similar
 * What the category picker needs for one transaction: its current category,
 * and which other transactions a remembered choice would reach.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId();
    const id = parseSerialId((await params).id);
    if (id === null) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    const { rows, memories } = await withUser(userId, (tx) =>
      loadClassifiedTransactions(tx, userId, "1970-01-01")
    );
    const row = rows.find((r) => r.id === id);
    if (!row) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    const key = memoryKeyForRow(row, memories);
    const similar = similarRows(rows, key, row.id, memories).sort(
      (a, b) => b.date.localeCompare(a.date) || b.id - a.id
    );
    const result: SimilarResponse = {
      key,
      label: row.merchantName?.trim() || row.name,
      similarCount: similar.length,
      samples: similar.slice(0, SAMPLE_LIMIT).map((r) => ({
        id: r.id,
        date: r.date,
        name: r.merchantName?.trim() || r.name,
        amount: r.amount,
      })),
      defaultApply: defaultApplyToSimilar(key),
      category: row.category,
      categoryDetailed: row.categoryDetailed,
      hasOwnChoice: Boolean(row.userCategory && row.userCategoryDetailed),
      hasMemory: findMemory({ name: row.name, merchantName: row.storedMerchantName }, memories) !== null,
      pending: row.pending,
    };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to find similar transactions", error);
    return NextResponse.json({ error: "Failed to find similar transactions" }, { status: 500 });
  }
}
