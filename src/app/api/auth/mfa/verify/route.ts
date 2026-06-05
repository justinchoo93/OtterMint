import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import bcrypt from "bcryptjs";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
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

interface SessionLookupRow {
  user_id: string;
  expires_at: Date;
  mfa_pending: boolean;
  mfa_failed_attempts: number;
  mfa_locked_until: Date | null;
}

interface MfaSecretRow {
  user_id: string;
  totp_secret: string | null;
  recovery_codes: string | null;
}

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

    // Look up the pending session via the SECURITY DEFINER function (pre-auth:
    // no per-user RLS context exists yet).
    const sessionRows = (await db.execute(
      sql`select * from lookup_session(${sessionId})`
    )) as unknown as SessionLookupRow[];
    const session = sessionRows[0];

    if (!session || !session.mfa_pending) {
      return NextResponse.json(
        { error: "Invalid or expired MFA session" },
        { status: 400 }
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session expired" },
        { status: 400 }
      );
    }

    if (isCurrentlyLocked(session.mfa_locked_until)) {
      return NextResponse.json(
        {
          error: formatLockoutMessage(
            session.mfa_locked_until!,
            "Too many MFA attempts."
          ),
        },
        { status: 429 }
      );
    }

    // Get user's TOTP secret and recovery codes via the SECURITY DEFINER
    // function (no broad users read is granted pre-auth).
    const userRows = (await db.execute(
      sql`select * from lookup_mfa_secret(${session.user_id})`
    )) as unknown as MfaSecretRow[];
    const user = userRows[0];

    if (!user?.totp_secret) {
      return NextResponse.json(
        { error: "MFA not configured" },
        { status: 400 }
      );
    }

    const secretBase32 = decrypt(user.totp_secret);
    const totp = new TOTP({
      issuer: "OtterMint",
      secret: secretBase32,
    });

    let isValid = totp.validate({ token: code, window: 1 }) !== null;

    // If TOTP didn't match, try recovery codes
    if (!isValid && user.recovery_codes) {
      const hashedCodes: string[] = JSON.parse(user.recovery_codes);
      for (let i = 0; i < hashedCodes.length; i++) {
        const match = await bcrypt.compare(code, hashedCodes[i]);
        if (match) {
          isValid = true;
          // Remove the used recovery code
          hashedCodes.splice(i, 1);
          await db.execute(
            sql`select consume_recovery_code(${session.user_id}, ${JSON.stringify(hashedCodes)})`
          );
          break;
        }
      }
    }

    if (!isValid) {
      const lockoutState = getLockoutState({
        failedAttempts: session.mfa_failed_attempts,
        maxAttempts: MAX_MFA_ATTEMPTS,
        lockoutMs: MFA_LOCKOUT_MS,
      });

      await db.execute(
        sql`select record_mfa_failure(${sessionId}, ${lockoutState.failedAttempts}, ${lockoutState.lockedUntil?.toISOString() ?? null}::timestamptz)`
      );

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
    await db.execute(
      sql`select mark_session_authenticated(${sessionId}, ${new Date(
        Date.now() + SESSION_DURATION_MS
      ).toISOString()}::timestamptz)`
    );

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
