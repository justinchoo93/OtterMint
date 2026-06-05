import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groupInvitations, groupMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { validateEmail } from "@/lib/validate-request";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    // Check caller is a member (any member can invite in Phase 1)
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      );

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    if (membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the group owner can manage invitations" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    if (rawEmail.length > 0) {
      const emailResult = validateEmail(rawEmail);
      if (!emailResult.success) {
        return NextResponse.json({ error: emailResult.error }, { status: 400 });
      }
    }
    const invitedEmail = rawEmail ? rawEmail.toLowerCase() : null;
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(groupInvitations)
      .values({
        groupId,
        invitedBy: userId,
        invitedEmail,
        token,
        expiresAt,
      })
      .returning();

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          token: invitation.token,
          invitedEmail: invitation.invitedEmail,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to create invitation:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    // Verify membership
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      );

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    if (membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the group owner can view invitations" },
        { status: 403 }
      );
    }

    const invitations = await db
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.groupId, groupId));

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        token: inv.token,
        invitedEmail: inv.invitedEmail,
        acceptedAt: inv.acceptedAt?.toISOString() ?? null,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}
