import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import bcrypt from "bcryptjs";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body?.sessionId;
    const code = body?.code;

    if (typeof sessionId !== "string" || typeof code !== "string" || !code) {
      return NextResponse.json(
        { error: "Session ID and code are required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 400 }
      );
    }

    // Look up the pending session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session || !session.mfaPending) {
      return NextResponse.json(
        { error: "Invalid or expired MFA session" },
        { status: 400 }
      );
    }

    if (session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Session expired" },
        { status: 400 }
      );
    }

    // Get user's TOTP secret and recovery codes
    const [user] = await db
      .select({
        totpSecret: users.totpSecret,
        recoveryCodes: users.recoveryCodes,
      })
      .from(users)
      .where(eq(users.id, session.userId));

    if (!user?.totpSecret) {
      return NextResponse.json(
        { error: "MFA not configured" },
        { status: 400 }
      );
    }

    const secretBase32 = decrypt(user.totpSecret);
    const totp = new TOTP({
      issuer: "OtterFin",
      secret: secretBase32,
    });

    let isValid = totp.validate({ token: code, window: 1 }) !== null;

    // If TOTP didn't match, try recovery codes
    if (!isValid && user.recoveryCodes) {
      const hashedCodes: string[] = JSON.parse(user.recoveryCodes);
      for (let i = 0; i < hashedCodes.length; i++) {
        const match = await bcrypt.compare(code, hashedCodes[i]);
        if (match) {
          isValid = true;
          // Remove the used recovery code
          hashedCodes.splice(i, 1);
          await db
            .update(users)
            .set({
              recoveryCodes: JSON.stringify(hashedCodes),
              updatedAt: new Date(),
            })
            .where(eq(users.id, session.userId));
          break;
        }
      }
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
      );
    }

    // Mark session as fully authenticated
    await db
      .update(sessions)
      .set({ mfaPending: false })
      .where(eq(sessions.id, sessionId));

    // Set the session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set("session_id", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    // Remove the mfa_pending cookie
    response.cookies.delete("mfa_pending");

    return response;
  } catch (error) {
    console.error("MFA verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify MFA" },
      { status: 500 }
    );
  }
}
