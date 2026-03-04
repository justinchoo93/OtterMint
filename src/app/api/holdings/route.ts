import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";

export type HoldingRow = {
  id: number;
  accountId: string;
  securityId: string;
  name: string;
  tickerSymbol: string | null;
  quantity: string;
  price: string;
  value: string;
  costBasis: string | null;
  isoCurrencyCode: string | null;
};

export async function GET() {
  try {
    const rows = await db.select().from(holdings);

    const result: HoldingRow[] = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      securityId: row.securityId,
      name: row.name,
      tickerSymbol: row.tickerSymbol,
      quantity: row.quantity,
      price: row.price,
      value: row.value,
      costBasis: row.costBasis,
      isoCurrencyCode: row.isoCurrencyCode,
    }));

    return NextResponse.json({ holdings: result });
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    return NextResponse.json(
      { error: "Failed to fetch holdings" },
      { status: 500 }
    );
  }
}
