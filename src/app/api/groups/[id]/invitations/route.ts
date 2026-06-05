import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { groupInvitations, groupMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { validateEmail } from "@/lib/validate-request";
import { withUser } from "@/lib/db/with-user";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

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

    const outcome = await withUser(userId, async (tx) => {
      // Check caller is a member, and an owner (only owners manage invites).
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!membership) {
        return { error: "Not a member of this group", status: 403 } as const;
      }

      if (membership.role !== "owner") {
        return {
          error: "Only the group owner can manage invitations",
          status: 403,
        } as const;
      }

      const [invitation] = await tx
        .insert(groupInvitations)
        .values({
          groupId,
          invitedBy: userId,
          invitedEmail,
          token,
          expiresAt,
        })
        .returning();

      return { error: null, invitation } as const;
    });

    if (outcome.error) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    const invitation = outcome.invitation;

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
    logServerError("Failed to create invitation", error);
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

    const outcome = await withUser(userId, async (tx) => {
      // Verify membership + ownership
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!membership) {
        return { error: "Not a member of this group", status: 403 } as const;
      }

      if (membership.role !== "owner") {
        return {
          error: "Only the group owner can view invitations",
          status: 403,
        } as const;
      }

      const invitations = await tx
        .select()
        .from(groupInvitations)
        .where(eq(groupInvitations.groupId, groupId));

      return { error: null, invitations } as const;
    });

    if (outcome.error) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    return NextResponse.json({
      invitations: outcome.invitations.map((inv) => ({
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
    logServerError("Failed to fetch invitations", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing invitation token" },
        { status: 400 }
      );
    }

    const outcome = await withUser(userId, async (tx) => {
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!membership) {
        return { error: "Not a member of this group", status: 403 } as const;
      }

      if (membership.role !== "owner") {
        return {
          error: "Only the group owner can manage invitations",
          status: 403,
        } as const;
      }

      await tx
        .update(groupInvitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(groupInvitations.groupId, groupId),
            eq(groupInvitations.token, token)
          )
        );

      return { error: null } as const;
    });

    if (outcome.error) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to revoke invitation", error);
    return NextResponse.json(
      { error: "Failed to revoke invitation" },
      { status: 500 }
    );
  }
}
