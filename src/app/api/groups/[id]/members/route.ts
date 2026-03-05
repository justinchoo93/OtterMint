import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groupMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    // Verify caller is a member
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

    const members = await db
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId));

    return NextResponse.json({ members });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
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
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json(
        { error: "userId query param required" },
        { status: 400 }
      );
    }

    // Check caller's role
    const [callerMembership] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      );

    if (!callerMembership) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    // Owners cannot remove themselves (use DELETE /api/groups/:id to disband)
    if (targetUserId === userId && callerMembership.role === "owner") {
      return NextResponse.json(
        { error: "Owners cannot leave their group. Disband the group instead." },
        { status: 400 }
      );
    }

    // Members can only remove themselves; owners can remove anyone
    if (targetUserId !== userId && callerMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can remove other members" },
        { status: 403 }
      );
    }

    await db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, targetUserId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to remove member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
