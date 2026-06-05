import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  MFA_PENDING_DURATION_MS,
} from "@/lib/auth/session";
import {
  formatLockoutMessage,
  getLockoutState,
  isCurrentlyLocked,
  LOGIN_LOCKOUT_MS,
  MAX_LOGIN_ATTEMPTS,
} from "@/lib/auth/login-lockout";
import {
  getExpiredCookieOptions,
  getSessionCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { logServerError } from "@/lib/logging";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

interface LoginUserRow {
  id: string;
  password_hash: string;
  display_name: string;
  email: string;
  mfa_enabled: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const email = body?.email;
    const password = body?.password;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email ||
      !password
    ) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const limited = await enforceRateLimit(
      "login",
      `${getClientIp(request)}:${email.toLowerCase().trim()}`
    );
    if (limited) return limited;

    const userRows = (await db.execute(
      sql`select * from lookup_user_for_login(${email.toLowerCase().trim()})`
    )) as unknown as LoginUserRow[];
    const user = userRows[0];

    if (!user) {
      return NextResponse.json(
        { error: "Incorrect email or password" },
        { status: 401 }
      );
    }

    if (isCurrentlyLocked(user.locked_until)) {
      return NextResponse.json(
        {
          error: formatLockoutMessage(
            user.locked_until!,
            "Too many sign-in attempts."
          ),
        },
        { status: 429 }
      );
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      const lockoutState = getLockoutState({
        failedAttempts: user.failed_login_attempts,
        maxAttempts: MAX_LOGIN_ATTEMPTS,
        lockoutMs: LOGIN_LOCKOUT_MS,
      });

      await db.execute(
        sql`select record_login_failure(${user.id}, ${lockoutState.failedAttempts}, ${lockoutState.lockedUntil})`
      );

      if (lockoutState.isLocked && lockoutState.lockedUntil) {
        return NextResponse.json(
          {
            error: formatLockoutMessage(
              lockoutState.lockedUntil,
              "Too many sign-in attempts."
            ),
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Incorrect email or password" },
        { status: 401 }
      );
    }

    if (user.failed_login_attempts > 0 || user.locked_until) {
      await db.execute(sql`select record_login_success(${user.id})`);
    }

    // If MFA is enabled, create a pending session (no cookie yet)
    if (user.mfa_enabled) {
      const sessionId = await createSession(user.id, {
        durationMs: MFA_PENDING_DURATION_MS,
        mfaPending: true,
      });

      const response = NextResponse.json({
        mfaRequired: true,
      });

      response.cookies.set(
        MFA_PENDING_COOKIE_NAME,
        sessionId,
        getSessionCookieOptions(MFA_PENDING_DURATION_MS / 1000)
      );
      response.cookies.set(
        SESSION_COOKIE_NAME,
        "",
        getExpiredCookieOptions()
      );

      return response;
    }

    const sessionId = await createSession(user.id);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
    });

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
    logServerError("Login error", error);
    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 }
    );
  }
}
