// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockWhere } = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockWhere: vi.fn(),
}));

const AUTH_ERROR = new Error("unauthorized");

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: (error: unknown) => error === AUTH_ERROR,
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (tx: unknown) => unknown) =>
    callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({ where: mockWhere })),
          })),
        })),
      })),
    })
  ),
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/cashflow/route";

// The reconciliation fixture from docs/plans/cash-flow-analytics.md, as rows
// the route's select would return. Hand-computed expectations:
//   income 4200.00, spending 2682.33, savings 1000.00, netCashFlow 1517.67.
const FIXTURE_ROWS = [
  {
    amount: "-4200.00",
    date: "2026-08-01",
    category: "INCOME",
    categoryDetailed: "INCOME_WAGES",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
  },
  {
    amount: "350.00",
    date: "2026-08-03",
    category: "FOOD_AND_DRINK",
    categoryDetailed: "FOOD_AND_DRINK_GROCERIES",
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
  },
  {
    amount: "412.33",
    date: "2026-08-05",
    category: "FOOD_AND_DRINK",
    categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS",
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
  },
  {
    amount: "1800.00",
    date: "2026-08-01",
    category: "RENT_AND_UTILITIES",
    categoryDetailed: "RENT_AND_UTILITIES_RENT",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
  },
  {
    amount: "1850.00",
    date: "2026-08-10",
    category: "LOAN_PAYMENTS",
    categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
  },
  {
    amount: "-1850.00",
    date: "2026-08-10",
    category: "LOAN_PAYMENTS",
    categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
  },
  {
    amount: "1000.00",
    date: "2026-08-11",
    category: "TRANSFER_OUT",
    categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
  },
  {
    amount: "120.00",
    date: "2026-08-12",
    category: "TRANSFER_OUT",
    categoryDetailed: "TRANSFER_OUT_OTHER_TRANSFER_OUT",
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T12:00:00Z"));
  mockGetUserId.mockResolvedValue("user-123");
  mockWhere.mockResolvedValue(FIXTURE_ROWS);
});

afterEach(() => {
  vi.useRealTimers();
});

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/cashflow${query}`);
}

describe("GET /api/analytics/cashflow", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUserId.mockRejectedValueOnce(AUTH_ERROR);
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("returns reconciled monthly totals", async () => {
    const response = await GET(request("?months=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.months).toHaveLength(1);
    expect(body.months[0]).toMatchObject({
      month: "2026-08",
      partial: true,
      income: "4200.00",
      spending: "2682.33",
      savings: "1000.00",
      netCashFlow: "1517.67",
    });

    const keys = body.months[0].spendingByCategory.map(
      (c: { key: string }) => c.key
    );
    expect(keys).not.toContain("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
    expect(keys).not.toContain(
      "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"
    );
  });

  it("defaults to six months and clamps the months parameter", async () => {
    const defaulted = await (await GET(request())).json();
    expect(defaulted.months).toHaveLength(6);

    const clamped = await (await GET(request("?months=99"))).json();
    expect(clamped.months).toHaveLength(24);

    const invalid = await (await GET(request("?months=abc"))).json();
    expect(invalid.months).toHaveLength(6);
  });

  it("returns a zero-filled window for a user with no transactions", async () => {
    mockWhere.mockResolvedValueOnce([]);
    const body = await (await GET(request("?months=3"))).json();

    expect(body.months).toHaveLength(3);
    expect(body.months.map((m: { month: string }) => m.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    for (const month of body.months) {
      expect(month.income).toBe("0.00");
      expect(month.spending).toBe("0.00");
      expect(month.savings).toBe("0.00");
      expect(month.spendingByCategory).toEqual([]);
    }
  });
});
