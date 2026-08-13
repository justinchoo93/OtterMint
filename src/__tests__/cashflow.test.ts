import { describe, it, expect } from "vitest";
import {
  aggregateCashflow,
  classifyTransaction,
  labelForCategoryKey,
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
  return { ...txn(overrides), date, pending: false, ...overrides };
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
