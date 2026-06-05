import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  getExpiredCookieOptions,
  getSessionCookieOptions,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookies";
import { logServerError } from "@/lib/logging";
import { FIELD_LIMITS, validateBoundedString } from "@/lib/validate-request";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    const { email, password, displayName, consentGiven } = body;

    // Validate inputs
    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    if (!consentGiven) {
      return NextResponse.json(
        { error: "You must agree to the privacy policy to create an account" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const displayNameResult = validateBoundedString(
      displayName,
      "name",
      FIELD_LIMITS.DISPLAY_NAME
    );
    if (!displayNameResult.success) {
      return NextResponse.json(
        { error: displayNameResult.error },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      [user] = await db
        .insert(users)
        .values({
          email: email.toLowerCase().trim(),
          passwordHash,
          displayName: displayName.trim(),
          consentGivenAt: new Date(),
        })
        .returning();
    } catch (err: unknown) {
      // Check for unique constraint violation (duplicate email)
      if (
        err instanceof Error &&
        err.message.includes("unique")
      ) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      throw err;
    }

    const sessionId = await createSession(user.id);

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
      },
      { status: 201 }
    );

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
    logServerError("Registration error", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
