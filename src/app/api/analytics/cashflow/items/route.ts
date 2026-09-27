import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/logging";
import { getUserId, isAuthError } from "@/lib/auth/get-user-id";
import { withUser } from "@/lib/db/with-user";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";
import {
  selectCashflowItems,
  type CashflowItemsOptions,
  type CashflowLineItem,
} from "@/lib/cashflow";

export type CashflowItemsResponse = {
  items: CashflowLineItem[];
  count: number;
  total: string;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const CATEGORY = /^[A-Z0-9_]{1,80}$/;
const FLOWS = new Set(["income", "spending", "savings"]);
const MAX_CATEGORIES = 100;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type Parsed = { ok: true; options: CashflowItemsOptions } | { ok: false; error: string };

function parse(params: URLSearchParams): Parsed {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!MONTH.test(from)) return { ok: false, error: "from must be YYYY-MM" };
  if (!MONTH.test(to)) return { ok: false, error: "to must be YYYY-MM" };
  if (from > to) return { ok: false, error: "from must not be after to" };

  const flow = params.get("flow") ?? "";
  if (!FLOWS.has(flow)) return { ok: false, error: "flow must be income, spending or savings" };

  const categories = params.getAll("category");
  const excluded = params.getAll("exclude");
  if (categories.length > 0 && excluded.length > 0) {
    return { ok: false, error: "use category or exclude, not both" };
  }
  if (categories.length > MAX_CATEGORIES || excluded.length > MAX_CATEGORIES) {
    return { ok: false, error: `at most ${MAX_CATEGORIES} category or exclude values` };
  }
  if ([...categories, ...excluded].some((c) => !CATEGORY.test(c))) {
    return { ok: false, error: "category and exclude values must be uppercase category keys" };
  }

  const sort = params.get("sort") ?? "date";
  if (sort !== "date" && sort !== "amount") return { ok: false, error: "sort must be date or amount" };

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { ok: false, error: `limit must be an integer from 1 to ${MAX_LIMIT}` };
  }

  return {
    ok: true,
    options: {
      from,
      to,
      flow: flow as CashflowItemsOptions["flow"],
      categoryKeys: categories.length > 0 ? categories : undefined,
      excludeCategoryKeys: excluded.length > 0 ? excluded : undefined,
      sort,
      limit,
    },
  };
}

/**
 * GET /api/analytics/cashflow/items?from=YYYY-MM&to=YYYY-MM&flow=spending
 *   [&category=KEY ... | &exclude=KEY ...][&sort=date|amount][&limit=N]
 * The transactions behind one cash-flow figure, for the Analytics details
 * panel. Reads through the shared classified-rows helper so category
 * corrections apply, exactly as the monthly cash-flow route does.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const parsed = parse(new URL(request.url).searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const rows = await withUser(userId, (tx) =>
      selectClassifiedTransactionRows(tx, userId, `${parsed.options.from}-01`)
    );
    const result: CashflowItemsResponse = selectCashflowItems(rows, parsed.options);
    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logServerError("Failed to list cash-flow items", error);
    return NextResponse.json(
      { error: "Failed to list cash-flow items" },
      { status: 500 }
    );
  }
}
