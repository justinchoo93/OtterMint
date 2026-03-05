import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("session_id")?.value;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (sessionId && uuidRegex.test(sessionId)) {
      await deleteSession(sessionId);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete("session_id");

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Failed to sign out" },
      { status: 500 }
    );
  }
}
