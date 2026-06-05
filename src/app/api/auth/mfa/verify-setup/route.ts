import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import { getUserId } from "@/lib/auth/get-user-id";
import { decrypt } from "@/lib/crypto";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import {
  formatLockoutMessage,
  getLockoutState,
  isCurrentlyLocked,
  MAX_MFA_ATTEMPTS,
  MFA_LOCKOUT_MS,
} from "@/lib/auth/login-lockout";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import { logServerError } from "@/lib/logging";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const code = body?.code;

    if (typeof code !== "string" || !code) {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      );
    }

    // Read the current session row to drive per-session lockout. Validate the
    // cookie's UUID and ownership so an attacker cannot mix sessions/users.
    const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (typeof sessionId !== "string" || !UUID_REGEX.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    return await withUser(userId, async (tx) => {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      if (!session || session.userId !== userId) {
        return NextResponse.json({ error: "Invalid session" }, { status: 400 });
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

      const [user] = await tx
        .select({ totpSecret: users.totpSecret })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.totpSecret) {
        return NextResponse.json(
          { error: "MFA setup not initiated" },
          { status: 400 }
        );
      }

      const secretBase32 = decrypt(user.totpSecret);
      const totp = new TOTP({
        issuer: "OtterMint",
        secret: secretBase32,
      });

      const isValid = totp.validate({ token: code, window: 1 }) !== null;

      if (!isValid) {
        const lockoutState = getLockoutState({
          failedAttempts: session.mfaFailedAttempts,
          maxAttempts: MAX_MFA_ATTEMPTS,
          lockoutMs: MFA_LOCKOUT_MS,
        });

        await tx
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
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      await tx
        .update(sessions)
        .set({ mfaFailedAttempts: 0, mfaLockedUntil: null })
        .where(eq(sessions.id, sessionId));

      await tx
        .update(users)
        .set({ mfaEnabled: true, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("MFA verify-setup error", error);
    return NextResponse.json(
      { error: "Failed to verify MFA setup" },
      { status: 500 }
    );
  }
}
