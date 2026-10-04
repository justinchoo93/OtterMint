import { describe, expect, it } from "vitest";
import type { CashflowMonth } from "@/lib/cashflow";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";
import {
  asToDate,
  betweenLabel,
  categoryTrends,
  comparableChange,
  firstDataMonthIndex,
  categoryRowFor,
  layoutCashflowColumns,
  likeForLikePrior,
  describePeriod,
  monthGridCells,
  monthRate,
  netWorthWindow,
  normalizePeriod,
  periodFromSpan,
  stepPeriod,
  trimHistory,
  type Period,
  netWorthDomain,
  netWorthScale,
  normalizationContradictions,
  periodDelta,
  rankCategories,
  rateScale,
  resolvePeriod,
  savingsRateSummary,
  sinceLabel,
  sparklineSeries,
  sumPeriod,
  windowRate,
  yearToDate,
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

const TODAY = "2026-09-26";
const preset = (id: "MTD" | "3M" | "6M" | "YTD" | "1Y" | "ALL"): Period => ({ kind: "preset", id });
// 24 months of data, Oct 2024 to Sep 2026.
const FULL: CashflowMonth[] = monthKeys("2024-10", 24).map((k) =>
  month(k, { income: 100, spending: 50, partial: k === "2026-09" })
);

describe("normalizePeriod", () => {
  it("gives each period one representation", () => {
    expect(normalizePeriod({ kind: "month", month: "2026-09" }, TODAY)).toEqual(preset("MTD"));
    expect(normalizePeriod({ kind: "month", month: "2026-08" }, TODAY)).toEqual({ kind: "month", month: "2026-08" });
    expect(normalizePeriod({ kind: "year", year: 2026 }, TODAY)).toEqual(preset("YTD"));
    expect(normalizePeriod({ kind: "year", year: 2025 }, TODAY)).toEqual({ kind: "year", year: 2025 });
    expect(normalizePeriod({ kind: "range", from: "2026-03", to: "2026-03" }, TODAY)).toEqual({
      kind: "month",
      month: "2026-03",
    });
    expect(normalizePeriod({ kind: "range", from: "2026-09", to: "2026-09" }, TODAY)).toEqual(preset("MTD"));
    expect(normalizePeriod({ kind: "range", from: "2026-06", to: "2026-03" }, TODAY)).toEqual({
      kind: "range",
      from: "2026-03",
      to: "2026-06",
    });
    expect(normalizePeriod(preset("6M"), TODAY)).toEqual(preset("6M"));
  });
});

describe("describePeriod", () => {
  it("labels and dates each kind of period without a month list", () => {
    expect(describePeriod(preset("MTD"), TODAY)).toMatchObject({
      buttonLabel: "Sep 1–26, 2026",
      startDate: "2026-09-01",
      endDate: TODAY,
      endsToday: true,
      stepUnit: "month",
    });
    expect(describePeriod(preset("MTD"), "2026-10-01").buttonLabel).toBe("Oct 1, 2026");
    expect(describePeriod(preset("YTD"), TODAY)).toMatchObject({
      buttonLabel: "Jan 1–Sep 26, 2026",
      startDate: "2026-01-01",
      stepUnit: "year",
    });
    expect(describePeriod(preset("6M"), TODAY)).toMatchObject({
      buttonLabel: "Apr–Sep 2026",
      startDate: "2026-04-01",
      stepUnit: null,
      firstMonth: "2026-04",
      lastMonth: "2026-09",
    });
    expect(describePeriod(preset("1Y"), TODAY).buttonLabel).toBe("Oct 2025–Sep 2026");
    expect(describePeriod(preset("ALL"), TODAY)).toMatchObject({ buttonLabel: "All time", endsToday: true });
    expect(describePeriod({ kind: "month", month: "2026-02" }, TODAY)).toMatchObject({
      buttonLabel: "February 2026",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      endsToday: false,
      stepUnit: "month",
    });
    expect(describePeriod({ kind: "year", year: 2025 }, TODAY)).toMatchObject({
      buttonLabel: "2025",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      endsToday: false,
      stepUnit: "year",
    });
    expect(describePeriod({ kind: "range", from: "2025-11", to: "2026-02" }, TODAY)).toMatchObject({
      buttonLabel: "Nov 2025–Feb 2026",
      endDate: "2026-02-28",
      stepUnit: null,
    });
  });
});

describe("resolvePeriod", () => {
  it("6M: window Apr–Sep, no comparison because history starts in January", () => {
    const r = resolvePeriod(PROD_LIKE, preset("6M"), TODAY);
    expect(r.windowMonths.map((m) => m.month)).toEqual(monthKeys("2026-04", 6));
    expect(r.periodMonths).toEqual(r.windowMonths);
    expect(r.highlightPeriod).toBe(false);
    expect(r.priorMonths).toBeNull();
    expect(r.periodLabel).toBe("Apr–Sep 2026");
    expect(r.buttonLabel).toBe("Apr–Sep 2026");
    expect(r.comparisonLabel).toBeNull();
    expect(r.comparisonShortLabel).toBeNull();
    expect(r.historyStartsLabel).toBe("History starts Jan 2026");
  });

  it("3M: compares with the three months before", () => {
    const r = resolvePeriod(PROD_LIKE, preset("3M"), TODAY);
    expect(r.windowMonths.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(r.priorMonths!.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(r.comparisonLabel).toBe("Compared with the previous 3 months");
    expect(r.comparisonShortLabel).toBe("vs prior 3 mo");
    expect(r.historyStartsLabel).toBeNull();
  });

  it("1Y and All are clipped to the first month with data", () => {
    for (const range of ["1Y", "ALL"] as const) {
      const r = resolvePeriod(PROD_LIKE, preset(range), TODAY);
      expect(r.windowMonths[0].month).toBe("2026-01");
      expect(r.windowMonths).toHaveLength(9);
      expect(r.priorMonths).toBeNull();
      expect(r.periodLabel).toBe("Jan–Sep 2026");
      expect(r.buttonLabel).toBe("Jan–Sep 2026");
      expect(r.historyStartsLabel).toBe("History starts Jan 2026");
    }
  });

  it("one month compares with the month before and keeps six months of chart context", () => {
    const r = resolvePeriod(PROD_LIKE, { kind: "month", month: "2026-08" }, TODAY);
    expect(r.periodMonths.map((m) => m.month)).toEqual(["2026-08"]);
    expect(r.priorMonths!.map((m) => m.month)).toEqual(["2026-07"]);
    expect(r.periodLabel).toBe("August 2026");
    expect(r.buttonLabel).toBe("August 2026");
    expect(r.comparisonLabel).toBe("Compared with July 2026");
    expect(r.comparisonShortLabel).toBe("vs Jul");
    expect(r.windowMonths.map((m) => m.month)).toEqual(monthKeys("2026-03", 6));
    expect(r.highlightPeriod).toBe(true);
    expect(r).toMatchObject({ startDate: "2026-08-01", endDate: "2026-08-31", endsToday: false, stepUnit: "month" });
  });

  it("month to date compares with the same days of the month before", () => {
    const r = resolvePeriod(PROD_LIKE, preset("MTD"), TODAY);
    expect(r.periodMonths.map((m) => m.month)).toEqual(["2026-09"]);
    expect(r.periodLabel).toBe("September 2026 · month to date");
    expect(r.buttonLabel).toBe("Sep 1–26, 2026");
    expect(r.priorMonths!.map((m) => m.month)).toEqual(["2026-08"]);
    expect(r.comparisonLabel).toBe("Compared with August 1–26");
    expect(r.comparisonShortLabel).toBe("vs Aug 1–26");
    expect(r.windowMonths.map((m) => m.month)).toEqual(monthKeys("2026-04", 6));
    expect(r.highlightPeriod).toBe(true);
    expect(resolvePeriod(PROD_LIKE, { kind: "month", month: "2026-09" }, TODAY)).toEqual(r);
  });

  it("the first data month has nothing to compare with", () => {
    const r = resolvePeriod(PROD_LIKE, { kind: "month", month: "2026-01" }, TODAY);
    expect(r.priorMonths).toBeNull();
    expect(r.historyStartsLabel).toBe("History starts Jan 2026");
    expect(r.windowMonths.map((m) => m.month)).toEqual(["2026-01"]);
  });

  it("falls back to 6M for a month, year or range outside the data", () => {
    for (const stale of [
      { kind: "month", month: "2020-01" },
      { kind: "year", year: 2024 },
      { kind: "range", from: "2025-02", to: "2025-06" },
    ] as Period[]) {
      const r = resolvePeriod(PROD_LIKE, stale, TODAY);
      expect(r.periodMonths.map((m) => m.month)).toEqual(monthKeys("2026-04", 6));
      expect(r.buttonLabel).toBe("Apr–Sep 2026");
    }
  });

  it("year to date compares with the same months of last year", () => {
    const r = resolvePeriod(FULL, preset("YTD"), TODAY);
    expect(r.periodMonths.map((m) => m.month)).toEqual(monthKeys("2026-01", 9));
    expect(r.priorMonths!.map((m) => m.month)).toEqual(monthKeys("2025-01", 9));
    expect(r.buttonLabel).toBe("Jan 1–Sep 26, 2026");
    expect(r.comparisonLabel).toBe("Compared with Jan–Sep 2025");
    expect(r.comparisonShortLabel).toBe("vs 2025 to date");
    expect(r.stepUnit).toBe("year");
    expect(resolvePeriod(PROD_LIKE, preset("YTD"), TODAY).priorMonths).toBeNull();
  });

  it("a year compares with the year before only when data covers all of it", () => {
    const r = resolvePeriod(FULL, { kind: "year", year: 2025 }, TODAY);
    expect(r.periodMonths.map((m) => m.month)).toEqual(monthKeys("2025-01", 12));
    expect(r.priorMonths).toBeNull();
    expect(r.comparisonLabel).toBeNull();
    expect(r.buttonLabel).toBe("2025");
    expect(r.periodLabel).toBe("Jan–Dec 2025");
    expect(r).toMatchObject({ endDate: "2025-12-31", endsToday: false, stepUnit: "year", highlightPeriod: false });

    const long = monthKeys("2023-10", 36).map((k) => month(k, { income: 100, spending: 50 }));
    const covered = resolvePeriod(long, { kind: "year", year: 2025 }, TODAY);
    expect(covered.priorMonths!.map((m) => m.month)).toEqual(monthKeys("2024-01", 12));
    expect(covered.comparisonLabel).toBe("Compared with 2024");
    expect(covered.comparisonShortLabel).toBe("vs 2024");

    // A year the data only partly covers is clipped and has no comparison.
    const partYear = resolvePeriod(FULL, { kind: "year", year: 2024 }, TODAY);
    expect(partYear.periodMonths.map((m) => m.month)).toEqual(["2024-10", "2024-11", "2024-12"]);
    expect(partYear.priorMonths).toBeNull();
  });

  it("a custom range compares with the equal span before it", () => {
    const r = resolvePeriod(FULL, { kind: "range", from: "2026-03", to: "2026-06" }, TODAY);
    expect(r.periodMonths.map((m) => m.month)).toEqual(monthKeys("2026-03", 4));
    expect(r.priorMonths!.map((m) => m.month)).toEqual(monthKeys("2025-11", 4));
    expect(r.buttonLabel).toBe("Mar–Jun 2026");
    expect(r.comparisonShortLabel).toBe("vs prior 4 mo");
    expect(r.stepUnit).toBeNull();
    expect(r.endDate).toBe("2026-06-30");
    const two = resolvePeriod(FULL, { kind: "range", from: "2026-05", to: "2026-06" }, TODAY);
    expect(two.windowMonths.map((m) => m.month)).toEqual(monthKeys("2026-01", 6));
    expect(two.highlightPeriod).toBe(true);
  });

  it("labels spans across years and omits history labels when data fills the fetch", () => {
    const r = resolvePeriod(FULL, preset("1Y"), TODAY);
    expect(r.periodLabel).toBe("Oct 2025–Sep 2026");
    expect(r.priorMonths).toHaveLength(12);
    expect(resolvePeriod(FULL, preset("ALL"), TODAY).historyStartsLabel).toBeNull();
    expect(resolvePeriod(FULL, preset("ALL"), TODAY).priorMonths).toBeNull();
  });

  it("with no data at all, shows the unclipped window and no comparisons", () => {
    const empty = monthKeys("2024-10", 24).map((k) => month(k));
    const r = resolvePeriod(empty, preset("6M"), TODAY);
    expect(r.windowMonths).toHaveLength(6);
    expect(r.priorMonths).toBeNull();
    expect(r.historyStartsLabel).toBeNull();
  });

  it("with no month list yet, returns empty months and the described labels", () => {
    const r = resolvePeriod([], preset("6M"), TODAY);
    expect(r.periodMonths).toEqual([]);
    expect(r.windowMonths).toEqual([]);
    expect(r.buttonLabel).toBe("Apr–Sep 2026");
    expect(r.startDate).toBe("2026-04-01");
  });
});

describe("stepPeriod", () => {
  const bounds = { firstMonth: "2025-01", lastMonth: "2026-09" };
  it("steps by month for a month and for month to date", () => {
    expect(stepPeriod(preset("MTD"), -1, bounds, TODAY)).toEqual({ kind: "month", month: "2026-08" });
    expect(stepPeriod({ kind: "month", month: "2026-08" }, 1, bounds, TODAY)).toEqual(preset("MTD"));
    expect(stepPeriod({ kind: "month", month: "2026-01" }, -1, bounds, TODAY)).toEqual({
      kind: "month",
      month: "2025-12",
    });
    expect(stepPeriod(preset("MTD"), 1, bounds, TODAY)).toBeNull();
    expect(stepPeriod({ kind: "month", month: "2025-01" }, -1, bounds, TODAY)).toBeNull();
  });
  it("steps by year for a year and for year to date", () => {
    expect(stepPeriod(preset("YTD"), -1, bounds, TODAY)).toEqual({ kind: "year", year: 2025 });
    expect(stepPeriod({ kind: "year", year: 2025 }, 1, bounds, TODAY)).toEqual(preset("YTD"));
    expect(stepPeriod({ kind: "year", year: 2025 }, -1, bounds, TODAY)).toBeNull();
    expect(stepPeriod(preset("YTD"), 1, bounds, TODAY)).toBeNull();
  });
  it("has no step for rolling ranges, All and custom ranges", () => {
    for (const p of [preset("3M"), preset("6M"), preset("1Y"), preset("ALL")]) {
      expect(stepPeriod(p, -1, bounds, TODAY)).toBeNull();
    }
    expect(stepPeriod({ kind: "range", from: "2026-03", to: "2026-06" }, -1, bounds, TODAY)).toBeNull();
  });
});

describe("periodFromSpan", () => {
  it("orders the two months and normalizes the result", () => {
    expect(periodFromSpan("2026-06", "2026-03", TODAY)).toEqual({ kind: "range", from: "2026-03", to: "2026-06" });
    expect(periodFromSpan("2026-03", "2026-03", TODAY)).toEqual({ kind: "month", month: "2026-03" });
    expect(periodFromSpan("2026-09", "2026-09", TODAY)).toEqual(preset("MTD"));
  });
});

describe("monthGridCells", () => {
  const bounds = { firstMonth: "2025-03", lastMonth: "2026-09" };
  it("marks a year fully in range, with only the current month flagged", () => {
    const cells = monthGridCells(2026, { from: "2026-01", to: "2026-09", solidEnds: false }, bounds, TODAY);
    expect(cells).toHaveLength(12);
    expect(cells[0]).toMatchObject({ month: "2026-01", label: "Jan", inRange: true, solid: false, disabled: false });
    expect(cells.filter((c) => c.inRange).map((c) => c.label)).toEqual(
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]
    );
    expect(cells.filter((c) => c.disabled).map((c) => c.label)).toEqual(["Oct", "Nov", "Dec"]);
    expect(cells.filter((c) => c.current).map((c) => c.label)).toEqual(["Sep"]);
  });
  it("disables months before the first data month", () => {
    const cells = monthGridCells(2025, { from: "2026-04", to: "2026-09", solidEnds: false }, bounds, TODAY);
    expect(cells.filter((c) => c.disabled).map((c) => c.label)).toEqual(["Jan", "Feb"]);
    expect(cells.some((c) => c.inRange)).toBe(false);
  });
  it("draws a single month solid", () => {
    const cells = monthGridCells(2026, { from: "2026-08", to: "2026-08", solidEnds: false }, bounds, TODAY);
    expect(cells.filter((c) => c.solid).map((c) => c.label)).toEqual(["Aug"]);
  });
  it("draws the ends of a range solid, in whichever year they fall", () => {
    const selection = { from: "2025-11", to: "2026-02", solidEnds: true };
    const y2025 = monthGridCells(2025, selection, bounds, TODAY);
    const y2026 = monthGridCells(2026, selection, bounds, TODAY);
    expect(y2025.filter((c) => c.inRange).map((c) => c.label)).toEqual(["Nov", "Dec"]);
    expect(y2025.filter((c) => c.solid).map((c) => c.label)).toEqual(["Nov"]);
    expect(y2026.filter((c) => c.inRange).map((c) => c.label)).toEqual(["Jan", "Feb"]);
    expect(y2026.filter((c) => c.solid).map((c) => c.label)).toEqual(["Feb"]);
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

  it("builds a row for one category even when it was folded into Other", () => {
    const row = categoryRowFor([month("2026-08", { cats: cats(1) })], [month("2026-07", { cats: cats(1) })], "TRAVEL_FLIGHTS")!;
    expect(row).toMatchObject({ key: "TRAVEL_FLIGHTS", label: "Flights", total: 50, memberKeys: ["TRAVEL_FLIGHTS"] });
    expect(row.delta).toMatchObject({ direction: "flat" });
    expect(categoryRowFor([month("2026-08", { cats: cats(1) })], null, "NOT_THERE")).toBeNull();
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

describe("netWorthWindow and trimHistory", () => {
  it("fetches from a week before the period's first day", () => {
    const days = (id: "3M" | "6M" | "1Y" | "ALL" | "MTD") =>
      netWorthWindow(describePeriod({ kind: "preset", id }, "2026-09-26"), "2026-09-26");
    expect(days("3M")).toEqual({ days: 87 + 7, startDate: "2026-07-01", endDate: null });
    expect(days("6M").days).toBe(178 + 7);
    expect(days("1Y").days).toBe(360 + 7);
    expect(days("ALL").days).toBe(3650);
    expect(days("MTD").days).toBe(25 + 7);
  });

  it("gives a past period an end date to trim to", () => {
    const march = describePeriod({ kind: "month", month: "2026-03" }, "2026-09-26");
    expect(netWorthWindow(march, "2026-09-26")).toEqual({ days: 209 + 7, startDate: "2026-03-01", endDate: "2026-03-31" });
  });

  it("keeps the previous close as the baseline and drops points after the end", () => {
    const points = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"].map((date) => ({ date }));
    expect(trimHistory(points, "2026-03-01", "2026-03-31").map((p) => p.date)).toEqual(["2026-02-28", "2026-03-31"]);
    expect(trimHistory(points, "2026-03-01", null).map((p) => p.date)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(trimHistory(points, "2026-01-01", "2026-01-31").map((p) => p.date)).toEqual(["2026-01-31"]);
    expect(trimHistory(points, "2025-06-01", "2025-06-30")).toEqual([]);
    expect(trimHistory(points, "2026-05-01", "2026-05-31")).toEqual([]);
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

  it("stops at an account change whose recorded adjustment never showed up in the balance", () => {
    // Production shape (Sep 5, 2026): a manual asset re-created at 152,000 was
    // recorded as a 152,000 addition, but the account it replaced (151,000) was
    // never recorded as removed, so raw net worth barely moved while every
    // earlier adjusted point was lifted by 152,000.
    const lifted = (date: string, raw: number) =>
      point(date, raw, {
        quality: "flat_normalized",
        coverageSegment: 7,
        comparisonSegment: 6,
        adjustedTotalAssets: (raw + 152000).toFixed(2),
        adjustedNetWorth: (raw + 152000).toFixed(2),
      });
    const series = [
      lifted("2026-07-23", 646717),
      lifted("2026-09-02", 650610),
      point("2026-09-05", 659080, { coverageSegment: 8, comparisonSegment: 6 }),
      point("2026-09-27", 697766, { coverageSegment: 8, comparisonSegment: 6 }),
    ];
    const change = comparableChange(series, "normalized")!;
    expect(change.fromDate).toBe("2026-09-05");
    expect(change.amount).toBeCloseTo(38686);
  });

  it("measures across a liability addition that showed up even when assets rose the same day", () => {
    // Production shape (Aug 13, 2026): a credit card with 11,016.62 owed was
    // connected; liabilities rose 11,124 while investments rose 22,513, so net
    // worth went up. The addition did show up; this is not a contradiction.
    const beforeCard = (date: string, assets: number, liabilities: number) =>
      point(date, assets - liabilities, {
        totalAssets: assets.toFixed(2),
        totalLiabilities: liabilities.toFixed(2),
        adjustedTotalAssets: assets.toFixed(2),
        adjustedTotalLiabilities: (liabilities + 11016.62).toFixed(2),
        adjustedNetWorth: (assets - liabilities - 11016.62).toFixed(2),
        quality: "flat_normalized",
        coverageSegment: 6,
        comparisonSegment: 6,
      });
    const afterCard = (date: string, assets: number, liabilities: number) =>
      point(date, assets - liabilities, {
        totalAssets: assets.toFixed(2),
        totalLiabilities: liabilities.toFixed(2),
        adjustedTotalAssets: assets.toFixed(2),
        adjustedTotalLiabilities: liabilities.toFixed(2),
        adjustedNetWorth: (assets - liabilities).toFixed(2),
        coverageSegment: 7,
        comparisonSegment: 6,
      });
    const series = [
      beforeCard("2026-07-23", 647500, 783),
      beforeCard("2026-08-11", 643224.3, 829.46),
      afterCard("2026-08-13", 665736.34, 11953.76),
      afterCard("2026-09-02", 656923.2, 6313.64),
    ];
    expect(normalizationContradictions(series)).toEqual([]);
    expect(comparableChange(series, "normalized")!.fromDate).toBe("2026-07-23");
  });

  it("measures across an account change whose adjustment matches the balance jump", () => {
    const series = [
      point("2026-08-01", 100000, { quality: "flat_normalized", coverageSegment: 0, comparisonSegment: 0, adjustedTotalAssets: "150000.00", adjustedNetWorth: "150000.00" }),
      point("2026-08-10", 101000, { quality: "flat_normalized", coverageSegment: 0, comparisonSegment: 0, adjustedTotalAssets: "151000.00", adjustedNetWorth: "151000.00" }),
      point("2026-08-11", 151500, { coverageSegment: 1, comparisonSegment: 0 }),
      point("2026-09-01", 153000, { coverageSegment: 1, comparisonSegment: 0 }),
    ];
    const change = comparableChange(series, "normalized")!;
    expect(change.fromDate).toBe("2026-08-01");
    expect(change.amount).toBe(3000);
  });

  it("lists the account changes whose normalization the balances contradict", () => {
    const lifted = (date: string, raw: number) =>
      point(date, raw, {
        quality: "flat_normalized",
        coverageSegment: 7,
        comparisonSegment: 6,
        adjustedTotalAssets: (raw + 152000).toFixed(2),
        adjustedNetWorth: (raw + 152000).toFixed(2),
      });
    expect(
      normalizationContradictions([
        lifted("2026-09-02", 650610),
        point("2026-09-05", 659080, { coverageSegment: 8, comparisonSegment: 6 }),
        point("2026-09-06", 659500, { coverageSegment: 8, comparisonSegment: 6 }),
      ])
    ).toEqual(["2026-09-05"]);
    expect(normalizationContradictions([point("2026-07-01", 1000), point("2026-07-02", 1010)])).toEqual([]);
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
  it("does not pad a non-negative series below zero", () => {
    expect(netWorthScale([0, 400000, 700000]).domain[0]).toBe(0);
  });
  it("handles a flat or empty series", () => {
    const [lo, hi] = netWorthDomain([1000, 1000]);
    expect(lo).toBeLessThan(1000);
    expect(hi).toBeGreaterThan(1000);
    expect(netWorthDomain([])).toEqual([0, 1]);
  });
});

describe("betweenLabel", () => {
  it("names both ends and adds the year only when it is not today's", () => {
    expect(betweenLabel("2026-08-31", "2026-09-30", "2026-10-03")).toBe("Aug 31–Sep 30");
    expect(betweenLabel("2026-09-01", "2026-09-30", "2026-10-03")).toBe("Sep 1–30");
    expect(betweenLabel("2025-03-01", "2025-03-31", "2026-10-03")).toBe("Mar 1–31, 2025");
    expect(betweenLabel("2025-12-31", "2026-01-31", "2026-10-03")).toBe("Dec 31, 2025–Jan 31, 2026");
  });
});

describe("sinceLabel", () => {
  it("omits the year when it matches today", () => {
    expect(sinceLabel("2026-07-01", "2026-09-26")).toBe("since Jul 1");
    expect(sinceLabel("2025-03-31", "2026-09-26")).toBe("since Mar 31, 2025");
  });
});

// A month with month-to-date figures at 60% of the whole month.
function monthToDate(key: string, partial = false): CashflowMonth {
  return {
    ...month(key, {
      income: 1000,
      spending: 600,
      savings: 100,
      partial,
      cats: { RENT_AND_UTILITIES_RENT: 400, FOOD_AND_DRINK_RESTAURANTS: 200 },
    }),
    toDate: {
      income: "600.00",
      spending: "360.00",
      savings: "60.00",
      netCashFlow: "240.00",
      spendingByCategory: [
        { key: "RENT_AND_UTILITIES_RENT", primary: "RENT_AND_UTILITIES", total: "240.00" },
        { key: "FOOD_AND_DRINK_RESTAURANTS", primary: "FOOD_AND_DRINK", total: "120.00" },
      ],
    },
  };
}

describe("asToDate and likeForLikePrior", () => {
  it("swaps in the month-to-date figures and leaves a month without them alone", () => {
    const m = asToDate(monthToDate("2026-03"));
    expect(m).toMatchObject({ income: "600.00", spending: "360.00", netCashFlow: "240.00" });
    expect(m.spendingByCategory[0].total).toBe("240.00");
    const plain = month("2026-03", { income: 5 });
    expect(asToDate(plain)).toBe(plain);
  });

  it("adjusts only the prior window's last month, and only when the period ends in a partial month", () => {
    const months = monthKeys("2026-01", 6).map((k, i) => monthToDate(k, i === 5));
    const period = resolvePeriod(months, { kind: "preset", id: "3M" }, "2026-06-15");
    expect(likeForLikePrior(period)!.map((m) => m.income)).toEqual(["1000.00", "1000.00", "600.00"]);
    const may = resolvePeriod(months, { kind: "month", month: "2026-05" }, "2026-06-15");
    expect(likeForLikePrior(may)!.map((m) => m.income)).toEqual(["1000.00"]);
    const toDate = resolvePeriod(months, { kind: "preset", id: "MTD" }, "2026-06-15");
    expect(likeForLikePrior(toDate)!.map((m) => m.income)).toEqual(["600.00"]);
    expect(likeForLikePrior({ ...period, priorMonths: null })).toBeNull();
  });
});

describe("savings rate", () => {
  it("rates a month and a window by the share of income kept", () => {
    expect(monthRate(month("2026-01", { income: 1000, spending: 750 }))).toBeCloseTo(25);
    expect(monthRate(month("2026-01"))).toBeNull();
    expect(
      windowRate([month("2026-01", { income: 1000, spending: 900 }), month("2026-02", { income: 1000, spending: 700 })])
    ).toBeCloseTo(20);
  });

  it("summarizes a window against its prior in points and names the best and lowest complete months", () => {
    const window = [
      month("2026-04", { income: 1000, spending: 800 }),
      month("2026-05", { income: 1000, spending: 1060 }),
      month("2026-06", { income: 1000, spending: 690 }),
      month("2026-07", { income: 1000, spending: 500, partial: true }),
    ];
    const prior = monthKeys("2025-12", 4).map((k) => month(k, { income: 1000, spending: 850 }));
    const s = savingsRateSummary(window, prior);
    expect(s.rate).toBeCloseTo(23.75);
    expect(s.deltaPoints).toBeCloseTo(8.75);
    expect(s.best?.month).toBe("2026-06");
    expect(s.best?.rate).toBeCloseTo(31);
    expect(s.lowest?.month).toBe("2026-05");
    expect(s.lowest?.rate).toBeCloseTo(-6);
  });

  it("has no delta without a prior and no figures without income", () => {
    const s = savingsRateSummary([month("2026-01", { income: 1000, spending: 800 })], null);
    expect(s.deltaPoints).toBeNull();
    const none = savingsRateSummary([month("2026-01", { spending: 5 })], null);
    expect(none.rate).toBeNull();
    expect(none.best).toBeNull();
  });

  it("scales rates in ten-point steps from zero, or from ten below the lowest negative rate", () => {
    expect(rateScale([9, 22, 31])).toEqual({ domain: [0, 40], ticks: [0, 10, 20, 30, 40] });
    expect(rateScale([-6, 31]).domain).toEqual([-10, 40]);
    expect(rateScale([]).domain).toEqual([0, 10]);
  });
});

describe("categoryTrends", () => {
  const cats = (rent: number, food: number) => ({ RENT_AND_UTILITIES_RENT: rent, FOOD_AND_DRINK_RESTAURANTS: food });

  it("adds a per-month series and an average over complete months, and sorts fastest-growing first", () => {
    const window = [
      month("2026-07", { cats: cats(1000, 100) }),
      month("2026-08", { cats: cats(1000, 200) }),
      month("2026-09", { cats: cats(1000, 400), partial: true }),
    ];
    const prior = monthKeys("2026-04", 3).map((k) => month(k, { cats: cats(1000, 200) }));
    const rows = categoryTrends(window, prior);
    expect(rows.map((r) => r.key)).toEqual(["FOOD_AND_DRINK_RESTAURANTS", "RENT_AND_UTILITIES_RENT"]);
    expect(rows[0].series).toEqual([100, 200, 400]);
    expect(rows[0].average).toBe(150);
    expect(rows[0].delta!.pct).toBeCloseTo(((700 - 600) / 600) * 100);
    expect(rows[1].delta).toMatchObject({ direction: "flat" });
  });

  it("keeps Other last whatever its change, and ranks by size without a comparison", () => {
    const many = (scale: number) =>
      Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`CAT_${i}`, (i + 1) * 10 * scale]));
    const window = [month("2026-08", { cats: many(1) })];
    const prior = [month("2026-07", { cats: { ...many(1), CAT_0: 1 } })];
    const rows = categoryTrends(window, prior);
    expect(rows).toHaveLength(9);
    expect(rows.at(-1)!.key).toBe("OTHER");
    expect(rows.at(-1)!.delta!.pct).toBeCloseTo(900);
    const noPrior = categoryTrends(window, null);
    expect(noPrior[0].key).toBe("CAT_8");
    expect(noPrior[0].delta).toBeNull();
  });
});

describe("yearToDate", () => {
  const TODAY = "2026-09-26";
  const build = (dataFrom: string) =>
    monthKeys("2024-10", 24).map((key) => (key >= dataFrom ? monthToDate(key, key === "2026-09") : month(key)));

  it("compares January through the current month with the same months last year, the last one to the same day", () => {
    const y = yearToDate(build("2025-01"), TODAY)!;
    expect(y.thisYear.map((m) => m.month)).toEqual(monthKeys("2026-01", 9));
    expect(y.lastYear!.map((m) => m.month)).toEqual(monthKeys("2025-01", 9));
    expect(y.totals.income).toBe(9000);
    expect(y.lastTotals!.income).toBe(8600); // eight whole months plus September to date
    expect(y.deltas.income!.pct).toBeCloseTo((400 / 8600) * 100);
    expect(y.deltas.spending!.good).toBe(false);
    expect(y.label).toBe("Jan–Sep 2026");
    expect(y.comparisonLabel).toBe("Compared with Jan–Sep 2025");
    expect(y.note).toMatch(/^2025 is counted through the same day/);
    expect(y.strip.slice(0, 9).every((v) => v === 600)).toBe(true);
    expect(y.strip.slice(9)).toEqual([null, null, null]);
  });

  it("names the highest and lowest complete months by spending", () => {
    const months = build("2025-01").map((m) =>
      m.month === "2026-03" ? { ...m, spending: "900.00" } : m.month === "2026-05" ? { ...m, spending: "400.00" } : m
    );
    const y = yearToDate(months, TODAY)!;
    expect(y.highest).toEqual({ month: "2026-03", total: 900 });
    expect(y.lowest).toEqual({ month: "2026-05", total: 400 });
  });

  it("has no comparison when history starts this year, and is null with no data this year", () => {
    const y = yearToDate(build("2026-01"), TODAY)!;
    expect(y.lastYear).toBeNull();
    expect(y.deltas.income).toBeNull();
    expect(y.comparisonLabel).toBeNull();
    expect(y.note).toBe("History starts Jan 2026");
    expect(yearToDate(build("2027-01"), TODAY)).toBeNull();
  });
});
