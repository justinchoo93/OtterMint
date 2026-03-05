import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

export async function POST() {
  try {
    const userId = await getUserId();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: `user-${userId}` },
      client_name: "OtterFin",
      products: [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to create link token:", error);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
