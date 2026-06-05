import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import {
  accounts,
  plaidItems,
  manualAccounts,
  groupMembers,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: groupId } = await params;

    const data = await withUser(userId, async (tx) => {
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

      // Get all member IDs
      const members = await tx
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));

      const memberIds = members.map((m) => m.userId);

      // Get all plaid items for group members (group-aware read policies allow
      // a member to read fellow members' rows).
      const memberPlaidItems = await tx
        .select()
        .from(plaidItems)
        .where(inArray(plaidItems.userId, memberIds));

      const memberItemIds = memberPlaidItems.map((i) => i.id);

      // Get all accounts
      const allAccounts =
        memberItemIds.length > 0
          ? await tx
              .select()
              .from(accounts)
              .where(inArray(accounts.plaidItemId, memberItemIds))
          : [];

    // Map accounts with institution info
    const accountResults = allAccounts.map((acct) => {
      const item = memberPlaidItems.find((i) => i.id === acct.plaidItemId);
      return {
        id: acct.id,
        accountId: acct.accountId,
        name: acct.name,
        officialName: acct.officialName,
        type: acct.type,
        subtype: acct.subtype,
        mask: acct.mask,
        currentBalance: acct.currentBalance,
        availableBalance: acct.availableBalance,
        limitAmount: acct.limitAmount,
        isoCurrencyCode: acct.isoCurrencyCode,
        lastRefreshedAt: acct.lastRefreshedAt?.toISOString() ?? null,
        institutionName: item?.institutionName ?? "Unknown",
        errorCode: item?.errorCode ?? null,
        userId: item?.userId ?? null,
      };
    });

      // Get all manual accounts for group members
      const allManual = await tx
        .select()
        .from(manualAccounts)
        .where(inArray(manualAccounts.userId, memberIds));

      const manualResults = allManual.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        subtype: row.subtype,
        balance: row.balance,
        isoCurrencyCode: row.isoCurrencyCode,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        userId: row.userId,
      }));

      return { forbidden: false as const, accountResults, manualResults };
    });

    if (data.forbidden) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      accounts: data.accountResults,
      manualAccounts: data.manualResults,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to fetch group accounts", error);
    return NextResponse.json(
      { error: "Failed to fetch group accounts" },
      { status: 500 }
    );
  }
}
