import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth/session";
import {
  getExpiredCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { logServerError } from "@/lib/logging";

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("session_id")?.value;
    const mfaPendingSessionId = request.cookies.get("mfa_pending")?.value;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const sessionIds = new Set(
      [sessionId, mfaPendingSessionId].filter(
        (value): value is string => Boolean(value && uuidRegex.test(value))
      )
    );

    for (const id of sessionIds) {
      await deleteSession(id);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", getExpiredCookieOptions());
    response.cookies.set(
      MFA_PENDING_COOKIE_NAME,
      "",
      getExpiredCookieOptions()
    );

    return response;
  } catch (error) {
    logServerError("Logout error", error);
    return NextResponse.json(
      { error: "Failed to sign out" },
      { status: 500 }
    );
  }
}
