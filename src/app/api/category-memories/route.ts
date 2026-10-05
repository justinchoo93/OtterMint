import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { loadClassifiedTransactions } from "@/lib/db/classified-transactions";
import { memoryMatches } from "@/lib/category-memory";

export type CategoryMemoryRow = {
  id: number;
  matchKey: string;
  /** Merchant name or descriptor of the newest transaction it decides, else the key. */
  label: string;
  category: string;
  categoryDetailed: string;
  /** Transactions it decides today. */
  matchCount: number;
};

export type CategoryMemoriesResponse = { memories: CategoryMemoryRow[] };

/**
 * GET /api/category-memories
 * The remembered categories, for the Memorized categories settings page.
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const { rows, memories } = await withUser(userId, (tx) =>
      loadClassifiedTransactions(tx, userId, "1970-01-01")
    );
    const matches = memoryMatches(rows, memories);
    const result: CategoryMemoriesResponse = {
      memories: memories
        .map((memory) => {
          const decided = matches.get(memory.matchKey) ?? [];
          const newest = decided.reduce<(typeof decided)[number] | null>(
            (best, row) => (!best || row.date > best.date || (row.date === best.date && row.id > best.id) ? row : best),
            null
          );
          return {
            id: memory.id,
            matchKey: memory.matchKey,
            label: newest ? newest.merchantName?.trim() || newest.name : memory.matchKey,
            category: memory.category,
            categoryDetailed: memory.categoryDetailed,
            matchCount: decided.length,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to list category memories", error);
    return NextResponse.json({ error: "Failed to list category memories" }, { status: 500 });
  }
}
