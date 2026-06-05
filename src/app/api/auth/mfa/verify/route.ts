import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import bcrypt from "bcryptjs";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  formatLockoutMessage,
  getLockoutState,
  isCurrentlyLocked,
  MAX_MFA_ATTEMPTS,
  MFA_LOCKOUT_MS,
} from "@/lib/auth/login-lockout";
import {
  getExpiredCookieOptions,
  getSessionCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { SESSION_DURATION_MS } from "@/lib/auth/session";
import { logServerError } from "@/lib/logging";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = body?.code;
    const pendingSessionId = request.cookies.get(MFA_PENDING_COOKIE_NAME)?.value;

    if (typeof code !== "string" || !code) {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof pendingSessionId !== "string" ||
      !uuidRegex.test(pendingSessionId)
    ) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 400 }
      );
    }

    const sessionId = pendingSessionId;

    const limited = await enforceRateLimit(
      "mfaVerify",
      `${getClientIp(request)}:${pendingSessionId}`
    );
    if (limited) return limited;

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

    if (isCurrentlyLocked(session.mfaLockedUntil)) {
      return NextResponse.json(
        {
          error: formatLockoutMessage(
            session.mfaLockedUntil!,
            "Too many MFA attempts."
          ),
        },
        { status: 429 }
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
      issuer: "OtterMint",
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
      const lockoutState = getLockoutState({
        failedAttempts: session.mfaFailedAttempts,
        maxAttempts: MAX_MFA_ATTEMPTS,
        lockoutMs: MFA_LOCKOUT_MS,
      });

      await db
        .update(sessions)
        .set({
          mfaFailedAttempts: lockoutState.failedAttempts,
          mfaLockedUntil: lockoutState.lockedUntil,
        })
        .where(eq(sessions.id, sessionId));

      if (lockoutState.isLocked && lockoutState.lockedUntil) {
        return NextResponse.json(
          {
            error: formatLockoutMessage(
              lockoutState.lockedUntil,
              "Too many MFA attempts."
            ),
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
      );
    }

    // Mark session as fully authenticated
    await db
      .update(sessions)
      .set({
        mfaPending: false,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      })
      .where(eq(sessions.id, sessionId));

    // Set the session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionId,
      getSessionCookieOptions(30 * 24 * 60 * 60)
    );
    response.cookies.set(
      MFA_PENDING_COOKIE_NAME,
      "",
      getExpiredCookieOptions()
    );

    return response;
  } catch (error) {
    logServerError("MFA verify error", error);
    return NextResponse.json(
      { error: "Failed to verify MFA" },
      { status: 500 }
    );
  }
}
