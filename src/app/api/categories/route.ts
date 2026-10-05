import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { loadClassifiedTransactions } from "@/lib/db/classified-transactions";
import { categoryOptions, type CategoryOption } from "@/lib/category-memory";

export type CategoriesResponse = { options: CategoryOption[] };

/**
 * GET /api/categories
 * The category picker's list: every pair in the owner's transactions or
 * memories, plus the fixed pairs that change how money is counted.
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const { rows, memories } = await withUser(userId, (tx) =>
      loadClassifiedTransactions(tx, userId, "1970-01-01")
    );
    const result: CategoriesResponse = { options: categoryOptions(rows, memories) };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to list categories", error);
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 });
  }
}
