// Pure cash-flow classification and aggregation. No server-only imports:
// client components use the types and label helper, the API route uses the
// aggregation. The taxonomy decisions are recorded in
// docs/plans/cash-flow-analytics.md (Decision Log).

export type FlowType = "income" | "spending" | "savings" | "internal";

export interface ClassifiableTransaction {
  /** Plaid sign convention: positive = money left the account. */
  amount: string;
  /** Plaid primary category, e.g. "FOOD_AND_DRINK". */
  category: string | null;
  /** Plaid detailed category, e.g. "FOOD_AND_DRINK_RESTAURANTS". */
  categoryDetailed: string | null;
  /** accounts.type: depository | credit | investment | loan. */
  accountType: string;
  /** accounts.subtype: checking | savings | ... */
  accountSubtype: string | null;
}

export interface CashflowRow extends ClassifiableTransaction {
  /** Transaction date, "YYYY-MM-DD". */
  date: string;
  pending: boolean;
  name: string;
  merchantName: string | null;
  /** accounts.name, for line-item display. */
  accountName: string;
}

export interface CashflowLineItem {
  date: string;
  /** Display-signed: income received is positive; savings contributions
      positive, withdrawals negative. */
  amount: string;
  name: string;
  merchantName: string | null;
  /** categoryDetailed ?? category ?? "UNCATEGORIZED" — feed to
      labelForCategoryKey for display. */
  categoryKey: string;
  accountName: string;
}

export interface CashflowCategoryTotal {
  /** categoryDetailed ?? category ?? "UNCATEGORIZED". */
  key: string;
  /** Primary category the key belongs to, or "UNCATEGORIZED". */
  primary: string;
  total: string;
}

export interface CashflowMonth {
  /** "YYYY-MM". */
  month: string;
  /** True only for the current (incomplete) month. */
  partial: boolean;
  income: string;
  spending: string;
  savings: string;
  netCashFlow: string;
  spendingByCategory: CashflowCategoryTotal[];
  /** The line items behind the income total, date-ascending. */
  incomeItems: CashflowLineItem[];
  /** The line items behind the savings total, date-ascending. */
  savingsItems: CashflowLineItem[];
}

// Plaid's primary personal-finance categories. Used to derive the primary
// from a detailed value when the primary column is null, and to prettify
// detailed keys by stripping their primary prefix. Longest-prefix match, so
// order does not matter. Not assumed exhaustive - unknown values fall through
// to direction-based defaults.
const KNOWN_PRIMARIES = [
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "HOME_IMPROVEMENT",
  "INCOME",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "PERSONAL_CARE",
  "RENT_AND_UTILITIES",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSPORTATION",
  "TRAVEL",
];

function primaryOf(txn: ClassifiableTransaction): string | null {
  if (txn.category) return txn.category;
  if (!txn.categoryDetailed) return null;
  let match: string | null = null;
  for (const primary of KNOWN_PRIMARIES) {
    if (
      txn.categoryDetailed.startsWith(primary) &&
      (!match || primary.length > match.length)
    ) {
      match = primary;
    }
  }
  return match;
}

/**
 * Partition a transaction into exactly one flow type. Rules are ordered;
 * first match wins. See the Decision Log in docs/plans/cash-flow-analytics.md
 * for the rationale behind each rule.
 */
export function classifyTransaction(txn: ClassifiableTransaction): FlowType {
  const detailed = txn.categoryDetailed;

  // 1. Credit-card payments are internal on both sides: the purchases the
  // payment settles were already counted as spending on the card.
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "internal";

  // 2. Money sent to investment or savings destinations is saved, not spent.
  if (
    detailed === "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS" ||
    detailed === "TRANSFER_OUT_SAVINGS"
  ) {
    return "savings";
  }

  // 3. Money arriving from investments is a withdrawal; its negative amount
  // subtracts from the savings total.
  if (detailed === "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS") {
    return "savings";
  }

  // 4. TRANSFER_IN_SAVINGS landing in a savings account is the receiving side
  // of a contribution already counted from the sending side; anywhere else it
  // is money pulled out of savings (negative amount subtracts).
  if (detailed === "TRANSFER_IN_SAVINGS") {
    return txn.accountSubtype === "savings" ? "internal" : "savings";
  }

  // 5. Moves between the user's own accounts, deposits of unknown origin,
  // loan proceeds, and unrecognized inflows are neutral plumbing.
  if (
    detailed === "TRANSFER_OUT_ACCOUNT_TRANSFER" ||
    detailed === "TRANSFER_IN_ACCOUNT_TRANSFER" ||
    detailed === "TRANSFER_IN_DEPOSIT" ||
    detailed === "TRANSFER_IN_CASH_ADVANCES_AND_LOANS" ||
    detailed === "TRANSFER_IN_OTHER_TRANSFER_IN"
  ) {
    return "internal";
  }

  const primary = primaryOf(txn);

  // 6. Income proper.
  if (primary === "INCOME") return "income";

  // 7. Remaining transfers: unrecognized inflows stay neutral (don't flatter
  // income); unrecognized outflows count as spending (don't flatter savings).
  // Covers TRANSFER_OUT_WITHDRAWAL and TRANSFER_OUT_OTHER_TRANSFER_OUT.
  if (primary === "TRANSFER_IN") return "internal";
  if (primary === "TRANSFER_OUT") return "spending";

  // 8. No category at all: outflows are spending, inflows are income
  // (surfaced as "Uncategorized" so undercounted paychecks stay visible).
  if (primary === null) {
    return Number.parseFloat(txn.amount) > 0 ? "spending" : "income";
  }

  // 9. Everything else - purchases, bills, fees, and real debt service
  // (mortgage, car, student, personal loans) - is spending.
  return "spending";
}

function toCents(amount: string): number {
  const parsed = Number.parseFloat(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** List the last `months` months ending at `today`'s month, ascending. */
function monthWindow(today: string, months: number): string[] {
  const year = Number.parseInt(today.slice(0, 4), 10);
  const month = Number.parseInt(today.slice(5, 7), 10); // 1-based
  const window: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const total = year * 12 + (month - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    window.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return window;
}

/**
 * Aggregate rows into per-month cash-flow totals for the last `months`
 * calendar months up to and including today's month (zero-filled, ascending).
 * Pending rows are excluded. All arithmetic is integer cents so category
 * totals always reconcile exactly with the month's spending total.
 */
export function aggregateCashflow(
  rows: CashflowRow[],
  options: { months: number; today: string }
): CashflowMonth[] {
  const window = monthWindow(options.today, options.months);
  const currentMonth = options.today.slice(0, 7);

  const buckets = new Map<
    string,
    {
      income: number;
      spending: number;
      savings: number;
      byCategory: Map<string, { primary: string; cents: number }>;
      incomeItems: CashflowLineItem[];
      savingsItems: CashflowLineItem[];
    }
  >();
  for (const month of window) {
    buckets.set(month, {
      income: 0,
      spending: 0,
      savings: 0,
      byCategory: new Map(),
      incomeItems: [],
      savingsItems: [],
    });
  }

  // Line item for the drilldown; displayCents carries the display sign
  // (income received positive, savings withdrawals negative).
  const lineItem = (row: CashflowRow, displayCents: number): CashflowLineItem => ({
    date: row.date,
    amount: fromCents(displayCents),
    name: row.name,
    merchantName: row.merchantName,
    categoryKey: row.categoryDetailed ?? row.category ?? "UNCATEGORIZED",
    accountName: row.accountName,
  });

  for (const row of rows) {
    if (row.pending) continue;
    const bucket = buckets.get(row.date.slice(0, 7));
    if (!bucket) continue;

    const cents = toCents(row.amount);
    const flow = classifyTransaction(row);

    if (flow === "income") {
      // Inflows are negative in Plaid's convention; flip the sign.
      bucket.income += -cents;
      bucket.incomeItems.push(lineItem(row, -cents));
    } else if (flow === "savings") {
      // Signed sum: contributions (outflows) add, withdrawals subtract.
      bucket.savings += cents;
      bucket.savingsItems.push(lineItem(row, cents));
    } else if (flow === "spending") {
      bucket.spending += cents;
      const key = row.categoryDetailed ?? row.category ?? "UNCATEGORIZED";
      const primary = primaryOf(row) ?? "UNCATEGORIZED";
      const entry = bucket.byCategory.get(key) ?? { primary, cents: 0 };
      entry.cents += cents;
      bucket.byCategory.set(key, entry);
    }
    // internal: excluded from every total.
  }

  const byDateThenName = (a: CashflowLineItem, b: CashflowLineItem) =>
    a.date.localeCompare(b.date) || a.name.localeCompare(b.name);

  return window.map((month) => {
    const bucket = buckets.get(month)!;
    return {
      month,
      partial: month === currentMonth,
      income: fromCents(bucket.income),
      spending: fromCents(bucket.spending),
      savings: fromCents(bucket.savings),
      netCashFlow: fromCents(bucket.income - bucket.spending),
      incomeItems: bucket.incomeItems.sort(byDateThenName),
      savingsItems: bucket.savingsItems.sort(byDateThenName),
      spendingByCategory: [...bucket.byCategory.entries()]
        .map(([key, { primary, cents }]) => ({
          key,
          primary,
          total: fromCents(cents),
        }))
        .sort(
          (a, b) => Number.parseFloat(b.total) - Number.parseFloat(a.total)
        ),
    };
  });
}

// Explicit labels where mechanical prettifying reads badly. Extend as real
// data reveals more.
const LABEL_OVERRIDES: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Drink",
  RENT_AND_UTILITIES: "Rent & Utilities",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Government & Non-Profit",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Gas & Electricity",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet & Cable",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Beer, Wine & Liquor",
  UNCATEGORIZED: "Uncategorized",
};

function titleCase(fragment: string): string {
  return fragment
    .toLowerCase()
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Human label for a category key: detailed keys drop their primary prefix
 * ("FOOD_AND_DRINK_RESTAURANTS" -> "Restaurants"), bare primaries prettify
 * whole ("FOOD_AND_DRINK" -> "Food & Drink" via override).
 */
export function labelForCategoryKey(key: string): string {
  const override = LABEL_OVERRIDES[key];
  if (override) return override;

  let prefix: string | null = null;
  for (const primary of KNOWN_PRIMARIES) {
    if (
      key !== primary &&
      key.startsWith(`${primary}_`) &&
      (!prefix || primary.length > prefix.length)
    ) {
      prefix = primary;
    }
  }
  return titleCase(prefix ? key.slice(prefix.length + 1) : key);
}
