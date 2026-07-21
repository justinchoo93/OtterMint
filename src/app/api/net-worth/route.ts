import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { buildUserNetWorthHistory } from "@/lib/net-worth-history-server";

export type { NetWorthSnapshotRow } from "@/lib/net-worth-history";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const parsedDays = parseInt(searchParams.get("days") ?? "90", 10);
    const days = Number.isNaN(parsedDays) || parsedDays < 1 ? 90 : Math.min(parsedDays, 365);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const history = await withUser(userId, (tx) =>
      buildUserNetWorthHistory(userId, sinceDateStr, tx)
    );

    return NextResponse.json(history);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch net worth history", error);
    return NextResponse.json(
      { error: "Failed to fetch net worth history" },
      { status: 500 }
    );
  }
}
