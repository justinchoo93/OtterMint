import { describe, expect, it } from "vitest";
import type { CashflowRow } from "@/lib/cashflow";
import { merchantKey } from "@/lib/merchant";
import { addCadence, detectRecurringCharges } from "@/lib/recurring";

const TODAY = "2026-09-29";

function row(date: string, amount: number, overrides: Partial<CashflowRow> = {}): CashflowRow {
  return {
    date,
    amount: amount.toFixed(2),
    name: "FIXTURE",
    merchantName: null,
    category: "GENERAL_SERVICES",
    categoryDetailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES",
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
    accountName: "Sapphire",
    ...overrides,
  };
}

/** The 22nd of each month from Oct 2025 to Sep 2026: 15.49, then 17.99 from July. */
function netflix(): CashflowRow[] {
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  return months.map((m) =>
    row(`${m}-22`, m >= "2026-07" ? 17.99 : 15.49, {
      name: "NETFLIX.COM 866-579-7172",
      merchantName: "Netflix",
      category: "ENTERTAINMENT",
      categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    })
  );
}

function groceries(): CashflowRow[] {
  const visits: Array<[string, number]> = [
    ["2026-07-04", 52.1], ["2026-07-11", 118.4], ["2026-07-18", 44], ["2026-07-25", 139.9],
    ["2026-08-01", 61.3], ["2026-08-08", 90], ["2026-08-15", 47.7], ["2026-08-22", 121],
    ["2026-08-29", 58.2], ["2026-09-05", 99.1], ["2026-09-12", 66.6], ["2026-09-19", 131.3], ["2026-09-26", 49.5],
  ];
  return visits.map(([date, amount]) =>
    row(date, amount, { merchantName: "Trader Joe's", category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })
  );
}

function utility(): CashflowRow[] {
  const amounts = [96.4, 118.2, 138, 131.5, 124.3, 102.1, 88.6, 71, 74.2, 83.9, 92.5, 96.4];
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  return months.map((m, i) =>
    row(`${m}-15`, amounts[i], {
      name: "CITY LIGHT & POWER",
      merchantName: "City Light & Power",
      category: "RENT_AND_UTILITIES",
      categoryDetailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
      accountType: "depository",
      accountSubtype: "checking",
      accountName: "TOTAL CHECKING",
    })
  );
}

function prime(): CashflowRow[] {
  return ["2025-03-14", "2026-03-14"].map((date) =>
    row(date, 139, { merchantName: "Amazon Prime", category: "GENERAL_MERCHANDISE", categoryDetailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" })
  );
}

function gym(): CashflowRow[] {
  return ["2026-06-30", "2026-07-31", "2026-08-31"].map((date) =>
    row(date, 49, { merchantName: "Gym Co", category: "PERSONAL_CARE", categoryDetailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS" })
  );
}

function pilates(): CashflowRow[] {
  return ["2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"].map((date) =>
    row(date, 25, { merchantName: "Pilates Studio", category: "PERSONAL_CARE", categoryDetailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS" })
  );
}

function lapsedGym(): CashflowRow[] {
  return ["2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10"].map((date) => row(date, 39, { merchantName: "Old Gym" }));
}

function cardPayments(): CashflowRow[] {
  return ["2026-07-10", "2026-08-10", "2026-09-10"].map((date) =>
    row(date, 1850, {
      name: "Payment Thank You",
      category: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      accountType: "depository",
      accountSubtype: "checking",
      accountName: "TOTAL CHECKING",
    })
  );
}

describe("merchantKey and addCadence", () => {
  it("normalizes merchant names so a bank descriptor and a clean name match", () => {
    expect(merchantKey({ merchantName: null, name: "NETFLIX.COM 866-579-7172" })).toBe("netflix");
    expect(merchantKey({ merchantName: "Netflix", name: "NETFLIX.COM" })).toBe("netflix");
    expect(merchantKey({ merchantName: "  City Light & Power ", name: "x" })).toBe("city light power");
  });

  it("adds one cadence, clamping the day to the target month", () => {
    expect(addCadence("2026-09-22", "monthly")).toBe("2026-10-22");
    expect(addCadence("2026-08-31", "monthly")).toBe("2026-09-30");
    expect(addCadence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(addCadence("2026-09-26", "weekly")).toBe("2026-10-03");
    expect(addCadence("2026-09-26", "biweekly")).toBe("2026-10-10");
    expect(addCadence("2026-03-14", "yearly")).toBe("2027-03-14");
    expect(addCadence("2026-11-30", "quarterly")).toBe("2027-02-28");
  });
});

describe("detectRecurringCharges", () => {
  const all = [...netflix(), ...groceries(), ...utility(), ...prime(), ...gym(), ...pilates(), ...lapsedGym(), ...cardPayments()];

  it("finds subscriptions and bills, largest monthly cost first, and skips groceries, lapsed and internal rows", () => {
    const { charges } = detectRecurringCharges(all, { today: TODAY, averageMonthlySpending: 5000 });
    expect(charges.map((c) => c.merchant)).toEqual(["Pilates Studio", "City Light & Power", "Gym Co", "Netflix", "Amazon Prime"]);
  });

  it("reports a monthly subscription with its price change", () => {
    const { charges } = detectRecurringCharges(netflix(), { today: TODAY, averageMonthlySpending: null });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      key: "netflix",
      merchant: "Netflix",
      cadence: "monthly",
      amount: "17.99",
      monthlyEquivalent: "17.99",
      firstDate: "2025-10-22",
      lastDate: "2026-09-22",
      nextExpected: "2026-10-22",
      count: 12,
      varies: null,
      priceChange: { from: "15.49", to: "17.99", since: "2026-07-22" },
      isNew: false,
      categoryKey: "ENTERTAINMENT_TV_AND_MOVIES",
      accountName: "Sapphire",
    });
  });

  it("keeps a varying utility bill and marks it, with no price change", () => {
    const { charges } = detectRecurringCharges(utility(), { today: TODAY, averageMonthlySpending: null });
    expect(charges[0]).toMatchObject({
      cadence: "monthly",
      amount: "96.40",
      varies: { min: "71.00", max: "138.00" },
      priceChange: null,
      accountName: "TOTAL CHECKING",
    });
  });

  it("drops a varying merchant that is not a bill", () => {
    expect(detectRecurringCharges(groceries(), { today: TODAY, averageMonthlySpending: null }).charges).toEqual([]);
  });

  it("accepts a yearly charge from two occurrences", () => {
    const { charges } = detectRecurringCharges(prime(), { today: TODAY, averageMonthlySpending: null });
    expect(charges[0]).toMatchObject({ cadence: "yearly", nextExpected: "2027-03-14", monthlyEquivalent: "11.58", isNew: false });
  });

  it("keeps two subscriptions billed under one merchant apart, and lists both when both are active", () => {
    // Apple bills two things: $0.99 monthly all year, and $33.09 monthly that ended in December.
    const months = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    const cheap = months.map((m) => row(`${m}-09`, 0.99, { merchantName: "Apple" }));
    const ended = months.slice(0, 4).map((m) => row(`${m}-14`, 33.09, { merchantName: "Apple" }));
    const { charges } = detectRecurringCharges([...cheap, ...ended], { today: TODAY, averageMonthlySpending: null });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ key: "apple", merchant: "Apple", amount: "0.99", count: 13, firstDate: "2025-09-09" });

    const both = [...cheap, ...months.map((m) => row(`${m}-14`, 33.09, { merchantName: "Apple" }))];
    const active = detectRecurringCharges(both, { today: TODAY, averageMonthlySpending: null }).charges;
    expect(active.map((c) => [c.key, c.amount])).toEqual([["apple 33.09", "33.09"], ["apple 0.99", "0.99"]]);
  });

  it("does not call two similar charges a year apart yearly when the amount drifts or it is food", () => {
    const dinners = [
      row("2025-09-11", 39.03, { merchantName: "Yeh Yeh's", category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_RESTAURANT" }),
      row("2026-09-08", 38.08, { merchantName: "Yeh Yeh's", category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_RESTAURANT" }),
    ];
    expect(detectRecurringCharges(dinners, { today: TODAY, averageMonthlySpending: null }).charges).toEqual([]);
    const drifted = [row("2025-09-11", 39.03, { merchantName: "Some Club" }), row("2026-09-08", 38.08, { merchantName: "Some Club" })];
    expect(detectRecurringCharges(drifted, { today: TODAY, averageMonthlySpending: null }).charges).toEqual([]);
    const exact = [row("2025-09-11", 39.03, { merchantName: "Some Club" }), row("2026-09-08", 39.03, { merchantName: "Some Club" })];
    expect(detectRecurringCharges(exact, { today: TODAY, averageMonthlySpending: null }).charges).toHaveLength(1);
  });

  it("keeps a month-end charge monthly and clamps its next date", () => {
    const { charges } = detectRecurringCharges(gym(), { today: TODAY, averageMonthlySpending: null });
    expect(charges[0]).toMatchObject({ cadence: "monthly", nextExpected: "2026-09-30", count: 3 });
  });

  it("flags a charge first seen within 100 days as new", () => {
    const { charges } = detectRecurringCharges(pilates(), { today: TODAY, averageMonthlySpending: null });
    expect(charges[0]).toMatchObject({ cadence: "weekly", isNew: true, monthlyEquivalent: "108.33" });
  });

  it("drops a charge whose last occurrence is too old for its cadence", () => {
    expect(detectRecurringCharges(lapsedGym(), { today: TODAY, averageMonthlySpending: null }).charges).toEqual([]);
  });

  it("ignores internal rows, pending rows and refunds", () => {
    const pendingNetflix = netflix().map((r) => ({ ...r, pending: true }));
    const refunds = ["2026-07-01", "2026-08-01", "2026-09-01"].map((d) => row(d, -12, { merchantName: "Refunder" }));
    const { charges } = detectRecurringCharges([...cardPayments(), ...pendingNetflix, ...refunds], { today: TODAY, averageMonthlySpending: null });
    expect(charges).toEqual([]);
  });

  it("does not count two same-day charges", () => {
    const twice = [row("2026-09-01", 30, { merchantName: "Double" }), row("2026-09-01", 30, { merchantName: "Double" })];
    expect(detectRecurringCharges(twice, { today: TODAY, averageMonthlySpending: null }).charges).toEqual([]);
  });

  it("totals the monthly equivalents and the share of average spending", () => {
    const summary = detectRecurringCharges(all, { today: TODAY, averageMonthlySpending: 5000 });
    // 108.33 + 96.40 + 49.00 + 17.99 + 11.58
    expect(summary.monthlyTotal).toBe("283.30");
    expect(summary.yearlyTotal).toBe("3399.60");
    expect(summary.shareOfSpending).toBe(6);
    expect(summary.asOf).toBe(TODAY);
    expect(detectRecurringCharges(all, { today: TODAY, averageMonthlySpending: null }).shareOfSpending).toBeNull();
  });
});
