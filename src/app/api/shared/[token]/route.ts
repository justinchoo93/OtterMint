import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { db } from "@/lib/db";
import {
  accounts,
  plaidItems,
  manualAccounts,
  transactions,
  userNetWorthSnapshots,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, asc, desc, inArray, sql } from "drizzle-orm";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { withUser } from "@/lib/db/with-user";

interface ShareLinkRow {
  user_id: string;
  label: string | null;
  include_net_worth: boolean;
  include_balances: boolean;
  include_transactions: boolean;
  expires_at: Date | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const limited = await enforceRateLimit("shareLookup", getClientIp(request));
    if (limited) return limited;

    // Resolve the share link's owner + flags via the SECURITY DEFINER (the
    // token is the capability; no public-facing policy opens any table).
    const linkRows = (await db.execute(
      sql`select * from resolve_share_link(${token})`
    )) as unknown as ShareLinkRow[];
    const link = linkRows[0];

    if (!link) {
      return NextResponse.json(
        { error: "This share link is no longer available" },
        { status: 404 }
      );
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 }
      );
    }

    const ownerId = link.user_id;

    // Run all permitted reads while impersonating the consenting owner, so RLS
    // grants exactly the owner's own rows — which is what the link permits.
    const result = await withUser(ownerId, async (tx) => {
      const result: Record<string, unknown> = { label: link.label };

      // Owner's display name (users_self permits the owner reading their row).
      const [user] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, ownerId));
      result.displayName = user?.displayName ?? "Someone";

      // Include net worth data
      if (link.include_net_worth) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 90);
        const sinceDateStr = sinceDate.toISOString().split("T")[0];

        const snapshots = await tx
          .select()
          .from(userNetWorthSnapshots)
          .where(
            and(
              eq(userNetWorthSnapshots.userId, ownerId),
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
      if (link.include_balances) {
        const userPlaidItems = await tx
          .select()
          .from(plaidItems)
          .where(eq(plaidItems.userId, ownerId));

        const itemIds = userPlaidItems.map((i) => i.id);

        const plaidAccounts =
          itemIds.length > 0
            ? await tx
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

        const userManual = await tx
          .select({
            name: manualAccounts.name,
            type: manualAccounts.type,
            subtype: manualAccounts.subtype,
            balance: manualAccounts.balance,
          })
          .from(manualAccounts)
          .where(eq(manualAccounts.userId, ownerId));

        result.accounts = plaidAccounts;
        result.manualAccounts = userManual;
      }

      // Include transactions data
      if (link.include_transactions) {
        const userPlaidItems = await tx
          .select({ id: plaidItems.id })
          .from(plaidItems)
          .where(eq(plaidItems.userId, ownerId));

        const itemIds = userPlaidItems.map((i) => i.id);

        if (itemIds.length > 0) {
          const userAccounts = await tx
            .select({ accountId: accounts.accountId })
            .from(accounts)
            .where(inArray(accounts.plaidItemId, itemIds));

          const accountIds = userAccounts.map((a) => a.accountId);

          const txns =
            accountIds.length > 0
              ? await tx
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

      return result;
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("Failed to fetch shared data", error);
    return NextResponse.json(
      { error: "Failed to fetch shared data" },
      { status: 500 }
    );
  }
}
