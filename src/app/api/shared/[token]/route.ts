import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  shareLinks,
  accounts,
  plaidItems,
  manualAccounts,
  transactions,
  userNetWorthSnapshots,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, asc, desc, isNull, inArray, getTableColumns } from "drizzle-orm";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const limited = await enforceRateLimit("shareLookup", getClientIp(request));
    if (limited) return limited;

    // Look up share link
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(
        and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt))
      );

    if (!link) {
      return NextResponse.json(
        { error: "This share link is no longer available" },
        { status: 404 }
      );
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 }
      );
    }

    // Get user info
    const [user] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, link.userId));

    const result: Record<string, unknown> = {
      label: link.label,
      displayName: user?.displayName ?? "Someone",
    };

    // Include net worth data
    if (link.includeNetWorth) {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 90);
      const sinceDateStr = sinceDate.toISOString().split("T")[0];

      const snapshots = await db
        .select()
        .from(userNetWorthSnapshots)
        .where(
          and(
            eq(userNetWorthSnapshots.userId, link.userId),
            gte(userNetWorthSnapshots.date, sinceDateStr)
          )
        )
        .orderBy(asc(userNetWorthSnapshots.date));

      result.snapshots = snapshots.map((s) => ({
        date: s.date,
        totalAssets: s.totalAssets,
        totalLiabilities: s.totalLiabilities,
        netWorth: s.netWorth,
      }));
    }

    // Include balance data
    if (link.includeBalances) {
      const userPlaidItems = await db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.userId, link.userId));

      const itemIds = userPlaidItems.map((i) => i.id);

      const plaidAccounts =
        itemIds.length > 0
          ? await db
              .select({
                name: accounts.name,
                type: accounts.type,
                subtype: accounts.subtype,
                mask: accounts.mask,
                currentBalance: accounts.currentBalance,
                institutionName: plaidItems.institutionName,
              })
              .from(accounts)
              .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
              .where(inArray(accounts.plaidItemId, itemIds))
          : [];

      const userManual = await db
        .select({
          name: manualAccounts.name,
          type: manualAccounts.type,
          subtype: manualAccounts.subtype,
          balance: manualAccounts.balance,
        })
        .from(manualAccounts)
        .where(eq(manualAccounts.userId, link.userId));

      result.accounts = plaidAccounts;
      result.manualAccounts = userManual;
    }

    // Include transactions data
    if (link.includeTransactions) {
      const userPlaidItems = await db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(eq(plaidItems.userId, link.userId));

      const itemIds = userPlaidItems.map((i) => i.id);

      if (itemIds.length > 0) {
        const userAccounts = await db
          .select({ accountId: accounts.accountId })
          .from(accounts)
          .where(inArray(accounts.plaidItemId, itemIds));

        const accountIds = userAccounts.map((a) => a.accountId);

        const txns =
          accountIds.length > 0
            ? await db
                .select({
                  date: transactions.date,
                  name: transactions.name,
                  merchantName: transactions.merchantName,
                  amount: transactions.amount,
                  category: transactions.category,
                })
                .from(transactions)
                .where(inArray(transactions.accountId, accountIds))
                .orderBy(desc(transactions.date), desc(transactions.id))
                .limit(200)
            : [];

        result.transactions = txns;
      } else {
        result.transactions = [];
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch shared data:", error);
    return NextResponse.json(
      { error: "Failed to fetch shared data" },
      { status: 500 }
    );
  }
}
