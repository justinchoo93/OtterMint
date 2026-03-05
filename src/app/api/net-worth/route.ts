import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userNetWorthSnapshots } from "@/lib/db/schema";
import { asc, and, gte, eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";

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
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsedDays = parseInt(searchParams.get("days") ?? "90", 10);
    const days = Number.isNaN(parsedDays) || parsedDays < 1 ? 90 : Math.min(parsedDays, 365);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const rows = await db
      .select()
      .from(userNetWorthSnapshots)
      .where(
        and(
          eq(userNetWorthSnapshots.userId, userId),
          gte(userNetWorthSnapshots.date, sinceDateStr)
        )
      )
      .orderBy(asc(userNetWorthSnapshots.date));

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
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch net worth history:", error);
    return NextResponse.json(
      { error: "Failed to fetch net worth history" },
      { status: 500 }
    );
  }
}
