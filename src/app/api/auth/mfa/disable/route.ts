import { NextRequest, NextResponse } from "next/server";
import { TOTP } from "otpauth";
import { getUserId } from "@/lib/auth/get-user-id";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAuthError } from "@/lib/auth/get-user-id";
import { logServerError } from "@/lib/logging";

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

    const [user] = await db
      .select({ totpSecret: users.totpSecret, mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.totpSecret || !user.mfaEnabled) {
      return NextResponse.json(
        { error: "MFA is not enabled" },
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
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({
        mfaEnabled: false,
        totpSecret: null,
        recoveryCodes: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("MFA disable error", error);
    return NextResponse.json(
      { error: "Failed to disable MFA" },
      { status: 500 }
    );
  }
}
