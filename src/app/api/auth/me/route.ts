import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function GET() {
  try {
    const userId = await getUserId();

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // Update display name
    if (body.displayName !== undefined) {
      if (
        typeof body.displayName !== "string" ||
        body.displayName.trim().length === 0
      ) {
        return NextResponse.json(
          { error: "Name is required" },
          { status: 400 }
        );
      }
      updates.displayName = body.displayName.trim();
    }

    // Change password
    if (body.newPassword !== undefined) {
      if (typeof body.currentPassword !== "string" || !body.currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      if (
        typeof body.newPassword !== "string" ||
        body.newPassword.length < 8
      ) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters" },
          { status: 400 }
        );
      }

      // Verify current password
      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      const valid = await verifyPassword(
        body.currentPassword,
        user.passwordHash
      );
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }

      updates.passwordHash = await hashPassword(body.newPassword);
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    // Return updated user
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, userId));

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to update user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
