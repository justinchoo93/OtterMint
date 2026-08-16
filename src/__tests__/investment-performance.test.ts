import { describe, it, expect } from "vitest";
import {
  buildPortfolioSeries,
  computeAccountNetGains,
  computeAllocation,
  computeAttribution,
  computeDividends,
  computeUnrealized,
  computeXirr,
  extractInvestmentFlows,
  type AccountFeedRow,
  type AccountInfoRow,
  type AggregateRow,
  type CoverageEventRow,
  type HoldingRowInput,
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

describe("computeAllocation", () => {
  it("groups all holdings by type with shares of total value", () => {
    const allocation = computeAllocation(HOLDINGS_FIXTURE());
    // Total = 77,472.90 + 41,948.91 + 13,579.98 + 2,750.23 + 1,000.00 = 136,752.02
    expect(allocation.map((a) => a.type)).toEqual([
      "etf",
      "equity",
      "cash",
      "cash equivalent",
    ]);
    const etf = allocation[0];
    expect(etf.value).toBe("77472.90");
    expect(etf.share).toBe("56.7"); // 77,472.90 / 136,752.02
    expect(etf.count).toBe(1);
    const equity = allocation[1];
    expect(equity.value).toBe("42948.91"); // MRVL + basis-less equity
    expect(equity.count).toBe(2);
    // Shares sum to ~100:
    const total = allocation.reduce((s, a) => s + Number.parseFloat(a.share), 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.3);
  });

  it("buckets null types as other and handles empty input", () => {
    expect(computeAllocation([])).toEqual([]);
    const allocation = computeAllocation([
      { accountId: "a", accountName: "A", securityId: "s", tickerSymbol: null,
        name: "Mystery", value: "100.00", costBasis: null,
        securityType: null, isCashEquivalent: null },
    ]);
    expect(allocation).toEqual([
      { type: "other", value: "100.00", share: "100.0", count: 1 },
    ]);
  });
});

function HOLDINGS_FIXTURE() {
  return [
    { accountId: "sd", accountName: "Self-Directed", securityId: "qqq",
      tickerSymbol: "QQQ", name: "Invesco QQQ", value: "77472.90", costBasis: "55985.88",
      securityType: "etf", isCashEquivalent: false },
    { accountId: "sd", accountName: "Self-Directed", securityId: "mrvl",
      tickerSymbol: "MRVL", name: "Marvell", value: "41948.91", costBasis: "12948.20",
      securityType: "equity", isCashEquivalent: false },
    { accountId: "ind", accountName: "Individual", securityId: "cash",
      tickerSymbol: "CUR:USD", name: "U S Dollar", value: "13579.98", costBasis: null,
      securityType: "cash", isCashEquivalent: true },
    { accountId: "sd", accountName: "Self-Directed", securityId: "sweep",
      tickerSymbol: "QACDS", name: "Chase Deposit Sweep", value: "2750.23", costBasis: null,
      securityType: "cash equivalent", isCashEquivalent: true },
    { accountId: "ind", accountName: "Individual", securityId: "mystery",
      tickerSymbol: "MYST", name: "No Basis Equity", value: "1000.00", costBasis: null,
      securityType: "equity", isCashEquivalent: false },
  ];
}

describe("computeUnrealized", () => {
  const HOLDINGS = HOLDINGS_FIXTURE();

  it("splits cash from invested and excludes basis-less positions", () => {
    const u = computeUnrealized(HOLDINGS);
    // Invested with basis: 77,472.90 + 41,948.91 = 119,421.81 · cost 68,934.08
    //   → +50,487.73 (+73.2%)
    // Cash (CUR:USD 13,579.98 + sweep 2,750.23) = 16,330.21 → cashValue,
    //   never excludedValue. Only the basis-less EQUITY is excluded data.
    expect(u.total).toEqual({
      value: "119421.81",
      cost: "68934.08",
      gain: "50487.73",
      gainPct: "73.2",
      cashValue: "16330.21",
      excludedValue: "1000.00",
    });
    expect(u.positions).toHaveLength(2);
    expect(u.positions[0].ticker).toBe("QQQ"); // sorted by value desc
  });

  it("treats cash equivalents as cash even when they carry a basis", () => {
    const u = computeUnrealized([
      { accountId: "sd", accountName: "Self-Directed", securityId: "mmf",
        tickerSymbol: "VMFXX", name: "Money Market Fund", value: "5000.00",
        costBasis: "5000.00", securityType: "mutual fund", isCashEquivalent: true },
    ]);
    expect(u.total.cashValue).toBe("5000.00");
    expect(u.total.value).toBe("0.00");
    expect(u.positions).toHaveLength(0);
  });

  it("groups by account, sorted by gain percent descending", () => {
    const u = computeUnrealized(HOLDINGS);
    expect(u.byAccount).toHaveLength(1); // Individual had only the excluded position
    expect(u.byAccount[0]).toMatchObject({ accountId: "sd", gainPct: "73.2" });
  });
});

// ── computeAccountNetGains ───────────────────────────────────────────────────
// Production-reality fixture (queried 2026-08-15/16): the Individual account's
// entire life sits inside the feed and reconciles to the cent against its
// holdings cash row, so lifetime mode engages; accounts older than the
// backfill window fall back to the snapshot anchor.

function feedRow(
  accountId: string,
  date: string,
  amount: string,
  type: string,
  subtype: string | null
): AccountFeedRow {
  return { accountId, date, amount, type, subtype };
}

function cashHolding(
  accountId: string,
  value: string,
  securityType: string | null,
  isCashEquivalent: boolean | null
): HoldingRowInput {
  return {
    accountId,
    accountName: accountId,
    securityId: `${accountId}-${securityType}-${value}`,
    tickerSymbol: null,
    name: "fixture",
    value,
    costBasis: null,
    securityType,
    isCashEquivalent,
  };
}

const IND = "ind-5111";
const INDIVIDUAL_INFO: AccountInfoRow = {
  accountId: IND,
  name: "Individual",
  mask: "5111",
  currentBalance: "47514.67",
  itemCreatedAt: "2026-07-20",
};
// Deposits −35,000 across the real dates; trading + interest nets the cash
// to exactly the 11,318.17 held in the sweep position.
const INDIVIDUAL_FEED: AccountFeedRow[] = [
  feedRow(IND, "2026-04-22", "-3000.00", "transfer", "transfer"),
  feedRow(IND, "2026-04-30", "-2000.00", "transfer", "transfer"),
  feedRow(IND, "2026-05-06", "-2000.00", "transfer", "transfer"),
  feedRow(IND, "2026-05-11", "-2500.00", "transfer", "transfer"),
  feedRow(IND, "2026-05-18", "-2000.00", "transfer", "transfer"),
  feedRow(IND, "2026-06-02", "-2000.00", "transfer", "transfer"),
  feedRow(IND, "2026-06-02", "-1500.00", "transfer", "transfer"),
  feedRow(IND, "2026-06-03", "-20000.00", "transfer", "transfer"),
  feedRow(IND, "2026-04-28", "327761.18", "buy", "buy"),
  feedRow(IND, "2026-05-01", "-304078.96", "sell", "sell"),
  feedRow(IND, "2026-06-29", "-0.39", "cash", "interest"),
];
const INDIVIDUAL_HOLDINGS: HoldingRowInput[] = [
  cashHolding(IND, "11318.17", "cash", true),
  cashHolding(IND, "36196.50", "equity", false),
];
const NET_GAIN_TODAY = "2026-08-16";

describe("computeAccountNetGains", () => {
  it("engages lifetime mode when cash reconciles and the first row is a deposit", () => {
    const [r] = computeAccountNetGains(
      INDIVIDUAL_FEED,
      [INDIVIDUAL_INFO],
      INDIVIDUAL_HOLDINGS,
      [],
      NET_GAIN_TODAY
    );
    expect(r).toMatchObject({
      mode: "lifetime",
      startDate: "2026-04-22",
      contributions: "35000.00",
      withdrawals: "0.00",
      netContributions: "35000.00",
      balance: "47514.67",
      gain: "12514.67",
      gainPct: "35.8",
    });
  });

  it("builds a cumulative step series merging same-date flows and extending to today", () => {
    const [r] = computeAccountNetGains(
      INDIVIDUAL_FEED,
      [INDIVIDUAL_INFO],
      INDIVIDUAL_HOLDINGS,
      [],
      NET_GAIN_TODAY
    );
    expect(r.contributionSeries).toEqual([
      { date: "2026-04-22", cumulative: "3000.00" },
      { date: "2026-04-30", cumulative: "5000.00" },
      { date: "2026-05-06", cumulative: "7000.00" },
      { date: "2026-05-11", cumulative: "9500.00" },
      { date: "2026-05-18", cumulative: "11500.00" },
      { date: "2026-06-02", cumulative: "15000.00" }, // two same-day flows merged
      { date: "2026-06-03", cumulative: "35000.00" },
      { date: "2026-08-16", cumulative: "35000.00" }, // extended to today
    ]);
  });

  it("extends the balance series to today and replaces a same-date snapshot", () => {
    const snapshots = [
      { accountId: IND, name: "Individual", date: "2026-08-15", balance: "47000.00" },
      { accountId: IND, name: "Individual", date: "2026-08-16", balance: "47100.00" },
    ];
    const [r] = computeAccountNetGains(
      INDIVIDUAL_FEED,
      [INDIVIDUAL_INFO],
      INDIVIDUAL_HOLDINGS,
      snapshots,
      NET_GAIN_TODAY
    );
    // Today's stale snapshot is replaced by the live balance:
    expect(r.balanceSeries).toEqual([
      { date: "2026-08-15", value: "47000.00" },
      { date: "2026-08-16", value: "47514.67" },
    ]);
  });

  it("falls back to anchored mode when the cash residual is non-zero", () => {
    const holdings = [cashHolding(IND, "99.00", "cash", true)]; // wrong cash
    const snapshots = [
      { accountId: IND, name: "Individual", date: "2026-08-15", balance: "47000.00" },
    ];
    const [r] = computeAccountNetGains(
      INDIVIDUAL_FEED,
      [INDIVIDUAL_INFO],
      holdings,
      snapshots,
      NET_GAIN_TODAY
    );
    // No flows after the anchor: gain is pure balance movement since Aug 15.
    expect(r).toMatchObject({
      mode: "anchored",
      startDate: "2026-08-15",
      contributions: "0.00",
      netContributions: "0.00",
      gain: "514.67",
      gainPct: "1.1",
    });
    expect(r.contributionSeries[0]).toEqual({ date: "2026-08-15", cumulative: "0.00" });
  });

  it("counts anchored-window flows strictly after the anchor date", () => {
    const feed = [
      feedRow(IND, "2026-08-15", "-5000.00", "transfer", "transfer"),
      feedRow(IND, "2026-08-16", "-1000.00", "transfer", "transfer"),
    ];
    const snapshots = [
      { accountId: IND, name: "Individual", date: "2026-08-15", balance: "46000.00" },
    ];
    const [r] = computeAccountNetGains(
      feed,
      [INDIVIDUAL_INFO],
      [cashHolding(IND, "99.00", "cash", true)],
      snapshots,
      NET_GAIN_TODAY
    );
    // The Aug 15 deposit is inside the anchor snapshot; only Aug 16 counts.
    expect(r).toMatchObject({
      mode: "anchored",
      netContributions: "1000.00",
      gain: "514.67", // 47514.67 − 46000 − 1000
    });
  });

  it("refuses lifetime mode when the earliest row is not an external deposit", () => {
    const feed = [
      feedRow(IND, "2026-01-10", "1000.00", "buy", "buy"),
      feedRow(IND, "2026-02-01", "-3000.00", "transfer", "transfer"),
    ];
    const [r] = computeAccountNetGains(
      feed,
      [INDIVIDUAL_INFO],
      [cashHolding(IND, "2000.00", "cash", true)], // residual is zero
      [],
      NET_GAIN_TODAY
    );
    expect(r.mode).toBe("none");
  });

  it("refuses lifetime mode when the first deposit sits inside the backfill margin", () => {
    const info: AccountInfoRow = { ...INDIVIDUAL_INFO, itemCreatedAt: "2026-08-15" };
    // Threshold is 2024-08-15 + 7d = 2024-08-22; this deposit is too early.
    const feed = [feedRow(IND, "2024-08-18", "-1000.00", "transfer", "transfer")];
    const [r] = computeAccountNetGains(
      feed,
      [info],
      [cashHolding(IND, "1000.00", "cash", true)],
      [],
      NET_GAIN_TODAY
    );
    expect(r.mode).toBe("none");
  });

  it("nets withdrawals against contributions", () => {
    const feed = [
      feedRow(IND, "2026-01-05", "-10000.00", "transfer", "transfer"),
      feedRow(IND, "2026-03-01", "4000.00", "transfer", "transfer"),
    ];
    const [r] = computeAccountNetGains(
      feed,
      [{ ...INDIVIDUAL_INFO, currentBalance: "7000.00" }],
      [cashHolding(IND, "6000.00", "cash", true)],
      [],
      NET_GAIN_TODAY
    );
    expect(r).toMatchObject({
      mode: "lifetime",
      contributions: "10000.00",
      withdrawals: "4000.00",
      netContributions: "6000.00",
      gain: "1000.00",
      gainPct: "16.7",
    });
  });

  it("suppresses the percent when net contributions are not positive", () => {
    const feed = [
      feedRow(IND, "2026-01-05", "-1000.00", "transfer", "transfer"),
      feedRow(IND, "2026-02-01", "-6000.00", "sell", "sell"),
      feedRow(IND, "2026-03-01", "5000.00", "transfer", "transfer"),
      feedRow(IND, "2026-03-10", "2000.00", "buy", "buy"),
    ];
    const [r] = computeAccountNetGains(
      feed,
      [{ ...INDIVIDUAL_INFO, currentBalance: "500.00" }],
      [cashHolding(IND, "2500.00", "equity", false)], // zero cash, but holdings exist
      [],
      NET_GAIN_TODAY
    );
    expect(r).toMatchObject({
      mode: "lifetime",
      netContributions: "-4000.00",
      gain: "4500.00",
      gainPct: null,
    });
  });

  it("ignores splits and dividends as flows while counting them toward cash", () => {
    const feed = [
      feedRow(IND, "2026-01-05", "-1000.00", "transfer", "transfer"),
      feedRow(IND, "2026-02-01", "-50.00", "fee", "dividend"),
      feedRow(IND, "2026-02-10", "0.00", "transfer", "split"),
    ];
    const [r] = computeAccountNetGains(
      feed,
      [INDIVIDUAL_INFO],
      [cashHolding(IND, "1050.00", "cash", true)],
      [],
      NET_GAIN_TODAY
    );
    expect(r.mode).toBe("lifetime");
    expect(r.contributions).toBe("1000.00");
    expect(r.contributionSeries.map((p) => p.date)).toEqual([
      "2026-01-05",
      "2026-08-16",
    ]);
  });

  it("refuses lifetime mode for an account with no holdings rows", () => {
    const feed = [
      feedRow(IND, "2026-01-05", "-1000.00", "transfer", "transfer"),
      feedRow(IND, "2026-02-01", "1000.00", "buy", "buy"),
    ];
    const [r] = computeAccountNetGains(feed, [INDIVIDUAL_INFO], [], [], NET_GAIN_TODAY);
    expect(r.mode).toBe("none");
    expect(r.gain).toBeNull();
    expect(r.gainPct).toBeNull();
  });

  it("skips null-balance accounts and sorts by balance descending", () => {
    const accounts: AccountInfoRow[] = [
      { accountId: "small", name: "Small", mask: null, currentBalance: "10.00", itemCreatedAt: "2026-07-20" },
      { accountId: "dead", name: "Dead", mask: null, currentBalance: null, itemCreatedAt: "2026-07-20" },
      { accountId: "big", name: "Big", mask: null, currentBalance: "999.00", itemCreatedAt: "2026-07-20" },
    ];
    const result = computeAccountNetGains([], accounts, [], [], NET_GAIN_TODAY);
    expect(result.map((r) => r.accountId)).toEqual(["big", "small"]);
    expect(result[0].mode).toBe("none");
    expect(result[0].balanceSeries).toEqual([{ date: NET_GAIN_TODAY, value: "999.00" }]);
  });
});
