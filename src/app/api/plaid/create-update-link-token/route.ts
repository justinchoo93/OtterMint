import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { db } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { eq, and } from "drizzle-orm";
import { CountryCode } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { logServerError } from "@/lib/logging";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { itemId } = await request.json();

    const [item] = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.id, itemId), eq(plaidItems.userId, userId)));

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const accessToken = decrypt(item.accessTokenEncrypted);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: `user-${userId}` },
      client_name: "OtterMint",
      access_token: accessToken,
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to create update link token", error);
    return NextResponse.json(
      { error: "Failed to create update link token" },
      { status: 500 }
    );
  }
}
