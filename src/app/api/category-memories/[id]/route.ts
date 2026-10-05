import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { categoryMemories } from "@/lib/db/schema";
import { parseSerialId } from "@/lib/validate-request";

/**
 * DELETE /api/category-memories/:id
 * Forgets one remembered category; its transactions fall back to their own
 * choice, a shorter memory, or Plaid.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId();
    const id = parseSerialId((await params).id);
    if (id === null) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

    const deleted = await withUser(userId, (tx) =>
      tx
        .delete(categoryMemories)
        .where(and(eq(categoryMemories.id, id), eq(categoryMemories.userId, userId)))
        .returning({ id: categoryMemories.id })
    );
    if (deleted.length === 0) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to delete category memory", error);
    return NextResponse.json({ error: "Failed to delete category memory" }, { status: 500 });
  }
}
