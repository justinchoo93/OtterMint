import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { accounts, firePlans, manualAccounts, plaidItems } from "@/lib/db/schema";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
import { aggregateCashflow } from "@/lib/cashflow";
import { suggestKind, summarizeCashflow, type FireAppAccount, type FirePlan, type FireResponse } from "@/lib/fire-model";
import { validateFirePlan } from "@/lib/validate-fire-plan";

export type { FireResponse } from "@/lib/fire-model";

/** Thirteen calendar months back to this one: twelve complete months plus the current, partial one. */
const CASHFLOW_MONTHS = 13;

function toNumber(value: string | null): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const userId = await getUserId();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CASHFLOW_MONTHS - 1), 1))
      .toISOString()
      .slice(0, 10);

    const { rows, plaidRows, manualRows, planRow } = await withUser(userId, async (tx) => {
      const rows = await selectClassifiedTransactionRows(tx, userId, since);
      // Filter on the owner explicitly: the group-read policies would also
      // return a fellow member's accounts.
      const plaidRows = await tx
        .select({
          accountId: accounts.accountId,
          name: accounts.name,
          mask: accounts.mask,
          type: accounts.type,
          subtype: accounts.subtype,
          currentBalance: accounts.currentBalance,
          institutionName: plaidItems.institutionName,
        })
        .from(accounts)
        .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
        .where(and(eq(plaidItems.userId, userId), inArray(accounts.type, ["investment", "depository"])));
      const manualRows = await tx
        .select({ id: manualAccounts.id, name: manualAccounts.name, type: manualAccounts.type, subtype: manualAccounts.subtype, balance: manualAccounts.balance })
        .from(manualAccounts)
        .where(and(eq(manualAccounts.userId, userId), eq(manualAccounts.type, "asset")));
      const [planRow] = await tx
        .select({ plan: firePlans.plan, updatedAt: firePlans.updatedAt })
        .from(firePlans)
        .where(eq(firePlans.userId, userId))
        .limit(1);
      return { rows, plaidRows, manualRows, planRow };
    });

    const appAccounts: FireAppAccount[] = [
      // Investment accounts first, then checking and savings; largest first within each.
      ...plaidRows
        .map((row) => ({
          key: `plaid:${row.accountId}`,
          name: row.name,
          detail: row.mask ? `${row.institutionName} ····${row.mask}` : row.institutionName,
          source: "plaid" as const,
          balance: toNumber(row.currentBalance),
          suggestedKind: suggestKind("plaid", row.type, row.subtype, row.name),
        }))
        .sort((a, b) => Number(a.suggestedKind === "excluded") - Number(b.suggestedKind === "excluded") || b.balance - a.balance),
      ...manualRows
        .map((row) => ({
          key: `manual:${row.id}`,
          name: row.name,
          detail: "Manual account",
          source: "manual" as const,
          balance: toNumber(row.balance),
          suggestedKind: suggestKind("manual", row.type, row.subtype, row.name),
        }))
        .sort((a, b) => b.balance - a.balance),
    ];

    // Re-validate what is stored, so a plan saved under older rules never
    // reaches the model in a shape it does not expect.
    let plan: FirePlan | null = null;
    if (planRow) {
      const validation = validateFirePlan(planRow.plan);
      if (validation.success) plan = validation.plan;
      else logServerError("Stored FIRE plan failed validation", new Error(validation.error));
    }

    const result: FireResponse = {
      asOf: today,
      cashflow: summarizeCashflow(aggregateCashflow(rows, { months: CASHFLOW_MONTHS, today })),
      accounts: appAccounts,
      plan,
      savedAt: plan && planRow ? planRow.updatedAt.toISOString() : null,
    };
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to load the FIRE plan", error);
    return NextResponse.json({ error: "Failed to load the FIRE plan" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }
    const validation = validateFirePlan(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const plan = validation.plan;
    const updatedAt = new Date();
    await withUser(userId, (tx) =>
      tx
        .insert(firePlans)
        .values({ userId, plan, updatedAt })
        .onConflictDoUpdate({ target: firePlans.userId, set: { plan, updatedAt } })
    );
    return NextResponse.json({ plan, savedAt: updatedAt.toISOString() });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to save the FIRE plan", error);
    return NextResponse.json({ error: "Failed to save the FIRE plan" }, { status: 500 });
  }
}
