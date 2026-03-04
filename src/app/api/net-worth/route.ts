import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import { asc, gte } from "drizzle-orm";

export type NetWorthSnapshotRow = {
  date: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  depositoryTotal: string | null;
  creditTotal: string | null;
  investmentTotal: string | null;
  loanTotal: string | null;
  manualAssetsTotal: string | null;
  manualLiabilitiesTotal: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(
      parseInt(searchParams.get("days") ?? "90", 10),
      365
    );

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const rows = await db
      .select()
      .from(netWorthSnapshots)
      .where(gte(netWorthSnapshots.date, sinceDateStr))
      .orderBy(asc(netWorthSnapshots.date));

    const result: NetWorthSnapshotRow[] = rows.map((row) => ({
      date: row.date,
      totalAssets: row.totalAssets,
      totalLiabilities: row.totalLiabilities,
      netWorth: row.netWorth,
      depositoryTotal: row.depositoryTotal,
      creditTotal: row.creditTotal,
      investmentTotal: row.investmentTotal,
      loanTotal: row.loanTotal,
      manualAssetsTotal: row.manualAssetsTotal,
      manualLiabilitiesTotal: row.manualLiabilitiesTotal,
    }));

    return NextResponse.json({ snapshots: result });
  } catch (error) {
    console.error("Failed to fetch net worth history:", error);
    return NextResponse.json(
      { error: "Failed to fetch net worth history" },
      { status: 500 }
    );
  }
}
