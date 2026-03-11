import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { TOTP, Secret } from "otpauth";
import * as QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { getUserId } from "@/lib/auth/get-user-id";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAuthError } from "@/lib/auth/get-user-id";
import { logServerError } from "@/lib/logging";

export async function POST() {
  try {
    const userId = await getUserId();

    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate TOTP secret
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: "OtterFin",
      label: user.email,
      secret,
    });

    // Generate QR code
    const otpauthUrl = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Generate 8 recovery codes
    const recoveryCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      recoveryCodes.push(randomBytes(4).toString("hex"));
    }

    // Hash recovery codes for storage
    const hashedCodes = await Promise.all(
      recoveryCodes.map((code) => bcrypt.hash(code, 10))
    );

    // Store encrypted secret + hashed recovery codes (don't enable MFA yet)
    const encryptedSecret = encrypt(secret.base32);
    await db
      .update(users)
      .set({
        totpSecret: encryptedSecret,
        recoveryCodes: JSON.stringify(hashedCodes),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      qrCodeUrl,
      secret: secret.base32,
      recoveryCodes,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("MFA setup error", error);
    return NextResponse.json(
      { error: "Failed to set up MFA" },
      { status: 500 }
    );
  }
}
