import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { groups, groupMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    const isOwner = await withUser(userId, async (tx) => {
      // Verify caller is the group owner
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!membership || membership.role !== "owner") {
        return false;
      }

      // Delete the group — CASCADE handles members, invitations, and snapshots.
      await tx.delete(groups).where(eq(groups.id, groupId));
      return true;
    });

    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the group owner can disband the group" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to disband group", error);
    return NextResponse.json(
      { error: "Failed to disband group" },
      { status: 500 }
    );
  }
}
