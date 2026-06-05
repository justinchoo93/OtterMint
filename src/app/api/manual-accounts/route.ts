import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { manualAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateManualAccount } from "@/lib/validate-manual-account";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";

export type ManualAccountRow = {
  id: number;
  name: string;
  type: string;
  subtype: string | null;
  balance: string;
  isoCurrencyCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function GET() {
  try {
    const userId = await getUserId();

    const rows = await withUser(userId, (tx) =>
      tx
        .select()
        .from(manualAccounts)
        .where(eq(manualAccounts.userId, userId))
    );

    const result: ManualAccountRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      subtype: row.subtype,
      balance: row.balance,
      isoCurrencyCode: row.isoCurrencyCode,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return NextResponse.json({ manualAccounts: result });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch manual accounts", error);
    return NextResponse.json(
      { error: "Failed to fetch manual accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const validation = validateManualAccount(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const [row] = await withUser(userId, (tx) =>
      tx
        .insert(manualAccounts)
        .values({
          userId,
          name: body.name.trim(),
          type: body.type,
          subtype: body.subtype?.trim() || null,
          balance: body.balance,
          notes: body.notes?.trim() || null,
        })
        .returning()
    );

    return NextResponse.json({ manualAccount: row }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to create manual account", error);
    return NextResponse.json(
      { error: "Failed to create manual account" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const validation = validateManualAccount(fields);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const [row] = await withUser(userId, (tx) =>
      tx
        .update(manualAccounts)
        .set({
          name: fields.name.trim(),
          type: fields.type,
          subtype: fields.subtype?.trim() || null,
          balance: fields.balance,
          notes: fields.notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(and(eq(manualAccounts.id, id), eq(manualAccounts.userId, userId)))
        .returning()
    );

    if (!row) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ manualAccount: row });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to update manual account", error);
    return NextResponse.json(
      { error: "Failed to update manual account" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") ?? "", 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await withUser(userId, (tx) =>
      tx
        .delete(manualAccounts)
        .where(and(eq(manualAccounts.id, id), eq(manualAccounts.userId, userId)))
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to delete manual account", error);
    return NextResponse.json(
      { error: "Failed to delete manual account" },
      { status: 500 }
    );
  }
}
