import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, plaidItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export async function DELETE() {
  try {
    const userId = await getUserId();

    // Revoke Plaid access tokens before deleting
    const items = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.userId, userId));

    for (const item of items) {
      try {
        const accessToken = decrypt(item.accessTokenEncrypted);
        await plaidClient.itemRemove({ access_token: accessToken });
      } catch (err) {
        // Log but don't block deletion if Plaid revocation fails
        console.error(
          `Failed to revoke Plaid token for ${item.institutionName}:`,
          err
        );
      }
    }

    // Delete user — cascade handles all related data:
    // sessions, plaidItems -> accounts -> transactions/holdings,
    // manualAccounts, shareLinks, userNetWorthSnapshots, groupMembers
    await db.delete(users).where(eq(users.id, userId));

    const response = NextResponse.json({ success: true });

    // Clear session cookie
    response.cookies.set("session_id", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
