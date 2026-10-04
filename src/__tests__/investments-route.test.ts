// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockQueue } = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  // Each select() call in the route resolves the next queued result, in the
  // route's query order: aggregate rows, investment accounts, the whole feed,
  // holdings, holding snapshots, balance snapshots, plaid account ids, manual
  // account ids, the earliest aggregate date.
  mockQueue: { results: [] as unknown[][], next: 0 },
}));

const AUTH_ERROR = new Error("unauthorized");

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: (error: unknown) => error === AUTH_ERROR,
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (tx: unknown) => unknown) => {
    const chain = () => {
      const resolve = async () => mockQueue.results[mockQueue.next++] ?? [];
      return {
        from: chain,
        innerJoin: chain,
        where: resolve,
      };
    };
    return callback({ select: chain });
  }),
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/investments/route";
import { computeUserCoverageFingerprint } from "@/lib/net-worth-history";

const PLAID_IDS = ["acc_6850", "acc_6940", "acc_5111", "acc_6093", "acc_chk"];
const FP_LIVE = computeUserCoverageFingerprint(PLAID_IDS, []);
const FP_A = "3ae0d7a9bf";
const FP_B = "662be166ac";

const AGGREGATE = [
  { date: "2026-07-05", investmentTotal: "391010.83", coverageFingerprint: null },
  { date: "2026-07-22", investmentTotal: "451013.63", coverageFingerprint: null },
  { date: "2026-07-23", investmentTotal: "452791.71", coverageFingerprint: FP_A },
  { date: "2026-08-11", investmentTotal: "438415.61", coverageFingerprint: FP_A },
  { date: "2026-08-13", investmentTotal: "460928.64", coverageFingerprint: FP_B },
  { date: "2026-09-26", investmentTotal: "390000.00", coverageFingerprint: FP_LIVE },
];

const ITEM_CREATED = new Date("2026-08-15T00:00:00Z");
// Balances equal each account's holdings below; the two Schwab accounts' cash
// reconciles their feed to the cent (lifetime), the Chase accounts do not.
const ACCOUNTS = [
  { accountId: "acc_6850", name: "Self-Directed", mask: "6850", subtype: "brokerage", currentBalance: "312480.42", institutionName: "Chase", itemCreatedAt: ITEM_CREATED },
  { accountId: "acc_6940", name: "Self-Directed", mask: "6940", subtype: "brokerage", currentBalance: "18960.18", institutionName: "Chase", itemCreatedAt: ITEM_CREATED },
  { accountId: "acc_5111", name: "Individual", mask: "5111", subtype: "brokerage", currentBalance: "41118.00", institutionName: "Charles Schwab", itemCreatedAt: ITEM_CREATED },
  { accountId: "acc_6093", name: "Roth IRA", mask: "6093", subtype: "roth", currentBalance: "18825.14", institutionName: "Charles Schwab", itemCreatedAt: ITEM_CREATED },
];

let nextId = 1;
function feed(
  accountId: string,
  date: string,
  type: string,
  subtype: string | null,
  amount: string,
  name: string,
  extra: Partial<{ quantity: string; price: string; securityId: string }> = {}
) {
  return {
    id: nextId++,
    accountId,
    securityId: extra.securityId ?? null,
    date,
    name,
    amount,
    type,
    subtype,
    quantity: extra.quantity ?? null,
    price: extra.price ?? null,
  };
}

// Plaid feed sign: positive = cash left the account. Covers all eight
// production type|subtype shapes.
const FEED = [
  feed("acc_5111", "2026-04-22", "transfer", "transfer", "-10000.00", "Deposit from Chase checking"),
  feed("acc_5111", "2026-05-06", "transfer", "transfer", "-5000.00", "Deposit from Chase checking"),
  feed("acc_5111", "2026-05-20", "transfer", "transfer", "-7500.00", "Deposit from Chase checking"),
  feed("acc_5111", "2026-06-03", "transfer", "transfer", "-12500.00", "Deposit from Chase checking"),
  feed("acc_5111", "2026-06-18", "buy", "buy", "15856.00", "Bought AAPL", { quantity: "80", price: "198.20", securityId: "sec_aapl" }),
  feed("acc_5111", "2026-08-27", "buy", "buy", "7050.00", "Bought to open AAPL call", { quantity: "5", price: "14.10", securityId: "sec_aapl_c" }),
  feed("acc_5111", "2026-09-24", "sell", "sell", "-2910.00", "Sold to close AAPL call", { quantity: "-3", price: "9.70", securityId: "sec_aapl_c2" }),
  feed("acc_5111", "2026-09-26", "buy", "buy", "3564.00", "Bought NVDA", { quantity: "20", price: "178.20", securityId: "sec_nvda" }),
  feed("acc_6093", "2026-04-10", "transfer", "transfer", "-7500.14", "IRA ROTH CONV - TRANSFER"),
  feed("acc_6093", "2026-04-24", "transfer", "transfer", "-5000.00", "IRA ROTH CONV - TRANSFER"),
  feed("acc_6093", "2026-05-04", "buy", "buy", "9725.00", "Bought CRWD", { quantity: "25", price: "389.00", securityId: "sec_crwd" }),
  feed("acc_6093", "2026-05-08", "transfer", "transfer", "-5000.00", "IRA ROTH CONV - TRANSFER"),
  feed("acc_6093", "2026-08-14", "buy", "buy", "5052.00", "Bought NVDA", { quantity: "30", price: "168.40", securityId: "sec_nvda" }),
  feed("acc_6093", "2026-09-08", "sell", "sell", "-6315.00", "Sold CRWD", { quantity: "-15", price: "421.00", securityId: "sec_crwd" }),
  feed("acc_6850", "2026-07-02", "fee", "dividend", "-362.50", "VTI dividend"),
  feed("acc_6850", "2026-08-03", "transfer", "transfer", "2000.00", "Transfer to Chase checking"),
  feed("acc_6850", "2026-08-20", "transfer", "split", "0.00", "CRWD split", { quantity: "23.4" }),
  feed("acc_6850", "2026-08-22", "sell", "sell", "-5724.00", "Sold QQQ", { quantity: "-10", price: "572.40", securityId: "sec_qqq" }),
  feed("acc_6850", "2026-09-02", "buy", "buy", "6162.00", "Bought VTI", { quantity: "20", price: "308.10", securityId: "sec_vti" }),
  feed("acc_6850", "2026-09-12", "cash", "interest", "-38.12", "Sweep interest"),
  feed("acc_6940", "2026-09-15", "transfer", "transfer", "-5000.00", "Deposit from Chase checking"),
  feed("acc_6940", "2026-09-19", "fee", "dividend", "-104.80", "SCHD dividend"),
];

function holding(
  accountId: string,
  accountName: string,
  securityId: string,
  tickerSymbol: string | null,
  name: string,
  securityType: string,
  quantity: string,
  price: string,
  value: string,
  costBasis: string | null,
  isCashEquivalent = false
) {
  return { accountId, accountName, securityId, tickerSymbol, name, quantity, price, value, costBasis, securityType, isCashEquivalent };
}

const HOLDINGS = [
  holding("acc_6850", "Self-Directed", "sec_vti", "VTI", "Vanguard Total Stock Market ETF", "etf", "420.00000000", "312.4000", "131208.00", "112788.00"),
  holding("acc_6850", "Self-Directed", "sec_qqq", "QQQ", "Invesco QQQ Trust", "etf", "60.00000000", "586.3000", "35178.00", "31068.00"),
  holding("acc_6850", "Self-Directed", "sec_aapl_chase", "AAPL", "Apple Inc.", "equity", "100.00000000", "248.1000", "24810.00", "19650.00"),
  holding("acc_6850", "Self-Directed", "sec_cash_6850", null, "Cash", "cash", "121284.42000000", "1.0000", "121284.42", null, true),
  holding("acc_6940", "Self-Directed", "sec_schd", "SCHD", "Schwab U.S. Dividend Equity ETF", "etf", "400.00000000", "27.1500", "10860.00", "10220.00"),
  holding("acc_6940", "Self-Directed", "sec_cash_6940", null, "Cash", "cash", "8100.18000000", "1.0000", "8100.18", null, true),
  holding("acc_5111", "Individual", "sec_aapl", "AAPL", "Apple Inc.", "equity", "80.00000000", "248.1000", "19848.00", "15856.00"),
  holding("acc_5111", "Individual", "sec_nvda", "NVDA", "NVIDIA Corp.", "equity", "20.00000000", "181.5000", "3630.00", "3564.00"),
  holding("acc_5111", "Individual", "sec_aapl_c", "AAPL261218C00260000", "AAPL Dec 18 2026 260 Call", "derivative", "500.00000000", "12.4000", "6200.00", "7050.00"),
  holding("acc_5111", "Individual", "sec_cash_5111", null, "Cash", "cash", "11440.00000000", "1.0000", "11440.00", null, true),
  holding("acc_6093", "Roth IRA", "sec_nvda", "NVDA", "NVIDIA Corp.", "equity", "30.00000000", "181.5000", "5445.00", "5052.00"),
  holding("acc_6093", "Roth IRA", "sec_crwd", "CRWD", "CrowdStrike Holdings", "equity", "10.00000000", "434.2000", "4342.00", "3890.00"),
  holding("acc_6093", "Roth IRA", "sec_cash_6093", null, "Cash", "cash", "9038.14000000", "1.0000", "9038.14", null, true),
];

const HOLDING_SNAPSHOTS = [
  { accountId: "acc_5111", securityId: "sec_aapl", date: "2026-06-20", price: "199.0000" }, // before the window: ignored
  { accountId: "acc_5111", securityId: "sec_aapl", date: "2026-08-20", price: "235.0000" },
  { accountId: "acc_5111", securityId: "sec_aapl", date: "2026-08-15", price: "230.0000" },
  { accountId: "acc_6850", securityId: "sec_vti", date: "2026-08-15", price: "298.7000" },
];

const BALANCE_SNAPSHOTS = [
  { accountId: "acc_6850", name: "Self-Directed", date: "2026-08-15", balance: "300000.00" },
  { accountId: "acc_6850", name: "Self-Directed", date: "2026-09-26", balance: "310000.00" },
  { accountId: "acc_6940", name: "Self-Directed", date: "2026-08-15", balance: "13500.00" },
  { accountId: "acc_5111", name: "Individual", date: "2026-09-26", balance: "40900.00" },
  { accountId: "acc_5111", name: "Individual", date: "2026-08-15", balance: "40000.00" },
  { accountId: "acc_6093", name: "Roth IRA", date: "2026-08-15", balance: "17000.00" },
];

const PLAID_ACCOUNT_ROWS = PLAID_IDS.map((accountId) => ({ accountId }));

function queue(overrides: Partial<Record<"aggregate" | "accounts" | "feed" | "holdings" | "holdingSnapshots" | "balanceSnapshots" | "plaidIds" | "manualIds" | "firstAggregate", unknown[]>> = {}) {
  mockQueue.results = [
    overrides.aggregate ?? AGGREGATE,
    overrides.accounts ?? ACCOUNTS,
    overrides.feed ?? FEED,
    overrides.holdings ?? HOLDINGS,
    overrides.holdingSnapshots ?? HOLDING_SNAPSHOTS,
    overrides.balanceSnapshots ?? BALANCE_SNAPSHOTS,
    overrides.plaidIds ?? PLAID_ACCOUNT_ROWS,
    overrides.manualIds ?? [],
    overrides.firstAggregate ?? [{ first: "2026-07-05" }],
  ];
  mockQueue.next = 0;
}

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/investments${query}`);
}

async function body(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  mockGetUserId.mockResolvedValue("user-123");
  queue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/analytics/investments", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUserId.mockRejectedValueOnce(AUTH_ERROR);
    expect((await GET(request())).status).toBe(401);
  });

  it("defaults to 90 days and clamps the days parameter to 1..3650", async () => {
    expect((await body()).since).toBe("2026-07-01");
    expect((await body()).today).toBe("2026-09-29");
    queue();
    expect((await body("?days=0")).since).toBe("2026-09-28");
    queue();
    const tenYears = new Date("2026-09-29T12:00:00Z");
    tenYears.setUTCDate(tenYears.getUTCDate() - 3650);
    expect((await body("?days=99999")).since).toBe(tenYears.toISOString().slice(0, 10));
    queue();
    expect((await body("?days=abc")).since).toBe("2026-07-01");
  });

  it("segments the aggregate at fingerprint changes and appends today's live total when comparable", async () => {
    const result = await body();
    expect(result.portfolio.points.map((p: { segment: number }) => p.segment)).toEqual([0, 0, 1, 1, 2, 3, 3]);
    expect(result.portfolio.points.at(-1)).toEqual({ date: "2026-09-29", value: "391383.74", segment: 3, quality: "known" });
    expect(result.portfolio.liveAppended).toBe(true);
    expect(result.portfolio.boundaries).toEqual([{ date: "2026-07-23" }, { date: "2026-08-13" }, { date: "2026-09-26" }]);
  });

  it("does not append a live point across a coverage change", async () => {
    queue({ aggregate: AGGREGATE.map((r, i) => (i === AGGREGATE.length - 1 ? { ...r, coverageFingerprint: "stale" } : r)) });
    const result = await body();
    expect(result.portfolio.points.at(-1)).toMatchObject({ date: "2026-09-26", value: "390000.00" });
    expect(result.portfolio.liveAppended).toBe(false);
  });

  it("describes each account with its institution, live balance, window points and net gain", async () => {
    const result = await body();
    const individual = result.accounts.find((a: { accountId: string }) => a.accountId === "acc_5111");
    expect(individual).toMatchObject({ name: "Individual", mask: "5111", institutionName: "Charles Schwab", subtype: "brokerage", balance: "41118.00" });
    expect(individual.points).toEqual([
      { date: "2026-08-15", value: "40000.00" },
      { date: "2026-09-26", value: "40900.00" },
      { date: "2026-09-29", value: "41118.00" },
    ]);
    // Deposits 35,000; balance 41,118 → +6,118 lifetime (cash 11,440 reconciles the feed to zero).
    expect(individual.netGain).toEqual({ mode: "lifetime", startDate: "2026-04-22", netContributions: "35000.00", gain: "6118.00", gainPct: "17.5" });
    const chase = result.accounts.find((a: { accountId: string }) => a.accountId === "acc_6850");
    expect(chase.netGain).toMatchObject({ mode: "anchored", startDate: "2026-08-15" });
    const roth = result.accounts.find((a: { accountId: string }) => a.accountId === "acc_6093");
    expect(roth.netGain).toMatchObject({ mode: "lifetime", netContributions: "17500.14", gain: "1325.00" });
  });

  it("reports external flows from the feed, in the window, with positive magnitudes", async () => {
    const result = await body();
    expect(result.flows).toEqual([
      { date: "2026-08-03", accountId: "acc_6850", kind: "withdrawal", amount: "2000.00" },
      { date: "2026-09-15", accountId: "acc_6940", kind: "deposit", amount: "5000.00" },
    ]);
  });

  it("reports dividends and interest by subtype, including fee-typed dividends, plus trailing twelve months", async () => {
    const result = await body();
    expect(result.income).toEqual([
      { date: "2026-07-02", accountId: "acc_6850", kind: "dividend", amount: "362.50" },
      { date: "2026-09-12", accountId: "acc_6850", kind: "interest", amount: "38.12" },
      { date: "2026-09-19", accountId: "acc_6940", kind: "dividend", amount: "104.80" },
    ]);
    expect(result.incomeTrailingTwelveMonths).toEqual([
      { accountId: "acc_6850", amount: "400.62" },
      { accountId: "acc_6940", amount: "104.80" },
      { accountId: "acc_5111", amount: "0.00" },
      { accountId: "acc_6093", amount: "0.00" },
    ]);
  });

  it("attaches the earliest in-window snapshot price to each position", async () => {
    const result = await body();
    const aapl = result.positions.find((p: { securityId: string }) => p.securityId === "sec_aapl");
    expect(aapl).toMatchObject({ tickerSymbol: "AAPL", quantity: "80.00000000", startPrice: "230.0000", startDate: "2026-08-15" });
    const nvda = result.positions.find((p: { securityId: string; accountId: string }) => p.securityId === "sec_nvda" && p.accountId === "acc_5111");
    expect(nvda).toMatchObject({ startPrice: null, startDate: null });
    expect(result.positions).toHaveLength(HOLDINGS.length);
  });

  it("lists the window's activity newest first with reader-signed amounts", async () => {
    const result = await body();
    expect(result.activityTotal).toBe(13);
    expect(result.activity).toHaveLength(13);
    expect(result.activity[0]).toMatchObject({ date: "2026-09-26", accountId: "acc_5111", kind: "buy", name: "Bought NVDA", amount: "-3564.00", quantity: "20", price: "178.20" });
    expect(result.activity.map((e: { kind: string }) => e.kind)).toContain("split");
    const dates = result.activity.map((e: { date: string }) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const dividend = result.activity.find((e: { kind: string; accountId: string }) => e.kind === "dividend" && e.accountId === "acc_6940");
    expect(dividend.amount).toBe("104.80");
  });

  describe("a window that ended before today (end)", () => {
    it("rejects an end that is malformed or in the future", async () => {
      for (const bad of ["?end=2026-9-1", "?end=tomorrow", "?end=2026-13-40", "?end=2026-09-30"]) {
        queue();
        const response = await GET(request(bad));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("end must be YYYY-MM-DD and not in the future");
      }
    });

    it("answers exactly as without it when end is today", async () => {
      const plain = await body();
      queue();
      expect(await body("?end=2026-09-29")).toEqual(plain);
      expect(plain.end).toBe("2026-09-29");
    });

    it("stops the lines at the end date and appends no live point", async () => {
      const result = await body("?days=90&end=2026-08-31");
      expect(result.end).toBe("2026-08-31");
      expect(result.today).toBe("2026-09-29");
      expect(result.portfolio.points.map((p: { date: string }) => p.date)).toEqual([
        "2026-07-05", "2026-07-22", "2026-07-23", "2026-08-11", "2026-08-13",
      ]);
      expect(result.portfolio.liveAppended).toBe(false);
      for (const account of result.accounts) {
        expect(account.points.every((p: { date: string }) => p.date <= "2026-08-31")).toBe(true);
      }
      // Balances and net gain stay as of today.
      expect(result.accounts[0].balance).toBe("312480.42");
    });

    it("keeps only the window's own flows, income and activity", async () => {
      const result = await body("?days=90&end=2026-08-31");
      expect(result.flows).toEqual([{ date: "2026-08-03", accountId: "acc_6850", kind: "withdrawal", amount: "2000.00" }]);
      expect(result.income).toEqual([{ date: "2026-07-02", accountId: "acc_6850", kind: "dividend", amount: "362.50" }]);
      const dates = result.activity.map((e: { date: string }) => e.date);
      expect(dates.every((d: string) => d >= "2026-07-01" && d <= "2026-08-31")).toBe(true);
      expect(result.activityTotal).toBe(result.activity.length);
      expect(result.activityTotal).toBeLessThan(13);
      expect(dates[0]).toBe("2026-08-27");
    });

    it("applies the 200-event cap to the window's events, not to later ones", async () => {
      const later = Array.from({ length: 250 }, (_, i) =>
        feed("acc_5111", "2026-09-10", "buy", "buy", "10.00", `Later buy ${i}`, { quantity: "1", price: "10.00", securityId: "sec_x" })
      );
      queue({ feed: [...FEED, ...later] });
      const result = await body("?days=90&end=2026-08-31");
      expect(result.activity.some((e: { name: string }) => e.name.startsWith("Later buy"))).toBe(false);
      expect(result.activity.some((e: { name: string }) => e.name === "Sold QQQ")).toBe(true);
      queue({ feed: [...FEED, ...later] });
      const today = await body("?days=90");
      expect(today.activity).toHaveLength(200);
      expect(today.activityTotal).toBe(263);
    });

    it("anchors trailing-twelve-month income to the end date", async () => {
      const result = await body("?days=90&end=2026-08-31");
      // Only the July dividend falls on or before August 31; September's interest and dividend do not.
      expect(result.incomeTrailingTwelveMonths).toEqual([
        { accountId: "acc_6850", amount: "362.50" },
        { accountId: "acc_6940", amount: "0.00" },
        { accountId: "acc_5111", amount: "0.00" },
        { accountId: "acc_6093", amount: "0.00" },
      ]);
    });
  });

  it("reports the earliest investment history date whatever the window", async () => {
    // Aggregate history starts 2026-07-05; the balance snapshots start 2026-08-15.
    expect((await body("?days=1")).firstDate).toBe("2026-07-05");
    queue({ firstAggregate: [{ first: null }] });
    expect((await body()).firstDate).toBe("2026-08-15");
    queue({ firstAggregate: [], balanceSnapshots: [] });
    expect((await body()).firstDate).toBeNull();
  });
});
