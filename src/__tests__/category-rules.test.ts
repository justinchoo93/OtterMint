import { describe, expect, it } from "vitest";
import { applyCategoryRules } from "@/lib/category-rules";
import { classifyTransaction } from "@/lib/cashflow";
import { extractInvestmentFlows } from "@/lib/investment-performance";

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

  it("makes the corrected row extract as an investment withdrawal", () => {
    expect(extractInvestmentFlows([crBkrg])).toEqual([]);
    expect(extractInvestmentFlows([applyCategoryRules(crBkrg)])).toEqual([
      { date: "2026-04-21", kind: "withdrawal", cents: 100000 },
    ]);
  });
});
