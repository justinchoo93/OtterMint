import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { plaidItems } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { eq, and } from "drizzle-orm";
import { CountryCode, type LinkTokenCreateRequest } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { logServerError } from "@/lib/logging";
import { validateBoundedInteger } from "@/lib/validate-request";

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { itemId } = await request.json();

    const itemIdResult = validateBoundedInteger(
      itemId,
      "itemId",
      1,
      Number.MAX_SAFE_INTEGER
    );
    if (!itemIdResult.success) {
      return NextResponse.json({ error: itemIdResult.error }, { status: 400 });
    }

    const [item] = await withUser(userId, (tx) =>
      tx
        .select()
        .from(plaidItems)
        .where(and(eq(plaidItems.id, itemId), eq(plaidItems.userId, userId)))
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const accessToken = decrypt(item.accessTokenEncrypted);

    const req: LinkTokenCreateRequest = {
      user: { client_user_id: `user-${userId}` },
      client_name: "OtterMint",
      access_token: accessToken,
      country_codes: [CountryCode.Us],
      language: "en",
    };
    // Only send these when configured: an empty redirect_uri breaks sandbox linking.
    if (process.env.PLAID_REDIRECT_URI)
      req.redirect_uri = process.env.PLAID_REDIRECT_URI;
    if (process.env.PLAID_WEBHOOK_URL)
      req.webhook = process.env.PLAID_WEBHOOK_URL;

    const response = await plaidClient.linkTokenCreate(req);

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
