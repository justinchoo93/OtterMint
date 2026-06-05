import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groupInvitations, groups, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const [invitation] = await db
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.token, token));

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
    console.error("Failed to validate invitation:", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}
