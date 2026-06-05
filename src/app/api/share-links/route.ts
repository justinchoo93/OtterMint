import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import {
  FIELD_LIMITS,
  validateBoundedInteger,
  validateOptionalBoundedString,
} from "@/lib/validate-request";
import crypto from "crypto";

export async function GET() {
  try {
    const userId = await getUserId();

    const links = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.userId, userId),
          isNull(shareLinks.revokedAt)
        )
      );

    return NextResponse.json({
      shareLinks: links.map((link) => ({
        id: link.id,
        token: link.token,
        label: link.label,
        includeNetWorth: link.includeNetWorth,
        includeBalances: link.includeBalances,
        includeTransactions: link.includeTransactions,
        expiresAt: link.expiresAt?.toISOString() ?? null,
        createdAt: link.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch share links:", error);
    return NextResponse.json(
      { error: "Failed to fetch share links" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();

    const labelResult = validateOptionalBoundedString(
      body.label,
      "label",
      FIELD_LIMITS.LABEL
    );
    if (!labelResult.success) {
      return NextResponse.json({ error: labelResult.error }, { status: 400 });
    }

    const expiryResult = validateBoundedInteger(
      body.expiresInDays,
      "expiresInDays",
      1,
      365
    );
    if (!expiryResult.success) {
      return NextResponse.json({ error: expiryResult.error }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("base64url");

    const [link] = await db
      .insert(shareLinks)
      .values({
        userId,
        token,
        label: body.label?.trim() || null,
        includeNetWorth: body.includeNetWorth ?? true,
        includeBalances: body.includeBalances ?? false,
        includeTransactions: body.includeTransactions ?? false,
        expiresAt: new Date(
          Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000
        ),
      })
      .returning();

    return NextResponse.json(
      {
        shareLink: {
          id: link.id,
          token: link.token,
          label: link.label,
          includeNetWorth: link.includeNetWorth,
          includeBalances: link.includeBalances,
          includeTransactions: link.includeTransactions,
          expiresAt: link.expiresAt?.toISOString() ?? null,
          createdAt: link.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to create share link:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("id");

    if (!linkId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(shareLinks.id, linkId), eq(shareLinks.userId, userId))
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to revoke share link:", error);
    return NextResponse.json(
      { error: "Failed to revoke share link" },
      { status: 500 }
    );
  }
}
