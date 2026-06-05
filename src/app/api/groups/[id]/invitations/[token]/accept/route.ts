import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  try {
    const userId = await getUserId();
    const { token } = await params;

    // The accepting user is not yet a group member, so the group_members /
    // group_invitations RLS policies cannot permit this bootstrap. The
    // accept_invitation SECURITY DEFINER validates the invitation (FOR UPDATE),
    // inserts the membership, and marks it accepted atomically, raising typed
    // errors we map to status codes here.
    try {
      await db.execute(sql`select accept_invitation(${token}, ${userId})`);
    } catch (txError) {
      const message =
        txError instanceof Error ? txError.message : String(txError);

      if (message.includes("NOT_FOUND")) {
        return NextResponse.json(
          { error: "Invitation not found" },
          { status: 404 }
        );
      }
      if (message.includes("ALREADY_ACCEPTED")) {
        return NextResponse.json(
          { error: "This invitation has already been accepted" },
          { status: 409 }
        );
      }
      if (message.includes("REVOKED")) {
        return NextResponse.json(
          { error: "This invitation is no longer available" },
          { status: 410 }
        );
      }
      if (message.includes("EXPIRED")) {
        return NextResponse.json(
          { error: "This invitation has expired" },
          { status: 410 }
        );
      }
      if (message.includes("EMAIL_MISMATCH")) {
        return NextResponse.json(
          { error: "This invitation was sent to a different email address" },
          { status: 403 }
        );
      }
      if (
        message.includes("ALREADY_IN_GROUP") ||
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
