import { describe, expect, it } from "vitest";
import {
  allocationRows,
  classifyFeedRow,
  filterGroups,
  formatSecurityLabel,
  groupPositions,
  investmentAxisTicks,
  investmentWindow,
  latestStretch,
  parseOccSymbol,
  scopedSeries,
  summarizeStretch,
  type InvestmentPosition,
  type InvestmentsResponse,
  type SeriesPoint,
} from "@/lib/investments-model";

const TODAY = "2026-09-29";
const DAY = 86_400_000;

function point(date: string, value: number, segment = 0): SeriesPoint {
  return { date, value, segment };
}

function position(overrides: Partial<InvestmentPosition> = {}): InvestmentPosition {
  return {
    accountId: "acc_5111",
    accountName: "Individual",
    securityId: "sec_aapl",
    tickerSymbol: "AAPL",
    name: "Apple Inc.",
    securityType: "equity",
    isCashEquivalent: false,
    quantity: "80.00000000",
    price: "248.1000",
    value: "19848.00",
    costBasis: "15856.00",
    startPrice: "230.0000",
    startDate: "2026-07-01",
    ...overrides,
  };
}

describe("investmentWindow", () => {
  const preset = (id: "MTD" | "3M" | "6M" | "YTD" | "1Y" | "ALL") => ({ kind: "preset", id }) as const;

  it("counts whole days from the first day of the period's first month, as the old ranges did", () => {
    expect(investmentWindow(preset("MTD"), TODAY)).toEqual({ days: 28, end: null }); // from Sep 1, the old 1M
    expect(investmentWindow(preset("3M"), TODAY)).toEqual({ days: 90, end: null }); // from Jul 1
    expect(investmentWindow(preset("6M"), TODAY).days).toBe(181); // from Apr 1
    expect(investmentWindow(preset("1Y"), TODAY).days).toBe(363); // from Oct 1, 2025
  });

  it("counts year to date from January 1 and asks for ten years for All", () => {
    expect(investmentWindow(preset("YTD"), TODAY).days).toBe(271);
    expect(investmentWindow(preset("ALL"), TODAY)).toEqual({ days: 3650, end: null });
  });

  it("gives a period that ended before today its last day", () => {
    expect(investmentWindow({ kind: "month", month: "2026-07" }, TODAY)).toEqual({ days: 90, end: "2026-07-31" });
    expect(investmentWindow({ kind: "year", year: 2025 }, TODAY)).toEqual({ days: 636, end: "2025-12-31" });
    expect(investmentWindow({ kind: "range", from: "2026-05", to: "2026-06" }, TODAY)).toEqual({
      days: 151,
      end: "2026-06-30",
    });
    // A range that reaches the current month runs to today.
    expect(investmentWindow({ kind: "range", from: "2026-08", to: "2026-09" }, TODAY)).toEqual({ days: 59, end: null });
  });
});

describe("classifyFeedRow", () => {
  const row = (type: string, subtype: string | null, amount = "10.00") => ({ type, subtype, amount });

  it("matches the eight production shapes on subtype alone", () => {
    expect(classifyFeedRow(row("buy", "buy"))).toBe("buy");
    expect(classifyFeedRow(row("sell", "sell", "-10.00"))).toBe("sell");
    expect(classifyFeedRow(row("transfer", "transfer", "-5000.00"))).toBe("deposit");
    expect(classifyFeedRow(row("transfer", "split", "0.00"))).toBe("split");
    expect(classifyFeedRow(row("cash", "interest", "-4.10"))).toBe("interest");
    expect(classifyFeedRow(row("cash", "dividend", "-46.80"))).toBe("dividend");
    expect(classifyFeedRow(row("fee", "dividend", "-46.80"))).toBe("dividend");
    expect(classifyFeedRow(row("fee", "interest", "-1.00"))).toBe("interest");
  });

  it("separates deposits from withdrawals by sign and keeps reinvestment out of income", () => {
    expect(classifyFeedRow(row("transfer", "transfer", "2000.00"))).toBe("withdrawal");
    expect(classifyFeedRow(row("transfer", "deposit", "-100.00"))).toBe("deposit");
    expect(classifyFeedRow(row("transfer", "withdrawal", "100.00"))).toBe("withdrawal");
    expect(classifyFeedRow(row("transfer", "transfer", "0.00"))).toBe("other");
    expect(classifyFeedRow(row("buy", "dividend reinvestment"))).toBe("reinvestment");
    expect(classifyFeedRow(row("cash", "Qualified Dividend", "-1.00"))).toBe("dividend");
    expect(classifyFeedRow(row("fee", null))).toBe("other");
    expect(classifyFeedRow(row("cash", "assignment"))).toBe("other");
  });
});

describe("latestStretch", () => {
  it("keeps only the trailing run that shares the last point's segment", () => {
    const points = [
      point("2026-07-05", 100, 0),
      point("2026-07-22", 110, 0),
      point("2026-07-23", 120, 1),
      point("2026-08-14", 130, 1),
      point("2026-09-29", 150, 1),
    ];
    expect(latestStretch(points)).toEqual({
      fromDate: "2026-07-23",
      toDate: "2026-09-29",
      startValue: 120,
      endValue: 150,
      amount: 30,
      pct: 25,
      spansWholeRange: false,
      days: 68,
    });
  });

  it("spans the whole range when there is one segment, and is null with one point", () => {
    const points = [point("2026-08-15", 200, 0), point("2026-09-29", 180, 0)];
    expect(latestStretch(points)).toMatchObject({ amount: -20, pct: -10, spansWholeRange: true, days: 45 });
    expect(latestStretch([point("2026-08-15", 200, 0), point("2026-09-29", 180, 1)])).toBeNull();
    expect(latestStretch([point("2026-09-29", 180, 0)])).toBeNull();
    expect(latestStretch([])).toBeNull();
  });

  it("reports a null percentage from a zero start", () => {
    expect(latestStretch([point("2026-08-15", 0, 0), point("2026-09-29", 500, 0)])).toMatchObject({ amount: 500, pct: null });
  });
});

describe("summarizeStretch", () => {
  const stretch = latestStretch([point("2026-07-01", 100_000, 1), point("2026-09-29", 106_000, 1)])!;

  it("computes the worked example: market gain 3,000 and a 2.9% modified-Dietz return", () => {
    const summary = summarizeStretch(stretch, [
      { date: "2026-08-15", accountId: "a", kind: "deposit", amount: 5000 },
      { date: "2026-09-14", accountId: "a", kind: "withdrawal", amount: 2000 },
    ]);
    expect(summary).toMatchObject({
      contributions: 5000,
      withdrawals: 2000,
      netContributions: 3000,
      marketGain: 3000,
      depositCount: 1,
      withdrawalCount: 1,
    });
    // 3,000 / (100,000 + 5,000 × 45/90 − 2,000 × 15/90) = 3,000 / 102,166.67
    expect(summary.dietzReturnPct).toBeCloseTo(2.9364, 3);
  });

  it("excludes a flow dated on the start day and includes one dated on the end day", () => {
    const summary = summarizeStretch(stretch, [
      { date: "2026-07-01", accountId: "a", kind: "deposit", amount: 10_000 },
      { date: "2026-09-29", accountId: "a", kind: "deposit", amount: 1000 },
    ]);
    expect(summary.contributions).toBe(1000);
    expect(summary.marketGain).toBe(5000);
    // An end-day flow carries no weight, so the denominator is the start value.
    expect(summary.dietzReturnPct).toBeCloseTo(5, 6);
  });

  it("withholds the return when nothing was invested at the start", () => {
    const empty = latestStretch([point("2026-08-15", 0, 0), point("2026-09-29", 1000, 0)])!;
    const summary = summarizeStretch(empty, [{ date: "2026-09-29", accountId: "a", kind: "deposit", amount: 1000 }]);
    expect(summary.marketGain).toBe(0);
    expect(summary.dietzReturnPct).toBeNull();
  });
});

describe("scopedSeries", () => {
  const response = {
    portfolio: {
      points: [
        { date: "2026-07-23", value: "100.00", segment: 1, quality: "known" },
        { date: "2026-09-29", value: "110.00", segment: 2, quality: "known" },
      ],
      boundaries: [],
      liveAppended: true,
    },
    accounts: [
      {
        accountId: "acc_a",
        name: "A",
        mask: "1",
        institutionName: "X",
        subtype: null,
        balance: "50.00",
        points: [{ date: "2026-08-15", value: "40.00" }, { date: "2026-09-29", value: "50.00" }],
        netGain: { mode: "none", startDate: null, netContributions: "0.00", gain: null, gainPct: null },
      },
    ],
  } as unknown as InvestmentsResponse;

  it("parses the aggregate for All and gives an account one segment", () => {
    expect(scopedSeries(response, "all")).toEqual([point("2026-07-23", 100, 1), point("2026-09-29", 110, 2)]);
    expect(scopedSeries(response, "acc_a")).toEqual([point("2026-08-15", 40, 0), point("2026-09-29", 50, 0)]);
    expect(scopedSeries(response, "acc_missing")).toEqual([]);
  });
});

describe("groupPositions", () => {
  const positions = [
    position(),
    position({ accountId: "acc_6850", accountName: "Self-Directed", securityId: "sec_aapl_chase", quantity: "100.00000000", value: "24810.00", costBasis: "19650.00", startPrice: null }),
    position({ accountId: "acc_6850", securityId: "sec_vti", tickerSymbol: "VTI", name: "Vanguard Total Stock Market ETF", securityType: "etf", quantity: "420.00000000", price: "312.4000", value: "131208.00", costBasis: "112788.00", startPrice: "298.7000" }),
    position({ securityId: "sec_aapl_c", tickerSymbol: "AAPL261218C00260000", name: "AAPL Dec 18 2026 260 Call", securityType: "derivative", quantity: "500.00000000", price: "12.4000", value: "6200.00", costBasis: "7050.00", startPrice: "14.1000" }),
    position({ accountId: "acc_6093", securityId: "sec_crwd", tickerSymbol: "CRWD", name: "CrowdStrike Holdings", quantity: "10.00000000", price: "434.2000", value: "4342.00", costBasis: null, startPrice: null }),
    position({ securityId: "sec_cash_a", tickerSymbol: null, name: "Cash", securityType: "cash", isCashEquivalent: true, quantity: "1501.67000000", price: "1.0000", value: "1501.67", costBasis: null, startPrice: null }),
    position({ accountId: "acc_6850", securityId: "sec_cash_b", tickerSymbol: "SWVXX", name: "Schwab Value Advantage Money Fund", securityType: "mutual fund", isCashEquivalent: true, quantity: "121284.42000000", price: "1.0000", value: "121284.42", costBasis: null, startPrice: null }),
  ];

  it("merges the same ticker across accounts, folds cash last and converts option quantity to contracts", () => {
    const groups = groupPositions(positions, "all");
    expect(groups.map((g) => g.key)).toEqual(["t:VTI", "t:AAPL", "t:AAPL261218C00260000", "t:CRWD", "cash"]);
    const aapl = groups[1];
    expect(aapl.quantity).toBe(180);
    expect(aapl.value).toBe(44658);
    expect(aapl.cost).toBe(35506);
    expect(aapl.accountIds).toEqual(["acc_5111", "acc_6850"]);
    expect(aapl.securityIds).toEqual(["sec_aapl", "sec_aapl_chase"]);
    expect(aapl.startPrice).toBe(230);
    expect(aapl.changePct).toBeCloseTo((248.1 / 230 - 1) * 100, 6);
    const option = groups[2];
    expect(option.contracts).toBe(true);
    expect(option.quantity).toBe(5);
    expect(option.changePct).toBeCloseTo((12.4 / 14.1 - 1) * 100, 6);
    const crwd = groups[3];
    expect(crwd.cost).toBeNull();
    expect(crwd.changePct).toBeNull();
    const cash = groups[4];
    expect(cash.isCash).toBe(true);
    expect(cash.value).toBeCloseTo(122786.09, 2);
    expect(cash.accountIds).toEqual(["acc_5111", "acc_6850"]);
    expect(cash.cost).toBeNull();
  });

  it("scopes to one account", () => {
    const groups = groupPositions(positions, "acc_6850");
    expect(groups.map((g) => g.key)).toEqual(["t:VTI", "t:AAPL", "cash"]);
    expect(groups[1].quantity).toBe(100);
    expect(groups[1].accountIds).toEqual(["acc_6850"]);
  });

  it("filters by type pill and by a case-insensitive query", () => {
    const groups = groupPositions(positions, "all");
    expect(filterGroups(groups, "derivative", "").map((g) => g.key)).toEqual(["t:AAPL261218C00260000"]);
    expect(filterGroups(groups, "etf", "").map((g) => g.key)).toEqual(["t:VTI"]);
    expect(filterGroups(groups, "cash", "").map((g) => g.key)).toEqual(["cash"]);
    expect(filterGroups(groups, "all", "aapl").map((g) => g.key)).toEqual(["t:AAPL", "t:AAPL261218C00260000"]);
    expect(filterGroups(groups, "equity", "vanguard")).toEqual([]);
    expect(filterGroups(groups, "all", "  Total Stock ").map((g) => g.key)).toEqual(["t:VTI"]);
  });
});

describe("parseOccSymbol and formatSecurityLabel", () => {
  it("parses an OCC option symbol", () => {
    expect(parseOccSymbol("AAPL261218C00260000")).toEqual({ underlying: "AAPL", expiry: "2026-12-18", kind: "call", strike: 260 });
    expect(parseOccSymbol("CRWD260918P00187500")).toEqual({ underlying: "CRWD", expiry: "2026-09-18", kind: "put", strike: 187.5 });
    expect(parseOccSymbol("AAPL")).toBeNull();
    expect(parseOccSymbol("BRK.B261218C00500000")).toMatchObject({ underlying: "BRK.B", strike: 500 });
  });

  it("labels an option readably and everything else by ticker then name", () => {
    expect(formatSecurityLabel("AAPL261218C00260000", "AAPL Dec 18 2026 260 Call", "derivative")).toEqual({
      label: "AAPL $260 call",
      detail: "Expires Dec 18, 2026",
    });
    expect(formatSecurityLabel("CRWD260918P00187500", "x", "derivative")).toEqual({ label: "CRWD $187.5 put", detail: "Expires Sep 18, 2026" });
    expect(formatSecurityLabel("VTI", "Vanguard Total Stock Market ETF", "etf")).toEqual({ label: "VTI", detail: "Vanguard Total Stock Market ETF" });
    expect(formatSecurityLabel(null, "Some Bond", "fixed income")).toEqual({ label: "Some Bond", detail: "Some Bond" });
    expect(formatSecurityLabel("CALL XYZ", "Unparseable call", "derivative")).toEqual({ label: "CALL XYZ", detail: "Unparseable call" });
  });
});

describe("investmentAxisTicks", () => {
  it("uses weekly ticks for a month and month ticks for a quarter", () => {
    const sep1 = Date.UTC(2026, 8, 1);
    const sep29 = Date.UTC(2026, 8, 29);
    const weekly = investmentAxisTicks(sep1, sep29);
    expect(weekly.ticks).toEqual([0, 7, 14, 21, 28].map((d) => sep1 + d * DAY));
    expect(weekly.ticks.map(weekly.label)).toEqual(["Sep 1", "Sep 8", "Sep 15", "Sep 22", "Sep 29"]);
    expect(weekly.start).toBe(sep1);

    const jul1 = Date.UTC(2026, 6, 1);
    const monthly = investmentAxisTicks(jul1, sep29);
    expect(monthly.ticks).toEqual([Date.UTC(2026, 6, 1), Date.UTC(2026, 7, 1), Date.UTC(2026, 8, 1)]);
    expect(monthly.ticks.map(monthly.label)).toEqual(["Jul", "Aug", "Sep"]);
    expect(monthly.start).toBe(jul1);
  });

  it("thins to every third month with a year on long spans", () => {
    const long = investmentAxisTicks(Date.UTC(2025, 3, 1), Date.UTC(2026, 8, 29));
    expect(long.ticks.length).toBe(6);
    expect(long.label(long.ticks[0])).toBe("Apr ’25");
  });
});

describe("allocationRows", () => {
  it("labels and colors slices by type in the fixed order, folding unknown types into Other", () => {
    const rows = allocationRows([
      { type: "etf", value: "177246.00", share: "45.3", count: 3 },
      { type: "cash", value: "131733.58", share: "33.7", count: 4 },
      { type: "equity", value: "76225.00", share: "19.5", count: 3 },
      { type: "derivative", value: "6200.00", share: "1.6", count: 1 },
      { type: "weird", value: "1.00", share: "0.0", count: 1 },
      { type: "other", value: "2.00", share: "0.0", count: 1 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["ETFs", "Single stocks", "Options", "Other", "Cash"]);
    expect(rows[0].color).toBe("var(--chart-cat-1)");
    expect(rows[4].color).toBe("var(--chart-cat-other)");
    expect(rows[3]).toMatchObject({ value: 3, count: 2 });
    expect(rows[1]).toMatchObject({ value: 76225, share: 19.5, count: 3 });
  });
});
