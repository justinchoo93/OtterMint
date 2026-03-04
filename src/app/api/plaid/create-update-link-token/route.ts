import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { db } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { CountryCode } from "plaid";

export async function POST(request: NextRequest) {
  try {
    const { itemId } = await request.json();

    const [item] = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.id, itemId));

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const accessToken = decrypt(item.accessTokenEncrypted);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "otterfin-user" },
      client_name: "OtterFin",
      access_token: accessToken,
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Failed to create update link token:", error);
    return NextResponse.json(
      { error: "Failed to create update link token" },
      { status: 500 }
    );
  }
}
