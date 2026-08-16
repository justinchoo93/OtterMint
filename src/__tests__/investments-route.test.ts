// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockQueue } = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  // Each select() call in the route resolves the next queued result, in the
  // route's query order: aggregate, account snapshots, events, flows, holdings.
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

const FP_A = "3ae0d7a9bf";
const FP_B = "662be166ac";

const AGGREGATE = [
  { date: "2026-07-05", investmentTotal: "391010.83", coverageFingerprint: null },
  { date: "2026-07-22", investmentTotal: "451013.63", coverageFingerprint: null },
  { date: "2026-07-23", investmentTotal: "452791.71", coverageFingerprint: FP_A },
  { date: "2026-08-11", investmentTotal: "438415.61", coverageFingerprint: FP_A },
  { date: "2026-08-13", investmentTotal: "460928.64", coverageFingerprint: FP_B },
  { date: "2026-08-14", investmentTotal: "459956.89", coverageFingerprint: FP_B },
];

const ACCOUNT_SNAPSHOTS = [
  { accountId: "acc_roth", name: "Roth IRA", date: "2026-08-15", balance: "12261.81" },
];

const EVENTS = [{ effectiveDate: "2026-08-13", assetAdjustment: "0.00" }];

const FLOWS = [
  {
    amount: "2500.00",
    date: "2026-07-31",
    name: "Manual DB-Bkrg 07/31",
    merchantName: null,
    category: "TRANSFER_OUT",
    categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
    accountName: "TOTAL CHECKING",
  },
];

// A brokerage credit Plaid mislabels as income; the category-correction rule
// (src/lib/category-rules.ts) must reroute it into the withdrawal flows.
const CR_BKRG_FLOW = {
  amount: "-1000.00",
  date: "2026-08-01",
  name: "Manual CR-Bkrg",
  merchantName: null,
  category: "INCOME",
  categoryDetailed: "INCOME_CONTRACTOR",
  pending: false,
  accountType: "depository",
  accountSubtype: "checking",
  accountName: "TOTAL CHECKING",
};

const DIVIDEND_ROWS = [
  { date: "2026-08-01", amount: "-46.80", subtype: "dividend" },
];

const HOLDINGS = [
  {
    accountId: "acc_roth",
    accountName: "Roth IRA",
    securityId: "sec_voo",
    tickerSymbol: "VOO",
    name: "Vanguard S&P 500",
    value: "12261.81",
    costBasis: "9891.58",
    securityType: "etf",
    isCashEquivalent: false,
  },
];

function queue(...results: unknown[][]) {
  mockQueue.results = results;
  mockQueue.next = 0;
}

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/investments${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  queue(AGGREGATE, ACCOUNT_SNAPSHOTS, EVENTS, FLOWS, DIVIDEND_ROWS, HOLDINGS);
});

describe("GET /api/analytics/investments", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUserId.mockRejectedValueOnce(AUTH_ERROR);
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the reconciled trusted-window attribution", async () => {
    const body = await (await GET(request())).json();
    expect(body.attribution).toMatchObject({
      windowStart: "2026-07-23",
      windowEnd: "2026-08-14",
      start: "452791.71",
      contributions: "2500.00",
      coverageSteps: "0.00",
      marketPnl: "4665.18",
      end: "459956.89",
    });
  });

  it("segments the series and never bridges the legacy region into math", async () => {
    const body = await (await GET(request())).json();
    const segments = new Set(
      body.series.points.map((p: { segment: number }) => p.segment)
    );
    expect(segments.size).toBe(3); // legacy, FP_A, FP_B
    expect(body.series.boundaries).toEqual([
      { date: "2026-07-23", step: null },
      { date: "2026-08-13", step: "0.00" },
    ]);
    expect(body.series.accounts).toEqual([
      {
        accountId: "acc_roth",
        name: "Roth IRA",
        points: [{ date: "2026-08-15", value: "12261.81" }],
      },
    ]);
  });

  it("returns individual flows for chart markers", async () => {
    const body = await (await GET(request())).json();
    expect(body.flows).toEqual([
      { date: "2026-07-31", kind: "contribution", amount: "2500.00" },
    ]);
  });

  it("corrects Plaid-miscategorized brokerage credits into withdrawal flows", async () => {
    queue(
      AGGREGATE,
      ACCOUNT_SNAPSHOTS,
      EVENTS,
      [...FLOWS, CR_BKRG_FLOW],
      DIVIDEND_ROWS,
      HOLDINGS
    );
    const body = await (await GET(request())).json();
    expect(body.flows).toContainEqual({
      date: "2026-08-01",
      kind: "withdrawal",
      amount: "1000.00",
    });
  });

  it("returns the allocation breakdown", async () => {
    const body = await (await GET(request())).json();
    expect(body.allocation).toEqual([
      { type: "etf", value: "12261.81", share: "100.0", count: 1 },
    ]);
  });

  it("returns trailing-twelve-month dividends", async () => {
    const body = await (await GET(request())).json();
    expect(body.dividends.trailingTwelveMonths).toBe("46.80");
    expect(body.dividends.monthly).toHaveLength(12);
  });

  it("reports xirr as null for a sub-30-day trusted window and unrealized always", async () => {
    const body = await (await GET(request())).json();
    // Trusted window Jul 23 → Aug 14 is 22 days: too short to annualize.
    expect(body.xirr).toBeNull();
    expect(body.unrealized.total).toMatchObject({
      value: "12261.81",
      cost: "9891.58",
      gain: "2370.23",
      gainPct: "24.0",
      cashValue: "0.00",
      excludedValue: "0.00",
    });
  });

  it("computes xirr once the trusted window is long enough and step-free", async () => {
    const longWindow = [
      { date: "2026-01-01", investmentTotal: "100000.00", coverageFingerprint: FP_A },
      { date: "2027-01-01", investmentTotal: "110000.00", coverageFingerprint: FP_A },
    ];
    queue(longWindow, [], [], [], [], HOLDINGS);
    const body = await (await GET(request())).json();
    expect(body.xirr).toBe("0.1000");
  });

  it("handles a user with no investment data without erroring", async () => {
    queue([], [], [], [], [], []);
    const body = await (await GET(request())).json();
    expect(body.series.points).toEqual([]);
    expect(body.attribution).toBeNull();
    expect(body.xirr).toBeNull();
    expect(body.unrealized.positions).toEqual([]);
    expect(body.accountReturns).toEqual([]);
  });

  it("returns per-account net gains from the full feed and snapshot history", async () => {
    // Query order: aggregate, windowed snapshots, events, flows, dividends,
    // holdings, feed, account info, unwindowed snapshots.
    const feed = [
      { accountId: "acc_roth", date: "2025-03-21", amount: "-7000.00", type: "transfer", subtype: "transfer" },
      { accountId: "acc_roth", date: "2025-04-01", amount: "5000.00", type: "buy", subtype: "buy" },
    ];
    const info = [
      {
        accountId: "acc_roth",
        name: "Roth IRA",
        mask: "6093",
        currentBalance: "12261.81",
        itemCreatedAt: new Date("2026-07-20T00:00:00Z"),
      },
    ];
    const cashHoldings = [
      { ...HOLDINGS[0], securityId: "cash", value: "2000.00", securityType: "cash", isCashEquivalent: true },
    ];
    queue(AGGREGATE, ACCOUNT_SNAPSHOTS, EVENTS, FLOWS, DIVIDEND_ROWS, cashHoldings, feed, info, ACCOUNT_SNAPSHOTS);
    const body = await (await GET(request())).json();
    expect(body.accountReturns).toHaveLength(1);
    expect(body.accountReturns[0]).toMatchObject({
      accountId: "acc_roth",
      mode: "lifetime",
      startDate: "2025-03-21",
      netContributions: "7000.00",
      balance: "12261.81",
      gain: "5261.81",
    });
  });

  it("anchors accounts whose cash does not reconcile the feed", async () => {
    const feed = [
      { accountId: "acc_roth", date: "2024-08-15", amount: "5000.00", type: "buy", subtype: "buy" },
    ];
    const info = [
      {
        accountId: "acc_roth",
        name: "Roth IRA",
        mask: "6093",
        currentBalance: "12261.81",
        itemCreatedAt: new Date("2026-07-20T00:00:00Z"),
      },
    ];
    queue(AGGREGATE, ACCOUNT_SNAPSHOTS, EVENTS, FLOWS, DIVIDEND_ROWS, HOLDINGS, feed, info, ACCOUNT_SNAPSHOTS);
    const body = await (await GET(request())).json();
    expect(body.accountReturns[0]).toMatchObject({
      mode: "anchored",
      startDate: "2026-08-15",
      gain: "0.00", // 12261.81 − 12261.81 anchor − 0 flows
    });
  });
});
