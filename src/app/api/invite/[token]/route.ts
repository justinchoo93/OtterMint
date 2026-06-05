import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

interface InvitationRow {
  group_id: string;
  group_name: string;
  inviter_name: string;
  accepted_at: Date | null;
  expires_at: Date;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const limited = await enforceRateLimit("inviteLookup", getClientIp(request));
    if (limited) return limited;

    // Resolve the (non-revoked) invitation's safe public fields via the
    // SECURITY DEFINER. No withUser: the recipient is not yet authenticated
    // as a member of the group.
    const rows = (await db.execute(
      sql`select * from resolve_invitation(${token})`
    )) as unknown as InvitationRow[];
    const invitation = rows[0];

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      groupId: invitation.group_id,
      groupName: invitation.group_name ?? "Unknown Group",
      inviterName: invitation.inviter_name ?? "Someone",
    });
  } catch (error) {
    logServerError("Failed to validate invitation", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}
