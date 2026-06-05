import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { plaidClient } from "@/lib/plaid";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function POST() {
  try {
    const userId = await getUserId();

    const req: LinkTokenCreateRequest = {
      user: { client_user_id: `user-${userId}` },
      client_name: "OtterMint",
      products: [Products.Transactions],
      optional_products: [Products.Investments],
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
    logServerError("Failed to create link token", error);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
