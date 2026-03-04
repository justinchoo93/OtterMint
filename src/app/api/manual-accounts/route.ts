import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { manualAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateManualAccount } from "@/lib/validate-manual-account";

export type ManualAccountRow = {
  id: number;
  name: string;
  type: string;
  subtype: string | null;
  balance: string;
  isoCurrencyCode: string | null;
  owner: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function GET() {
  try {
    const rows = await db.select().from(manualAccounts);
    const result: ManualAccountRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      subtype: row.subtype,
      balance: row.balance,
      isoCurrencyCode: row.isoCurrencyCode,
      owner: row.owner,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return NextResponse.json({ manualAccounts: result });
  } catch (error) {
    console.error("Failed to fetch manual accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch manual accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateManualAccount(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const [row] = await db
      .insert(manualAccounts)
      .values({
        name: body.name.trim(),
        type: body.type,
        subtype: body.subtype?.trim() || null,
        balance: body.balance,
        owner: body.owner?.trim() || "justin",
        notes: body.notes?.trim() || null,
      })
      .returning();

    return NextResponse.json({ manualAccount: row }, { status: 201 });
  } catch (error) {
    console.error("Failed to create manual account:", error);
    return NextResponse.json(
      { error: "Failed to create manual account" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const validation = validateManualAccount(fields);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const [row] = await db
      .update(manualAccounts)
      .set({
        name: fields.name.trim(),
        type: fields.type,
        subtype: fields.subtype?.trim() || null,
        balance: fields.balance,
        owner: fields.owner?.trim() || "justin",
        notes: fields.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(manualAccounts.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ manualAccount: row });
  } catch (error) {
    console.error("Failed to update manual account:", error);
    return NextResponse.json(
      { error: "Failed to update manual account" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") ?? "", 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(manualAccounts).where(eq(manualAccounts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete manual account:", error);
    return NextResponse.json(
      { error: "Failed to delete manual account" },
      { status: 500 }
    );
  }
}
