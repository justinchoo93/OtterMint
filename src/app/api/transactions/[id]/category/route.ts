import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { categoryMemories, transactions } from "@/lib/db/schema";
import { loadClassifiedTransactions } from "@/lib/db/classified-transactions";
import { isValidCategoryPair, memoryKeyForRow } from "@/lib/category-memory";
import { parseSerialId } from "@/lib/validate-request";

type Outcome = { status: 200; matchKey: string | null } | { status: 400 | 404; error: string };

/**
 * PUT /api/transactions/:id/category
 *   { category, categoryDetailed, applyToSimilar }
 * With applyToSimilar, remembers the pair for every transaction sharing this
 * one's merchant key (and clears this transaction's own choice, so the memory
 * decides it); without, sets the pair on this transaction only.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId();
    const id = parseSerialId((await params).id);
    if (id === null) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }
    const { category, categoryDetailed, applyToSimilar } = (body ?? {}) as Record<string, unknown>;
    const pair = { category, categoryDetailed };
    if (!isValidCategoryPair(pair)) {
      return NextResponse.json({ error: "category and categoryDetailed must be a valid category pair" }, { status: 400 });
    }
    if (typeof applyToSimilar !== "boolean") {
      return NextResponse.json({ error: "applyToSimilar must be true or false" }, { status: 400 });
    }

    const outcome = await withUser(userId, async (tx): Promise<Outcome> => {
      const { rows, memories } = await loadClassifiedTransactions(tx, userId, "1970-01-01");
      const row = rows.find((r) => r.id === id);
      if (!row) return { status: 404, error: "Transaction not found" };

      if (applyToSimilar) {
        const matchKey = memoryKeyForRow(row, memories);
        if (!matchKey) return { status: 400, error: "This transaction cannot be matched to similar ones" };
        await tx
          .insert(categoryMemories)
          .values({ userId, matchKey, category: pair.category, categoryDetailed: pair.categoryDetailed })
          .onConflictDoUpdate({
            target: [categoryMemories.userId, categoryMemories.matchKey],
            set: { category: pair.category, categoryDetailed: pair.categoryDetailed, updatedAt: new Date() },
          });
        await tx
          .update(transactions)
          .set({ userCategory: null, userCategoryDetailed: null })
          .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
        return { status: 200, matchKey };
      }

      // Plaid replaces a pending transaction when it posts, which would drop
      // a choice stored on it; memories carry over instead.
      if (row.pending) return { status: 400, error: "Pending transactions can only be categorized with similar ones" };
      await tx
        .update(transactions)
        .set({ userCategory: pair.category, userCategoryDetailed: pair.categoryDetailed })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
      return { status: 200, matchKey: null };
    });

    if (outcome.status !== 200) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true, matchKey: outcome.matchKey });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to save transaction category", error);
    return NextResponse.json({ error: "Failed to save transaction category" }, { status: 500 });
  }
}

/**
 * DELETE /api/transactions/:id/category
 * Clears this transaction's own choice; a memory or Plaid decides it again.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId();
    const id = parseSerialId((await params).id);
    if (id === null) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

    const updated = await withUser(userId, (tx) =>
      tx
        .update(transactions)
        .set({ userCategory: null, userCategoryDetailed: null })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .returning({ id: transactions.id })
    );
    if (updated.length === 0) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to reset transaction category", error);
    return NextResponse.json({ error: "Failed to reset transaction category" }, { status: 500 });
  }
}
