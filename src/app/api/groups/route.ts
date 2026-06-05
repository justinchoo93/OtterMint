import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { groups, groupMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { users } from "@/lib/db/schema";
import { FIELD_LIMITS, validateBoundedString } from "@/lib/validate-request";
import { withUser } from "@/lib/db/with-user";

export async function GET() {
  try {
    const userId = await getUserId();

    const result = await withUser(userId, async (tx) => {
      // Get groups where user is a member
      const memberships = await tx
        .select({
          groupId: groupMembers.groupId,
          role: groupMembers.role,
        })
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId));

      const result = [];
      for (const membership of memberships) {
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, membership.groupId));

        if (!group) continue;

        // Count members
        const members = await tx
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.groupId, group.id));

        result.push({
          id: group.id,
          name: group.name,
          role: membership.role,
          memberCount: members.length,
          createdAt: group.createdAt.toISOString(),
        });
      }

      return result;
    });

    return NextResponse.json({ groups: result });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch groups", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();

    const body = await request.json().catch(() => ({}));

    if (body.name !== undefined && body.name !== null && body.name !== "") {
      const nameResult = validateBoundedString(body.name, "name", FIELD_LIMITS.NAME);
      if (!nameResult.success) {
        return NextResponse.json({ error: nameResult.error }, { status: 400 });
      }
    }

    // Membership check + create group + add owner, all under the user's RLS
    // context (no nested db.transaction — withUser already runs in one).
    const outcome = await withUser(userId, async (tx) => {
      const existingMembership = await tx
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId));

      if (existingMembership.length > 0) {
        return { conflict: true as const };
      }

      // Get user's display name for auto-generated group name
      const [user] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId));

      const groupName =
        body.name?.trim() || `${user?.displayName || "My"}'s Group`;

      const [newGroup] = await tx
        .insert(groups)
        .values({
          name: groupName,
          createdBy: userId,
        })
        .returning();

      await tx.insert(groupMembers).values({
        groupId: newGroup.id,
        userId,
        role: "owner",
      });

      return { conflict: false as const, group: newGroup };
    });

    if (outcome.conflict) {
      return NextResponse.json(
        { error: "You are already in a group. Leave your current group first." },
        { status: 409 }
      );
    }

    const group = outcome.group;

    return NextResponse.json(
      {
        group: {
          id: group.id,
          name: group.name,
          role: "owner",
          memberCount: 1,
          createdAt: group.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to create group", error);
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
