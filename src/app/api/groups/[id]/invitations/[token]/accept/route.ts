import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import { groupInvitations, groupMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId, token } = await params;

    // Find the invitation
    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.groupId, groupId),
          eq(groupInvitations.token, token)
        )
      );

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 409 }
      );
    }

    if (invitation.revokedAt) {
      return NextResponse.json(
        { error: "This invitation is no longer available" },
        { status: 410 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    // If invitation was targeted to a specific email, enforce it
    if (invitation.invitedEmail) {
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));

      if (user?.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: "This invitation was sent to a different email address" },
          { status: 403 }
        );
      }
    }

    // Atomically add member and mark invitation accepted
    try {
      await db.transaction(async (tx) => {
        // Re-check inside transaction to prevent race conditions
        const [freshInvitation] = await tx
          .select({
            acceptedAt: groupInvitations.acceptedAt,
            revokedAt: groupInvitations.revokedAt,
          })
          .from(groupInvitations)
          .where(eq(groupInvitations.id, invitation.id));

        if (freshInvitation?.acceptedAt) {
          throw new Error("ALREADY_ACCEPTED");
        }

        if (freshInvitation?.revokedAt) {
          throw new Error("REVOKED");
        }

        const existingMembership = await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(eq(groupMembers.userId, userId));

        if (existingMembership.length > 0) {
          throw new Error("ALREADY_IN_GROUP");
        }

        await tx.insert(groupMembers).values({
          groupId,
          userId,
          role: "member",
        });

        await tx
          .update(groupInvitations)
          .set({ acceptedAt: new Date() })
          .where(eq(groupInvitations.id, invitation.id));
      });
    } catch (txError) {
      const message =
        txError instanceof Error ? txError.message : String(txError);
      if (message === "ALREADY_ACCEPTED") {
        return NextResponse.json(
          { error: "This invitation has already been accepted" },
          { status: 409 }
        );
      }
      if (message === "REVOKED") {
        return NextResponse.json(
          { error: "This invitation is no longer available" },
          { status: 410 }
        );
      }
      if (
        message === "ALREADY_IN_GROUP" ||
        message.includes("group_members_user_unique")
      ) {
        return NextResponse.json(
          {
            error:
              "You are already in a group. Leave your current group first to join this one.",
          },
          { status: 409 }
        );
      }
      throw txError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to accept invitation", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
