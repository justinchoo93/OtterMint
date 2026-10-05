import { describe, it, expect } from "vitest";
import {
  aggregateCashflow,
  classifyTransaction,
  labelForCategoryKey,
  selectCashflowItems,
  type CashflowRow,
  type ClassifiableTransaction,
} from "@/lib/cashflow";

function txn(
  overrides: Partial<ClassifiableTransaction> = {}
): ClassifiableTransaction {
  return {
    amount: "100.00",
    category: "FOOD_AND_DRINK",
    categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS",
    accountType: "depository",
    accountSubtype: "checking",
    ...overrides,
  };
}

function row(
  date: string,
  overrides: Partial<CashflowRow> = {}
): CashflowRow {
  return {
    ...txn(overrides),
    id: 1,
    date,
    pending: false,
    name: "Fixture Txn",
    merchantName: null,
    accountName: "TOTAL CHECKING",
    ...overrides,
  };
}

describe("classifyTransaction", () => {
  it("treats a credit-card payment as internal from the checking side", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "1850.00",
          category: "LOAN_PAYMENTS",
          categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
        })
      )
    ).toBe("internal");
  });

  it("treats a credit-card payment as internal from the card side", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-1850.00",
          category: "LOAN_PAYMENTS",
          categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
          accountType: "credit",
          accountSubtype: "credit card",
        })
      )
    ).toBe("internal");
  });

  it("classifies transfers to investment accounts as savings", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "1000.00",
          category: "TRANSFER_OUT",
          categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
        })
      )
    ).toBe("savings");
  });

  it("classifies transfers to savings as savings", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "500.00",
          category: "TRANSFER_OUT",
          categoryDetailed: "TRANSFER_OUT_SAVINGS",
        })
      )
    ).toBe("savings");
  });

  it("classifies withdrawals from investments as savings (negative by sign)", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-400.00",
          category: "TRANSFER_IN",
          categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
        })
      )
    ).toBe("savings");
  });

  it("treats TRANSFER_IN_SAVINGS landing in a savings account as internal", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-500.00",
          category: "TRANSFER_IN",
          categoryDetailed: "TRANSFER_IN_SAVINGS",
          accountSubtype: "savings",
        })
      )
    ).toBe("internal");
  });

  it("treats TRANSFER_IN_SAVINGS landing in checking as a savings withdrawal", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-500.00",
          category: "TRANSFER_IN",
          categoryDetailed: "TRANSFER_IN_SAVINGS",
          accountSubtype: "checking",
        })
      )
    ).toBe("savings");
  });

  it("treats account transfers, deposits, and loan proceeds as internal", () => {
    for (const categoryDetailed of [
      "TRANSFER_OUT_ACCOUNT_TRANSFER",
      "TRANSFER_IN_ACCOUNT_TRANSFER",
      "TRANSFER_IN_DEPOSIT",
      "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
      "TRANSFER_IN_OTHER_TRANSFER_IN",
    ]) {
      const primary = categoryDetailed.startsWith("TRANSFER_IN")
        ? "TRANSFER_IN"
        : "TRANSFER_OUT";
      expect(
        classifyTransaction(txn({ category: primary, categoryDetailed }))
      ).toBe("internal");
    }
  });

  it("classifies income categories as income", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-4200.00",
          category: "INCOME",
          categoryDetailed: "INCOME_WAGES",
        })
      )
    ).toBe("income");
  });

  it("counts ambiguous outflows (Venmo, ATM) as spending", () => {
    for (const categoryDetailed of [
      "TRANSFER_OUT_OTHER_TRANSFER_OUT",
      "TRANSFER_OUT_WITHDRAWAL",
    ]) {
      expect(
        classifyTransaction(
          txn({ category: "TRANSFER_OUT", categoryDetailed })
        )
      ).toBe("spending");
    }
  });

  it("falls back to the primary rule for unknown detailed values", () => {
    expect(
      classifyTransaction(
        txn({
          category: "TRANSFER_OUT",
          categoryDetailed: "TRANSFER_OUT_SOMETHING_NEW",
        })
      )
    ).toBe("spending");
    expect(
      classifyTransaction(
        txn({
          category: "TRANSFER_IN",
          categoryDetailed: "TRANSFER_IN_SOMETHING_NEW",
        })
      )
    ).toBe("internal");
  });

  it("derives the primary from the detailed value when the primary is null", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "-100.00",
          category: null,
          categoryDetailed: "INCOME_DIVIDENDS",
        })
      )
    ).toBe("income");
  });

  it("defaults fully uncategorized rows by direction", () => {
    expect(
      classifyTransaction(
        txn({ amount: "50.00", category: null, categoryDetailed: null })
      )
    ).toBe("spending");
    expect(
      classifyTransaction(
        txn({ amount: "-50.00", category: null, categoryDetailed: null })
      )
    ).toBe("income");
  });

  it("classifies categories the owner created by the flow they declare", () => {
    expect(
      classifyTransaction(txn({ amount: "-300.00", category: "CUSTOM_INCOME", categoryDetailed: "CUSTOM_INCOME_SIDE_GIG" }))
    ).toBe("income");
    expect(
      classifyTransaction(txn({ amount: "200.00", category: "CUSTOM_SAVINGS", categoryDetailed: "CUSTOM_SAVINGS_BITCOIN" }))
    ).toBe("savings");
    expect(
      classifyTransaction(
        txn({ amount: "45.00", category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES" })
      )
    ).toBe("spending");
  });

  it("classifies real debt service (mortgage) as spending", () => {
    expect(
      classifyTransaction(
        txn({
          amount: "2400.00",
          category: "LOAN_PAYMENTS",
          categoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT",
        })
      )
    ).toBe("spending");
  });
});

describe("aggregateCashflow", () => {
  const TODAY = "2026-08-13";

  it("reconciles a realistic month by hand", () => {
    // Hand-computed fixture (see docs/plans/cash-flow-analytics.md):
    //   income      = 4200.00                        (paycheck)
    //   spending    = 350 + 412.33 + 1800 + 120      = 2682.33
    //   savings     = 1000.00                        (brokerage transfer)
    //   netCashFlow = 4200.00 - 2682.33              = 1517.67
    // The card payment (both sides) changes no total.
    const rows: CashflowRow[] = [
      row("2026-08-01", {
        amount: "-4200.00",
        category: "INCOME",
        categoryDetailed: "INCOME_WAGES",
      }),
      row("2026-08-03", {
        amount: "350.00",
        categoryDetailed: "FOOD_AND_DRINK_GROCERIES",
      }),
      row("2026-08-05", {
        amount: "412.33",
        categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS",
      }),
      row("2026-08-01", {
        amount: "1800.00",
        category: "RENT_AND_UTILITIES",
        categoryDetailed: "RENT_AND_UTILITIES_RENT",
      }),
      row("2026-08-10", {
        amount: "1850.00",
        category: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      }),
      row("2026-08-10", {
        amount: "-1850.00",
        category: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
        accountType: "credit",
        accountSubtype: "credit card",
      }),
      row("2026-08-11", {
        amount: "1000.00",
        category: "TRANSFER_OUT",
        categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
      row("2026-08-12", {
        amount: "120.00",
        category: "TRANSFER_OUT",
        categoryDetailed: "TRANSFER_OUT_OTHER_TRANSFER_OUT",
      }),
    ];

    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });

    expect(august.month).toBe("2026-08");
    expect(august.partial).toBe(true);
    expect(august.income).toBe("4200.00");
    expect(august.spending).toBe("2682.33");
    expect(august.savings).toBe("1000.00");
    expect(august.netCashFlow).toBe("1517.67");

    // Category totals reconcile exactly with the spending total.
    const categorySum = august.spendingByCategory.reduce(
      (sum, c) => sum + Number.parseFloat(c.total),
      0
    );
    expect(categorySum.toFixed(2)).toBe("2682.33");

    // No internal or savings key ever appears in the spending breakdown.
    const keys = august.spendingByCategory.map((c) => c.key);
    expect(keys).not.toContain("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
    expect(keys).not.toContain("TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS");
    // Sorted descending by total: rent first.
    expect(august.spendingByCategory[0].key).toBe("RENT_AND_UTILITIES_RENT");
  });

  it("subtracts investment withdrawals from savings", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", {
        amount: "1000.00",
        category: "TRANSFER_OUT",
        categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
      row("2026-08-20", {
        amount: "-400.00",
        category: "TRANSFER_IN",
        categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.savings).toBe("600.00");
  });

  it("lets refunds reduce their category's spending total", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", { amount: "100.00" }),
      row("2026-08-05", { amount: "-30.00" }), // refund, same category
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.spending).toBe("70.00");
    expect(august.spendingByCategory).toEqual([
      {
        key: "FOOD_AND_DRINK_RESTAURANTS",
        primary: "FOOD_AND_DRINK",
        total: "70.00",
      },
    ]);
  });

  it("excludes pending transactions", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", { amount: "100.00", pending: true }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.spending).toBe("0.00");
  });

  it("counts each month to the same day of the month as today", () => {
    const rows: CashflowRow[] = [
      row("2026-07-12", { amount: "40.00" }),
      row("2026-07-13", { amount: "50.00" }),
      row("2026-07-14", { amount: "60.00" }),
      row("2026-07-02", { amount: "-500.00", category: "INCOME", categoryDetailed: "INCOME_WAGES" }),
    ];
    const [july] = aggregateCashflow(rows, { months: 2, today: "2026-08-13" });
    expect(july.spending).toBe("150.00");
    expect(july.toDate).toMatchObject({ income: "500.00", spending: "90.00", netCashFlow: "410.00" });
    expect(july.toDate!.spendingByCategory).toEqual([
      { key: "FOOD_AND_DRINK_RESTAURANTS", primary: "FOOD_AND_DRINK", total: "90.00" },
    ]);
  });

  it("zero-fills months without transactions and spans year boundaries", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", { amount: "100.00" }),
    ];
    const months = aggregateCashflow(rows, { months: 12, today: TODAY });
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-09");
    expect(months[0].spending).toBe("0.00");
    expect(months[0].spendingByCategory).toEqual([]);
    expect(months[11].month).toBe("2026-08");
    expect(months[11].spending).toBe("100.00");
  });

  it("flags only the current month as partial", () => {
    const months = aggregateCashflow([], { months: 3, today: TODAY });
    expect(months.map((m) => m.partial)).toEqual([false, false, true]);
  });

  it("ignores rows outside the window", () => {
    const rows: CashflowRow[] = [
      row("2026-05-31", { amount: "999.00" }),
      row("2026-08-02", { amount: "100.00" }),
    ];
    const months = aggregateCashflow(rows, { months: 2, today: TODAY });
    expect(months.map((m) => m.spending)).toEqual(["0.00", "100.00"]);
  });

  it("emits income line items display-signed positive, date-sorted", () => {
    const rows: CashflowRow[] = [
      row("2026-08-09", {
        amount: "-2600.00",
        name: "KING COUNTY PAYROLL",
        category: "INCOME",
        categoryDetailed: "INCOME_SALARY",
      }),
      row("2026-08-01", {
        amount: "-0.04",
        name: "INTEREST PAYMENT",
        category: "INCOME",
        categoryDetailed: "INCOME_INTEREST_EARNED",
        accountName: "PREMIER PLUS CKG",
      }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.incomeItems).toEqual([
      {
        id: 1,
        date: "2026-08-01",
        amount: "0.04",
        name: "INTEREST PAYMENT",
        merchantName: null,
        categoryKey: "INCOME_INTEREST_EARNED",
        accountName: "PREMIER PLUS CKG",
      },
      {
        id: 1,
        date: "2026-08-09",
        amount: "2600.00",
        name: "KING COUNTY PAYROLL",
        merchantName: null,
        categoryKey: "INCOME_SALARY",
        accountName: "TOTAL CHECKING",
      },
    ]);
    expect(august.savingsItems).toEqual([]);
  });

  it("emits savings line items signed: contributions positive, withdrawals negative", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", {
        amount: "1000.00",
        name: "Manual DB-Bkrg 08/02",
        category: "TRANSFER_OUT",
        categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
      row("2026-08-10", {
        amount: "-400.00",
        name: "Acorns Invest Transfer",
        merchantName: "Acorns",
        category: "TRANSFER_IN",
        categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.savings).toBe("600.00");
    expect(august.savingsItems.map((i) => i.amount)).toEqual([
      "1000.00",
      "-400.00",
    ]);
    expect(august.savingsItems[1].merchantName).toBe("Acorns");
    expect(august.incomeItems).toEqual([]);
  });

  it("emits no line items for pending, internal, or spending rows", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", {
        amount: "-900.00",
        category: "INCOME",
        categoryDetailed: "INCOME_SALARY",
        pending: true,
      }),
      row("2026-08-03", {
        amount: "1850.00",
        category: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      }),
      row("2026-08-04", { amount: "55.00" }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.incomeItems).toEqual([]);
    expect(august.savingsItems).toEqual([]);
  });

  it("labels uncategorized inflows as income and outflows as spending", () => {
    const rows: CashflowRow[] = [
      row("2026-08-02", {
        amount: "-250.00",
        category: null,
        categoryDetailed: null,
      }),
      row("2026-08-03", {
        amount: "80.00",
        category: null,
        categoryDetailed: null,
      }),
    ];
    const [august] = aggregateCashflow(rows, { months: 1, today: TODAY });
    expect(august.income).toBe("250.00");
    expect(august.spending).toBe("80.00");
    expect(august.spendingByCategory).toEqual([
      { key: "UNCATEGORIZED", primary: "UNCATEGORIZED", total: "80.00" },
    ]);
  });
});

describe("labelForCategoryKey", () => {
  it("labels a created category by its name", () => {
    expect(labelForCategoryKey("CUSTOM_SPENDING_KIDS_ACTIVITIES")).toBe("Kids Activities");
    expect(labelForCategoryKey("CUSTOM_INCOME_SIDE_GIG")).toBe("Side Gig");
  });

  it("strips the primary prefix from detailed keys", () => {
    expect(labelForCategoryKey("FOOD_AND_DRINK_RESTAURANTS")).toBe(
      "Restaurants"
    );
    expect(labelForCategoryKey("RENT_AND_UTILITIES_RENT")).toBe("Rent");
    expect(labelForCategoryKey("FOOD_AND_DRINK_GROCERIES")).toBe("Groceries");
  });

  it("uses overrides where mechanical prettifying reads badly", () => {
    expect(labelForCategoryKey("FOOD_AND_DRINK")).toBe("Food & Drink");
    expect(labelForCategoryKey("RENT_AND_UTILITIES_GAS_AND_ELECTRICITY")).toBe(
      "Gas & Electricity"
    );
    expect(labelForCategoryKey("UNCATEGORIZED")).toBe("Uncategorized");
  });

  it("prettifies unknown keys mechanically", () => {
    expect(labelForCategoryKey("SOME_FUTURE_CATEGORY")).toBe(
      "Some Future Category"
    );
  });
});

describe("selectCashflowItems", () => {
  const restaurant = (date: string, amount: string, name: string) =>
    row(date, { amount, name, category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS" });
  const rows: CashflowRow[] = [
    restaurant("2026-07-03", "40.00", "Tacos"),
    restaurant("2026-08-02", "120.50", "Sushi"),
    restaurant("2026-08-20", "18.25", "Coffee"),
    restaurant("2026-09-01", "60.00", "Ramen"),
    { ...restaurant("2026-08-25", "33.00", "Pending Pizza"), pending: true },
    row("2026-08-05", { amount: "350.00", category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES", name: "Grocer" }),
    row("2026-08-10", { amount: "1850.00", category: "LOAN_PAYMENTS", categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", name: "Card payment" }),
    row("2026-08-15", { amount: "-4200.00", category: "INCOME", categoryDetailed: "INCOME_WAGES", name: "Payroll" }),
    row("2026-08-16", { amount: "1000.00", category: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", name: "Brokerage" }),
  ];

  it("filters by month range, flow and category, newest first", () => {
    const result = selectCashflowItems(rows, {
      from: "2026-08",
      to: "2026-09",
      flow: "spending",
      categoryKeys: ["FOOD_AND_DRINK_RESTAURANTS"],
      sort: "date",
      limit: 200,
    });
    expect(result.items.map((i) => i.name)).toEqual(["Ramen", "Coffee", "Sushi"]);
    expect(result.count).toBe(3);
    expect(result.total).toBe("198.75");
    expect(result.items[0]).toMatchObject({ amount: "60.00", categoryKey: "FOOD_AND_DRINK_RESTAURANTS" });
  });

  it("sorts by amount and counts and totals beyond the limit", () => {
    const result = selectCashflowItems(rows, { from: "2026-07", to: "2026-09", flow: "spending", sort: "amount", limit: 2 });
    expect(result.items.map((i) => i.name)).toEqual(["Grocer", "Sushi"]);
    expect(result.count).toBe(5);
    expect(result.total).toBe("588.75");
  });

  it("returns income display-signed positive and never returns internal rows", () => {
    const income = selectCashflowItems(rows, { from: "2026-08", to: "2026-08", flow: "income", sort: "date", limit: 10 });
    expect(income.items).toHaveLength(1);
    expect(income.items[0]).toMatchObject({ name: "Payroll", amount: "4200.00" });
    const all = ["income", "spending", "savings"] as const;
    const names = all.flatMap((flow) =>
      selectCashflowItems(rows, { from: "2026-01", to: "2026-12", flow, sort: "date", limit: 500 }).items.map((i) => i.name)
    );
    expect(names).not.toContain("Card payment");
    expect(names).not.toContain("Pending Pizza");
    expect(names).toContain("Brokerage");
  });

  it("excludes category keys for the Other fold", () => {
    const result = selectCashflowItems(rows, {
      from: "2026-07", to: "2026-09", flow: "spending", excludeCategoryKeys: ["FOOD_AND_DRINK_RESTAURANTS"], sort: "date", limit: 10,
    });
    expect(result.items.map((i) => i.name)).toEqual(["Grocer"]);
  });

  it("treats month bounds as inclusive", () => {
    const july = selectCashflowItems(rows, { from: "2026-07", to: "2026-07", flow: "spending", sort: "date", limit: 10 });
    expect(july.items.map((i) => i.name)).toEqual(["Tacos"]);
  });
});
