import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import { groupInvitations, groups, users } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const limited = await enforceRateLimit("inviteLookup", getClientIp(request));
    if (limited) return limited;

    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.token, token),
          isNull(groupInvitations.revokedAt)
        )
      );

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 410 }
      );
    }

    // Get group and inviter info
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, invitation.groupId));

    // invitedBy is nullable (set to null when the inviter deletes their
    // account), so only look up the inviter when it is present.
    const [inviter] = invitation.invitedBy
      ? await db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, invitation.invitedBy))
      : [];

    return NextResponse.json({
      groupId: invitation.groupId,
      groupName: group?.name ?? "Unknown Group",
      inviterName: inviter?.displayName ?? "Someone",
    });
  } catch (error) {
    logServerError("Failed to validate invitation", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}
