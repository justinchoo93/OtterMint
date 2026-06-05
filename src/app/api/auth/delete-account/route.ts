import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import { users, plaidItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { verifyPassword } from "@/lib/auth/password";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import {
  getExpiredCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { logServerError } from "@/lib/logging";

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json().catch(() => ({}));
    const password = body?.password;
    const code = body?.code;

    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    // Re-authenticate before this irreversible action
    const [user] = await withUser(userId, (tx) =>
      tx
        .select({
          passwordHash: users.passwordHash,
          mfaEnabled: users.mfaEnabled,
          totpSecret: users.totpSecret,
        })
        .from(users)
        .where(eq(users.id, userId))
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    if (user.mfaEnabled) {
      if (typeof code !== "string" || code.length === 0) {
        return NextResponse.json(
          { error: "Verification code is required" },
          { status: 403 }
        );
      }
      if (!user.totpSecret) {
        return NextResponse.json(
          { error: "MFA is not configured" },
          { status: 401 }
        );
      }
      const secretBase32 = decrypt(user.totpSecret);
      const totp = new TOTP({ issuer: "OtterMint", secret: secretBase32 });
      if (totp.validate({ token: code, window: 1 }) === null) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 401 }
        );
      }
    }

    // Revoke Plaid access tokens before deleting, then delete the user — all
    // under the user's RLS scope. Cascade handles related data:
    // sessions, plaidItems -> accounts -> transactions/holdings,
    // manualAccounts, shareLinks, userNetWorthSnapshots, groupMembers.
    await withUser(userId, async (tx) => {
      const items = await tx
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.userId, userId));

      for (const item of items) {
        try {
          const accessToken = decrypt(item.accessTokenEncrypted);
          await plaidClient.itemRemove({ access_token: accessToken });
        } catch (err) {
          // Log but don't block deletion if Plaid revocation fails
          logServerError(
            `Failed to revoke Plaid token for ${item.institutionName}`,
            err
          );
        }
      }

      await tx.delete(users).where(eq(users.id, userId));
    });

    const response = NextResponse.json({ success: true });

    response.cookies.set(SESSION_COOKIE_NAME, "", getExpiredCookieOptions());
    response.cookies.set(
      MFA_PENDING_COOKIE_NAME,
      "",
      getExpiredCookieOptions()
    );

    return response;
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Account deletion error", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
