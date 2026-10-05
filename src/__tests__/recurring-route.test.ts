// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockWhere, mockMemoriesWhere } = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockWhere: vi.fn(),
  mockMemoriesWhere: vi.fn(),
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
        // Transactions: from().innerJoin().innerJoin().where();
        // category memories: from().where().
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({ where: mockWhere })),
          })),
          where: mockMemoriesWhere,
        })),
      })),
    })
  ),
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { GET } from "@/app/api/analytics/recurring/route";

function fixtureRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    name: "Fixture Txn",
    merchantName: null,
    pending: false,
    category: "FOOD_AND_DRINK",
    categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS",
    accountType: "credit",
    accountSubtype: "credit card",
    accountName: "Sapphire",
    ...overrides,
  };
}

// Netflix on the 22nd for twelve months, plus one restaurant charge a month
// whose amount varies (so it is not recurring) and averages 200 over the
// eleven complete months: average spending 15.49 + 200 = 215.49.
const MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const DINNERS = [120, 280, 160, 240, 200, 300, 100, 260, 140, 220, 180, 190];
const FIXTURE_ROWS = MONTHS.flatMap((m, i) => [
  fixtureRow({
    amount: "15.49",
    date: `${m}-22`,
    name: "NETFLIX.COM",
    merchantName: "Netflix",
    category: "ENTERTAINMENT",
    categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
  }),
  fixtureRow({ amount: DINNERS[i].toFixed(2), date: `${m}-05`, name: "DINNER" }),
]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  mockGetUserId.mockResolvedValue("user-123");
  mockMemoriesWhere.mockResolvedValue([]);
  mockWhere.mockResolvedValue(FIXTURE_ROWS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/analytics/recurring", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUserId.mockRejectedValueOnce(AUTH_ERROR);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it("detects charges from the last thirteen months and prices them against average spending", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(body.asOf).toBe("2026-09-29");
    expect(body.charges).toHaveLength(1);
    expect(body.charges[0]).toMatchObject({ merchant: "Netflix", cadence: "monthly", amount: "15.49" });
    expect(body.monthlyTotal).toBe("15.49");
    // 15.49 of a 215.49 average month, rounded to a whole percent.
    expect(body.shareOfSpending).toBe(7);
  });

  it("has no share when no complete month has activity", async () => {
    mockWhere.mockResolvedValueOnce(FIXTURE_ROWS.filter((r) => String(r.date) >= "2026-09"));
    const body = await (await GET()).json();
    expect(body.charges).toEqual([]);
    expect(body.shareOfSpending).toBeNull();
  });

  it("returns 500 when the query fails", async () => {
    mockWhere.mockRejectedValueOnce(new Error("boom"));
    const response = await GET();
    expect(response.status).toBe(500);
  });
});
