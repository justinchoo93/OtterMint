import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { groupMembers, users } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { recomputeGroupNetWorthSnapshot } from "@/lib/recompute-net-worth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    const outcome = await withUser(userId, async (tx) => {
      // Verify caller is a member
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
        return { forbidden: true as const };
      }

      const members = await tx
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

      return { forbidden: false as const, members };
    });

    if (outcome.forbidden) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    return NextResponse.json({ members: outcome.members });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch members", error);
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

    const result = await withUser(userId, async (tx) => {
      // Check caller's role
      const [callerMembership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!callerMembership) {
        return { error: "Not a member of this group", status: 403 } as const;
      }

      // Owners cannot remove themselves (use DELETE /api/groups/:id to disband)
      if (targetUserId === userId && callerMembership.role === "owner") {
        return {
          error:
            "Owners cannot leave their group. Disband the group instead.",
          status: 400,
        } as const;
      }

      // Members can only remove themselves; owners can remove anyone
      if (targetUserId !== userId && callerMembership.role !== "owner") {
        return { error: "Only owners can remove other members", status: 403 } as const;
      }

      // group_members_self only permits deleting your OWN row, so an owner
      // removing another member must go through the SECURITY DEFINER, which
      // re-checks the caller is the target (self-leave) or the group owner.
      await tx.execute(
        sql`select remove_group_member(${groupId}, ${targetUserId}, ${userId})`
      );

      return { error: null } as const;
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // A remaining owner can immediately capture the new member/source set.
    // A self-leaving member no longer has RLS access, so the next remaining
    // member refresh will create the new household coverage segment.
    if (targetUserId !== userId) {
      try {
        await withUser(userId, (tx) =>
          recomputeGroupNetWorthSnapshot(groupId, tx)
        );
      } catch (snapshotError) {
        logServerError(
          `Failed to recompute group snapshot after removing a member from ${groupId}`,
          snapshotError
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to remove member", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
