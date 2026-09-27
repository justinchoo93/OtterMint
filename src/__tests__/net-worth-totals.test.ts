import { describe, expect, it } from "vitest";
import { computeNetWorthTotals } from "@/lib/net-worth-totals";

describe("computeNetWorthTotals", () => {
  it("counts depository and investment as assets and credit and loans as liabilities", () => {
    const totals = computeNetWorthTotals(
      [
        { type: "depository", currentBalance: "18450.00" },
        { type: "investment", currentBalance: "503800.00" },
        { type: "credit", currentBalance: "2740.00" },
        { type: "loan", currentBalance: "-123000.00" },
        { type: "depository", currentBalance: null },
      ],
      [
        { type: "asset", balance: "25000.00" },
        { type: "liability", balance: "-5000.00" },
      ]
    );
    expect(totals.assets).toBeCloseTo(547250);
    expect(totals.liabilities).toBeCloseTo(130740);
    expect(totals.netWorth).toBeCloseTo(416510);
    expect(totals.accountCount).toBe(7);
  });

  it("returns zeros with no accounts", () => {
    expect(computeNetWorthTotals([], [])).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      accountCount: 0,
    });
  });
});
