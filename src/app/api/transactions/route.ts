import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export type TransactionRow = {
  id: number;
  accountId: string;
  transactionId: string;
  amount: string;
  date: string;
  merchantName: string | null;
  name: string;
  category: string | null;
  pending: boolean;
  isoCurrencyCode: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10),
      200
    );

    const rows = await db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit);

    const result: TransactionRow[] = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionId: row.transactionId,
      amount: row.amount,
      date: row.date,
      merchantName: row.merchantName,
      name: row.name,
      category: row.category,
      pending: row.pending,
      isoCurrencyCode: row.isoCurrencyCode,
    }));

    return NextResponse.json({ transactions: result });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
