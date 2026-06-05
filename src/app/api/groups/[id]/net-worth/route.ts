import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { groupNetWorthSnapshots, groupMembers } from "@/lib/db/schema";
import { asc, and, gte, eq } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    const { searchParams } = new URL(request.url);
    const parsedDays = parseInt(searchParams.get("days") ?? "90", 10);
    const days = Number.isNaN(parsedDays) || parsedDays < 1 ? 90 : Math.min(parsedDays, 365);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const outcome = await withUser(userId, async (tx) => {
      // Verify membership
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        );

      if (!membership) {
        return { forbidden: true as const };
      }

      const rows = await tx
        .select()
        .from(groupNetWorthSnapshots)
        .where(
          and(
            eq(groupNetWorthSnapshots.groupId, groupId),
            gte(groupNetWorthSnapshots.date, sinceDateStr)
          )
        )
        .orderBy(asc(groupNetWorthSnapshots.date));

      return { forbidden: false as const, rows };
    });

    if (outcome.forbidden) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    const result = outcome.rows.map((row) => ({
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
    logServerError("Failed to fetch group net worth", error);
    return NextResponse.json(
      { error: "Failed to fetch group net worth" },
      { status: 500 }
    );
  }
}
