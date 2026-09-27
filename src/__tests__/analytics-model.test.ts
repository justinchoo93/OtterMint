import { describe, expect, it } from "vitest";
import type { CashflowMonth } from "@/lib/cashflow";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";
import {
  comparableChange,
  firstDataMonthIndex,
  layoutCashflowColumns,
  netWorthDaysForRange,
  netWorthDomain,
  netWorthScale,
  periodDelta,
  rankCategories,
  resolvePeriod,
  sinceLabel,
  sparklineSeries,
  sumPeriod,
} from "@/lib/analytics-model";

function monthKeys(from: string, count: number): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

function month(
  key: string,
  values: Partial<{ income: number; spending: number; savings: number; partial: boolean; cats: Record<string, number> }> = {}
): CashflowMonth {
  const income = values.income ?? 0;
  const spending = values.spending ?? 0;
  return {
    month: key,
    partial: values.partial ?? false,
    income: income.toFixed(2),
    spending: spending.toFixed(2),
    savings: (values.savings ?? 0).toFixed(2),
    netCashFlow: (income - spending).toFixed(2),
    spendingByCategory: Object.entries(values.cats ?? {}).map(([key, total]) => ({
      key,
      primary: key.split("_")[0],
      total: total.toFixed(2),
    })),
    incomeItems: [],
    savingsItems: [],
  };
}

// 24 months, Oct 2024 to Sep 2026; data starts Jan 2026 (index 15); Sep is partial.
const PROD_LIKE: CashflowMonth[] = monthKeys("2024-10", 24).map((key, i) =>
  i < 15
    ? month(key)
    : month(key, { income: 9000 + i, spending: 6000 + i, savings: 1500, partial: key === "2026-09" })
);

describe("firstDataMonthIndex", () => {
  it("finds the first month with any activity", () => {
    expect(firstDataMonthIndex(PROD_LIKE)).toBe(15);
  });
  it("returns null when every month is empty", () => {
    expect(firstDataMonthIndex(monthKeys("2026-01", 3).map((k) => month(k)))).toBeNull();
  });
});

describe("resolvePeriod", () => {
  it("6M: window Apr–Sep, no comparison because history starts in January", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "6M", month: null });
    expect(r.windowMonths.map((m) => m.month)).toEqual(monthKeys("2026-04", 6));
    expect(r.periodMonths).toEqual(r.windowMonths);
    expect(r.priorMonths).toBeNull();
    expect(r.periodLabel).toBe("Apr–Sep 2026");
    expect(r.comparisonLabel).toBeNull();
    expect(r.comparisonShortLabel).toBeNull();
    expect(r.historyStartsLabel).toBe("History starts Jan 2026");
  });

  it("3M: compares with the three months before", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "3M", month: null });
    expect(r.windowMonths.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(r.priorMonths!.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(r.comparisonLabel).toBe("Compared with the previous 3 months");
    expect(r.comparisonShortLabel).toBe("vs prior 3 mo");
    expect(r.historyStartsLabel).toBeNull();
  });

  it("1Y and All are clipped to the first month with data", () => {
    for (const range of ["1Y", "ALL"] as const) {
      const r = resolvePeriod(PROD_LIKE, { range, month: null });
      expect(r.windowMonths[0].month).toBe("2026-01");
      expect(r.windowMonths).toHaveLength(9);
      expect(r.priorMonths).toBeNull();
      expect(r.periodLabel).toBe("Jan–Sep 2026");
      expect(r.historyStartsLabel).toBe("History starts Jan 2026");
    }
  });

  it("a selected month compares with the month before", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "6M", month: "2026-08" });
    expect(r.periodMonths.map((m) => m.month)).toEqual(["2026-08"]);
    expect(r.priorMonths!.map((m) => m.month)).toEqual(["2026-07"]);
    expect(r.periodLabel).toBe("August 2026");
    expect(r.comparisonLabel).toBe("Compared with July 2026");
    expect(r.comparisonShortLabel).toBe("vs Jul");
    expect(r.windowMonths).toHaveLength(6);
  });

  it("never compares the partial current month on its own", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "6M", month: "2026-09" });
    expect(r.periodLabel).toBe("September 2026 · month to date");
    expect(r.priorMonths).toBeNull();
    expect(r.historyStartsLabel).toBeNull();
  });

  it("the first data month has nothing to compare with", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "1Y", month: "2026-01" });
    expect(r.priorMonths).toBeNull();
    expect(r.historyStartsLabel).toBe("History starts Jan 2026");
  });

  it("ignores a selected month outside the window", () => {
    const r = resolvePeriod(PROD_LIKE, { range: "3M", month: "2026-02" });
    expect(r.periodMonths).toHaveLength(3);
  });

  it("labels spans across years and omits history labels when data fills the fetch", () => {
    const full = monthKeys("2024-10", 24).map((k) => month(k, { income: 100, spending: 50 }));
    const r = resolvePeriod(full, { range: "1Y", month: null });
    expect(r.periodLabel).toBe("Oct 2025–Sep 2026");
    expect(r.priorMonths).toHaveLength(12);
    expect(resolvePeriod(full, { range: "ALL", month: null }).historyStartsLabel).toBeNull();
  });

  it("with no data at all, shows the unclipped window and no comparisons", () => {
    const empty = monthKeys("2024-10", 24).map((k) => month(k));
    const r = resolvePeriod(empty, { range: "6M", month: null });
    expect(r.windowMonths).toHaveLength(6);
    expect(r.priorMonths).toBeNull();
    expect(r.historyStartsLabel).toBeNull();
  });
});

describe("sumPeriod and periodDelta", () => {
  it("adds in integer cents", () => {
    const t = sumPeriod([month("2026-01", { income: 0.1, spending: 0.2 }), month("2026-02", { income: 0.2, spending: 0.1 })]);
    expect(t.income).toBe(0.3);
    expect(t.spending).toBe(0.3);
    expect(t.netCashFlow).toBe(0);
  });

  it("returns null against a zero prior", () => {
    expect(periodDelta(100, 0, true)).toBeNull();
  });

  it("treats more spending as bad and more income as good", () => {
    expect(periodDelta(110, 100, false)).toMatchObject({ direction: "up", good: false });
    expect(periodDelta(110, 100, true)).toMatchObject({ direction: "up", good: true });
    expect(periodDelta(90, 100, false)).toMatchObject({ direction: "down", good: true });
    expect(periodDelta(110, 100, true)!.pct).toBeCloseTo(10);
  });

  it("calls a change that rounds to 0.0% flat", () => {
    expect(periodDelta(100.02, 100, true)).toMatchObject({ direction: "flat" });
  });
});

describe("sparklineSeries", () => {
  it("uses complete months from the data start, at most twelve", () => {
    const series = sparklineSeries(PROD_LIKE, "income", firstDataMonthIndex(PROD_LIKE));
    expect(series).toHaveLength(8); // Jan..Aug; September is partial
    expect(series[0]).toBe(9015);
    const full = monthKeys("2024-10", 24).map((k, i) => month(k, { income: i }));
    expect(sparklineSeries(full, "income", 0)).toEqual(Array.from({ length: 12 }, (_, i) => i + 12));
  });
  it("is empty without data", () => {
    expect(sparklineSeries(PROD_LIKE, "income", null)).toEqual([]);
  });
});

describe("rankCategories", () => {
  const cats = (scale: number) => ({
    RENT_AND_UTILITIES_RENT: 1800 * scale,
    FOOD_AND_DRINK_RESTAURANTS: 600 * scale,
    FOOD_AND_DRINK_GROCERIES: 500 * scale,
    TRANSPORTATION_GAS: 200 * scale,
    ENTERTAINMENT_TV_AND_MOVIES: 90,
    GENERAL_SERVICES_INSURANCE: 80,
    PERSONAL_CARE_HAIR_AND_BEAUTY: 70,
    MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 60,
    TRAVEL_FLIGHTS: 50,
    BANK_FEES_ATM_FEES: 40,
    GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: -30,
  });

  it("keeps the top eight positive categories and folds the rest into Other", () => {
    const rows = rankCategories([month("2026-08", { cats: cats(1) })], null);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ key: "RENT_AND_UTILITIES_RENT", label: "Rent", total: 1800, barPct: 100 });
    expect(rows[1].barPct).toBeCloseTo(33.33, 1);
    const other = rows.at(-1)!;
    expect(other.key).toBe("OTHER");
    expect(other.label).toBe("Other");
    expect(other.memberKeys.sort()).toEqual([
      "BANK_FEES_ATM_FEES",
      "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES",
      "TRAVEL_FLIGHTS",
    ]);
    expect(other.total).toBe(60); // 50 + 40 - 30: the net refund folds in too
    expect(rows[0].delta).toBeNull();
  });

  it("sums across months and compares with the prior period, down being good", () => {
    const rows = rankCategories(
      [month("2026-07", { cats: cats(1) }), month("2026-08", { cats: cats(1) })],
      [month("2026-05", { cats: cats(0.5) }), month("2026-06", { cats: cats(0.5) })]
    );
    expect(rows[0].total).toBe(3600);
    expect(rows[0].delta).toMatchObject({ direction: "up", good: false });
    expect(rows[0].delta!.pct).toBeCloseTo(100);
  });

  it("omits Other when nothing is folded", () => {
    const rows = rankCategories([month("2026-08", { cats: { RENT_AND_UTILITIES_RENT: 100 } })], null);
    expect(rows.map((r) => r.key)).toEqual(["RENT_AND_UTILITIES_RENT"]);
  });
});

describe("layoutCashflowColumns", () => {
  it("matches the worked example", () => {
    const layout = layoutCashflowColumns([
      month("2026-08", { income: 1000, spending: 600, savings: 200 }),
      month("2026-09", { income: 500, spending: 300, savings: -100 }),
    ]);
    expect(layout.baselinePct).toBeCloseTo(55.56, 2);
    expect(layout.columns[0]).toMatchObject({ month: "2026-08", savedAbove: false });
    expect(layout.columns[0].incomePct).toBeCloseTo(51.44, 2);
    expect(layout.columns[0].spendingPct).toBeCloseTo(30.86, 2);
    expect(layout.columns[0].savedPct).toBeCloseTo(10.29, 2);
    expect(layout.columns[1].savedPct).toBeCloseTo(5.14, 2);
    expect(layout.columns[1].savedAbove).toBe(true);
    const zero = layout.ticks.find((t) => t.value === 0)!;
    expect(zero.pct).toBeCloseTo(layout.baselinePct);
    for (const tick of layout.ticks) {
      expect(tick.pct).toBeGreaterThanOrEqual(0);
      expect(tick.pct).toBeLessThanOrEqual(100);
    }
    expect(layout.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("puts the baseline in the middle when everything is zero", () => {
    const layout = layoutCashflowColumns([month("2026-08")]);
    expect(layout.baselinePct).toBe(50);
    expect(layout.columns[0]).toMatchObject({ incomePct: 0, spendingPct: 0, savedPct: 0 });
  });
});

describe("netWorthDaysForRange", () => {
  it("starts each range on the first day of its first month", () => {
    expect(netWorthDaysForRange("3M", "2026-09-26")).toBe(87);
    expect(netWorthDaysForRange("6M", "2026-09-26")).toBe(178);
    expect(netWorthDaysForRange("1Y", "2026-09-26")).toBe(360);
    expect(netWorthDaysForRange("ALL", "2026-09-26")).toBe(3650);
  });
});

function point(
  date: string,
  value: number,
  overrides: Partial<NetWorthSnapshotRow> = {}
): NetWorthSnapshotRow {
  return {
    date,
    totalAssets: value.toFixed(2),
    totalLiabilities: "0.00",
    netWorth: value.toFixed(2),
    depositoryTotal: null,
    creditTotal: null,
    investmentTotal: null,
    loanTotal: null,
    manualAssetsTotal: null,
    manualLiabilitiesTotal: null,
    adjustedTotalAssets: value.toFixed(2),
    adjustedTotalLiabilities: "0.00",
    adjustedNetWorth: value.toFixed(2),
    quality: "observed",
    coverageSegment: 1,
    comparisonSegment: 1,
    ...overrides,
  };
}

describe("comparableChange", () => {
  const series = [
    point("2026-03-31", 380000, { quality: "reconstructed", coverageSegment: 0, comparisonSegment: 0, reconstructionNotes: "Estimated." }),
    point("2026-07-01", 390000),
    point("2026-07-15", 392000),
    point("2026-09-26", 396000),
  ];

  it("measures within the latest comparable stretch (worked example)", () => {
    const change = comparableChange(series, "normalized")!;
    expect(change.amount).toBe(6000);
    expect(change.pct).toBeCloseTo(1.54, 2);
    expect(change.fromDate).toBe("2026-07-01");
    expect(change.spansWholeRange).toBe(false);
    expect(change.estimated).toBe(false);
  });

  it("uses raw values and coverage segments in reported mode", () => {
    const reported = [
      point("2026-07-01", 100, { coverageSegment: 0, adjustedNetWorth: "900.00" }),
      point("2026-07-02", 1100, { coverageSegment: 1, adjustedNetWorth: "1100.00" }),
      point("2026-07-03", 1150, { coverageSegment: 1, adjustedNetWorth: "1150.00" }),
    ];
    expect(comparableChange(reported, "reported")).toMatchObject({ amount: 50, fromDate: "2026-07-02" });
    expect(comparableChange(reported, "normalized")).toMatchObject({ amount: 250, fromDate: "2026-07-01", spansWholeRange: true });
  });

  it("flags estimates and needs two points", () => {
    const estimated = series.slice(0, 1).concat(
      point("2026-04-30", 381000, { quality: "reconstructed", coverageSegment: 0, comparisonSegment: 0, reconstructionNotes: "Estimated." })
    );
    expect(comparableChange(estimated, "normalized")).toMatchObject({ amount: 1000, estimated: true });
    expect(comparableChange(series.slice(-1), "normalized")).toBeNull();
    expect(comparableChange([], "reported")).toBeNull();
  });

  it("has no percentage from a zero start", () => {
    expect(comparableChange([point("2026-07-01", 0), point("2026-07-02", 10)], "reported")!.pct).toBeNull();
  });
});

describe("netWorthDomain", () => {
  it("pads around the data without forcing zero", () => {
    const [lo, hi] = netWorthDomain([380000, 396000]);
    expect(lo).toBeGreaterThan(300000);
    expect(lo).toBeLessThanOrEqual(380000 - 960);
    expect(hi).toBeGreaterThanOrEqual(396000 + 960);
    expect(hi).toBeLessThan(420000);
  });
  it("puts gridline ticks on the same round step as the domain", () => {
    const { domain, ticks } = netWorthScale([371000, 397000]);
    expect(domain).toEqual([360000, 400000]);
    expect(ticks).toEqual([360000, 370000, 380000, 390000, 400000]);
  });
  it("handles a flat or empty series", () => {
    const [lo, hi] = netWorthDomain([1000, 1000]);
    expect(lo).toBeLessThan(1000);
    expect(hi).toBeGreaterThan(1000);
    expect(netWorthDomain([])).toEqual([0, 1]);
  });
});

describe("sinceLabel", () => {
  it("omits the year when it matches today", () => {
    expect(sinceLabel("2026-07-01", "2026-09-26")).toBe("since Jul 1");
    expect(sinceLabel("2025-03-31", "2026-09-26")).toBe("since Mar 31, 2025");
  });
});
