import { describe, expect, it } from "vitest";
import { applyCategoryRules } from "@/lib/category-rules";
import { classifyTransaction } from "@/lib/cashflow";

// The production shape that motivated the rule: a Chase manual brokerage
// credit Plaid tags as contractor income. Negative amount = money arrived
// (Plaid sign convention).
const crBkrg = {
  name: "Manual CR-Bkrg",
  amount: "-1000.00",
  date: "2026-04-21",
  pending: false,
  category: "INCOME",
  categoryDetailed: "INCOME_CONTRACTOR",
  accountType: "depository",
  accountSubtype: "checking",
};

describe("applyCategoryRules", () => {
  it("corrects a CR-Bkrg credit to an investment-funds transfer-in", () => {
    const corrected = applyCategoryRules(crBkrg);
    expect(corrected.category).toBe("TRANSFER_IN");
    expect(corrected.categoryDetailed).toBe(
      "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"
    );
  });

  it("matches case-insensitively", () => {
    const corrected = applyCategoryRules({
      ...crBkrg,
      name: "MANUAL CR-BKRG 08/14",
    });
    expect(corrected.categoryDetailed).toBe(
      "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"
    );
  });

  it("passes non-matching rows through unchanged, same object", () => {
    for (const name of [
      "Manual DB-Bkrg 04/06",
      "MANUAL DB-BKRG 08/14",
      "KING COUNTY PAYROLL PPD ID: 2916001327",
    ]) {
      const row = { ...crBkrg, name };
      const result = applyCategoryRules(row);
      expect(result).toBe(row);
      expect(result.category).toBe("INCOME");
      expect(result.categoryDetailed).toBe("INCOME_CONTRACTOR");
    }
  });

  it("does not mutate the input row", () => {
    const row = { ...crBkrg };
    applyCategoryRules(row);
    expect(row.category).toBe("INCOME");
    expect(row.categoryDetailed).toBe("INCOME_CONTRACTOR");
  });

  // The two consumers the rule exists for: the corrected row must classify
  // as savings (its negative amount subtracts — a withdrawal) and must
  // surface as an investment withdrawal.
  it("makes the corrected row classify as savings", () => {
    expect(classifyTransaction(crBkrg)).toBe("income");
    expect(classifyTransaction(applyCategoryRules(crBkrg))).toBe("savings");
  });

  it("routes the corrected row into the investment-withdrawal category", () => {
    expect(crBkrg.categoryDetailed).not.toBe("TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS");
    const corrected = applyCategoryRules(crBkrg);
    expect(corrected.categoryDetailed).toBe("TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS");
    expect(classifyTransaction(corrected)).toBe("savings");
  });
});

// The production shape behind the River rule: weekly bitcoin buys from
// checking that Plaid labels as ordinary spending (Internet & Cable here;
// also seen as Online Marketplaces, Casinos & Gambling, General Services).
const riverBuy = {
  name: "RIVER. RECUR BUY PDSTYN6SEQ WEB ID: 4611920351",
  amount: "50.00",
  date: "2026-08-07",
  pending: false,
  category: "RENT_AND_UTILITIES",
  categoryDetailed: "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
  accountType: "depository",
  accountSubtype: "checking",
};

describe("applyCategoryRules: River recurring buys", () => {
  it("corrects every River ACH debit shape to a savings transfer-out", () => {
    for (const name of [
      "RIVER. RECUR BUY PDSTYN6SEQ WEB ID: 4611920351",
      "RIVER. SUPER BUY 7AYU4ANTYY WEB ID: 4611920351",
      // Backfilled statement descriptors (docs/plans/descriptor-enrichment.md).
      "River Ukfqdgsnnq (River) Ukfqdgsnnq Web ID: 4611920351",
      "River River Ukfqdgsnnq Web ID: 4611920351",
    ]) {
      const corrected = applyCategoryRules({ ...riverBuy, name });
      expect(corrected.category).toBe("TRANSFER_OUT");
      expect(corrected.categoryDetailed).toBe("TRANSFER_OUT_SAVINGS");
    }
  });

  it("leaves River's penny-verification credit and look-alikes alone", () => {
    for (const name of [
      "REAL TIME PAYMENT CREDIT RECD FROM: RIVER FINANCIAL REF: 7bd1b78c",
      "RIVERSIDE CAFE SEATTLE",
      "RIVER CAFE SEATTLE WA",
    ]) {
      const row = { ...riverBuy, name };
      expect(applyCategoryRules(row)).toBe(row);
    }
  });

  // The point of the rule: the buy moves from spending to savings, without
  // leaking into investment-performance flows (River is not a linked account).
  it("makes the corrected row classify as savings", () => {
    expect(classifyTransaction(riverBuy)).toBe("spending");
    expect(classifyTransaction(applyCategoryRules(riverBuy))).toBe("savings");
  });

  it("does not route the corrected row into an investment-fund category", () => {
    const corrected = applyCategoryRules(riverBuy);
    expect(corrected.categoryDetailed).not.toBe("TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS");
    expect(corrected.categoryDetailed).not.toBe("TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS");
  });
});
