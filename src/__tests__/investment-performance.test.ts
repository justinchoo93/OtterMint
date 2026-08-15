import { describe, it, expect } from "vitest";
import {
  buildPortfolioSeries,
  computeAttribution,
  computeDividends,
  computeUnrealized,
  computeXirr,
  extractInvestmentFlows,
  type AggregateRow,
  type CoverageEventRow,
  type InvestmentFlow,
  type InvestmentFlowRow,
} from "@/lib/investment-performance";

// ── Production-reality fixture (queried 2026-08-15) ─────────────────────────
// Legacy region (null fingerprint): Jul 5–22, containing an account
// connection's +62,225.27 step on Jul 20 that nothing can attribute.
// Trusted region: Jul 23 onward; fingerprint changes Aug 11→13 with a
// coverage event of $0 (a re-link that added nothing).
const FP_A = "3ae0d7a9bf";
const FP_B = "662be166ac";

function agg(date: string, total: string, fp: string | null): AggregateRow {
  return { date, investmentTotal: total, coverageFingerprint: fp };
}

const AGGREGATE: AggregateRow[] = [
  agg("2026-07-05", "391010.83", null),
  agg("2026-07-19", "372462.75", null),
  agg("2026-07-20", "434688.02", null),
  agg("2026-07-22", "451013.63", null),
  agg("2026-07-23", "452791.71", FP_A),
  agg("2026-08-11", "438415.61", FP_A),
  agg("2026-08-13", "460928.64", FP_B),
  agg("2026-08-14", "459956.89", FP_B),
];

const EVENTS: CoverageEventRow[] = [
  { effectiveDate: "2026-08-13", assetAdjustment: "0.00" },
];

const FLOWS: InvestmentFlow[] = [
  { date: "2026-07-07", kind: "contribution", cents: 200000 },
  { date: "2026-07-16", kind: "contribution", cents: 400000 },
  { date: "2026-07-31", kind: "contribution", cents: 250000 },
];

describe("buildPortfolioSeries", () => {
  it("keeps a legacy run as one segment and splits at the legacy→known transition", () => {
    const series = buildPortfolioSeries(AGGREGATE, [], EVENTS);
    const segByDate = Object.fromEntries(series.points.map((p) => [p.date, p.segment]));
    // Jul 5–22 (including the internal +62k step) is ONE legacy segment:
    expect(segByDate["2026-07-05"]).toBe(0);
    expect(segByDate["2026-07-20"]).toBe(0);
    expect(segByDate["2026-07-22"]).toBe(0);
    // Jul 23 starts the trusted segment; Aug 13 starts another:
    expect(segByDate["2026-07-23"]).toBe(1);
    expect(segByDate["2026-08-13"]).toBe(2);
    expect(series.points.find((p) => p.date === "2026-07-22")?.quality).toBe("legacy");
    expect(series.points.find((p) => p.date === "2026-07-23")?.quality).toBe("known");
  });

  it("attaches event-explained steps to known boundaries and null to legacy ones", () => {
    const series = buildPortfolioSeries(AGGREGATE, [], EVENTS);
    expect(series.boundaries).toEqual([
      { date: "2026-07-23", step: null }, // legacy→known: step unknowable
      { date: "2026-08-13", step: "0.00" }, // re-link, event says $0 added
    ]);
  });

  it("builds one per-account series per account, starting at its first snapshot", () => {
    const series = buildPortfolioSeries(AGGREGATE, [
      { accountId: "b", name: "Roth", date: "2026-08-15", balance: "12261.81" },
      { accountId: "a", name: "Brokerage", date: "2026-08-16", balance: "45500.00" },
      { accountId: "a", name: "Brokerage", date: "2026-08-15", balance: "45093.17" },
    ], []);
    expect(series.accounts).toHaveLength(2);
    const brokerage = series.accounts.find((a) => a.accountId === "a")!;
    expect(brokerage.points.map((p) => p.date)).toEqual(["2026-08-15", "2026-08-16"]);
    expect(brokerage.points[0].value).toBe("45093.17");
  });
});

describe("computeAttribution", () => {
  it("reconciles the production fixture over the trusted window only", () => {
    // Hand-computed: window Jul 23 → Aug 14.
    //   start 452,791.71 · end 459,956.89
    //   contributions in window: Jul 31 2,500 (Jul 7/16 are legacy, excluded)
    //   coverage steps: Aug 13 boundary explained by a $0 event
    //   market = 459,956.89 − 452,791.71 − 2,500 − 0 = +4,665.18
    const attribution = computeAttribution(AGGREGATE, FLOWS, EVENTS)!;
    expect(attribution).toMatchObject({
      windowStart: "2026-07-23",
      windowEnd: "2026-08-14",
      start: "452791.71",
      contributions: "2500.00",
      withdrawals: "0.00",
      coverageSteps: "0.00",
      marketPnl: "4665.18",
      end: "459956.89",
    });
    // The attribution identity holds exactly:
    const sum =
      Number(attribution.start) +
      Number(attribution.contributions) -
      Number(attribution.withdrawals) +
      Number(attribution.marketPnl) +
      Number(attribution.coverageSteps);
    expect(sum.toFixed(2)).toBe(attribution.end);
  });

  it("returns null when no fingerprinted rows exist", () => {
    const legacyOnly = AGGREGATE.filter((r) => r.coverageFingerprint === null);
    expect(computeAttribution(legacyOnly, FLOWS, EVENTS)).toBeNull();
  });

  it("nulls market P&L when a boundary step has no explaining event", () => {
    const attribution = computeAttribution(AGGREGATE, FLOWS, [])!;
    expect(attribution.marketPnl).toBeNull();
    expect(attribution.coverageSteps).toBe("0.00");
  });

  it("counts withdrawals against contributions, not market", () => {
    const rows = [
      agg("2026-01-01", "100000.00", "fp1"),
      agg("2026-03-01", "95000.00", "fp1"),
    ];
    const flows: InvestmentFlow[] = [
      { date: "2026-02-01", kind: "withdrawal", cents: 1000000 },
    ];
    const attribution = computeAttribution(rows, flows, [])!;
    // 95,000 = 100,000 − 10,000 (withdrawal) + market → market = +5,000
    expect(attribution.withdrawals).toBe("10000.00");
    expect(attribution.marketPnl).toBe("5000.00");
  });
});

describe("computeXirr", () => {
  it("returns 10% for a one-year single-flow fixture", () => {
    // −10,000 grows to 11,000 over exactly 365 days → 10.0% annualized.
    const rate = computeXirr([], 10000, "2025-01-01", 11000, "2026-01-01");
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 4);
  });

  it("accounts for the timing of a mid-window contribution", () => {
    const flows: InvestmentFlow[] = [
      { date: "2025-07-02", kind: "contribution", cents: 100000 },
    ];
    // 10,000 start + 1,000 mid-year contribution → 11,550 end.
    // The 550 gain on ~10.5k average capital ≈ 5%; must be far below the
    // 15.5% a flow-blind calculation would report.
    const rate = computeXirr(flows, 10000, "2025-01-01", 11550, "2026-01-01")!;
    expect(rate).toBeGreaterThan(0.04);
    expect(rate).toBeLessThan(0.06);
  });

  it("returns null for windows under 30 days", () => {
    expect(computeXirr([], 10000, "2026-08-01", 10100, "2026-08-20")).toBeNull();
  });

  it("returns null when no rate in bounds fits", () => {
    // 100 → 5,000 in one year is a 4,900% return, outside the 1,000% bound.
    expect(computeXirr([], 100, "2025-01-01", 5000, "2026-01-01")).toBeNull();
  });
});

describe("extractInvestmentFlows", () => {
  function flowRow(overrides: Partial<InvestmentFlowRow>): InvestmentFlowRow {
    return {
      amount: "1000.00",
      category: "TRANSFER_OUT",
      categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
      accountType: "depository",
      accountSubtype: "checking",
      date: "2026-07-31",
      pending: false,
      ...overrides,
    };
  }

  it("extracts contributions and withdrawals with positive magnitudes", () => {
    const flows = extractInvestmentFlows([
      flowRow({}),
      flowRow({
        date: "2026-06-02",
        amount: "-22612.90",
        category: "TRANSFER_IN",
        categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
      }),
    ]);
    expect(flows).toEqual([
      { date: "2026-06-02", kind: "withdrawal", cents: 2261290 },
      { date: "2026-07-31", kind: "contribution", cents: 100000 },
    ]);
  });

  it("excludes pending rows and bank-savings transfers", () => {
    const flows = extractInvestmentFlows([
      flowRow({ pending: true }),
      flowRow({ categoryDetailed: "TRANSFER_OUT_SAVINGS" }),
    ]);
    expect(flows).toEqual([]);
  });
});

describe("computeDividends", () => {
  const TODAY = "2026-08-15";

  it("sums credited dividends by month with sign flipped, zero-filled", () => {
    const dividends = computeDividends(
      [
        { date: "2026-08-01", amount: "-46.80", subtype: "dividend" },
        { date: "2026-08-20", amount: "-12.20", subtype: "qualified dividend" },
        { date: "2026-05-10", amount: "-30.00", subtype: "dividend" },
        // reinvestment purchases and buys must not offset income:
        { date: "2026-08-01", amount: "46.80", subtype: "dividend reinvestment" },
        { date: "2026-08-02", amount: "500.00", subtype: "buy" },
        // outside the trailing window:
        { date: "2025-07-01", amount: "-99.00", subtype: "dividend" },
      ],
      TODAY
    );

    expect(dividends.trailingTwelveMonths).toBe("89.00");
    expect(dividends.monthly).toHaveLength(12);
    expect(dividends.monthly[0].month).toBe("2025-09");
    const august = dividends.monthly.find((m) => m.month === "2026-08")!;
    expect(august.total).toBe("59.00");
    const may = dividends.monthly.find((m) => m.month === "2026-05")!;
    expect(may.total).toBe("30.00");
  });

  it("returns a zero-filled year for no dividend rows", () => {
    const dividends = computeDividends([], TODAY);
    expect(dividends.trailingTwelveMonths).toBe("0.00");
    expect(dividends.monthly.every((m) => m.total === "0.00")).toBe(true);
  });
});

describe("computeUnrealized", () => {
  const HOLDINGS = [
    { accountId: "sd", accountName: "Self-Directed", securityId: "qqq",
      tickerSymbol: "QQQ", name: "Invesco QQQ", value: "77472.90", costBasis: "55985.88" },
    { accountId: "sd", accountName: "Self-Directed", securityId: "mrvl",
      tickerSymbol: "MRVL", name: "Marvell", value: "41948.91", costBasis: "12948.20" },
    { accountId: "ind", accountName: "Individual", securityId: "cash",
      tickerSymbol: null, name: "Money Market", value: "16330.21", costBasis: null },
  ];

  it("excludes basis-less positions from gain math and reports their value", () => {
    const u = computeUnrealized(HOLDINGS);
    // 77,472.90 + 41,948.91 = 119,421.81 value · 68,934.08 cost → +50,487.73 (+73.2%)
    expect(u.total).toEqual({
      value: "119421.81",
      cost: "68934.08",
      gain: "50487.73",
      gainPct: "73.2",
      excludedValue: "16330.21",
    });
    expect(u.positions).toHaveLength(2);
    expect(u.positions[0].ticker).toBe("QQQ"); // sorted by value desc
  });

  it("groups by account, sorted by gain percent descending", () => {
    const u = computeUnrealized(HOLDINGS);
    expect(u.byAccount).toHaveLength(1); // Individual had only the excluded position
    expect(u.byAccount[0]).toMatchObject({ accountId: "sd", gainPct: "73.2" });
  });
});
