// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockClassifiedRows, selectResults, mockOnConflict, mockValues, mockLogServerError } = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockClassifiedRows: vi.fn(),
  selectResults: [] as unknown[][],
  mockOnConflict: vi.fn(),
  mockValues: vi.fn(),
  mockLogServerError: vi.fn(),
}));

const AUTH_ERROR = new Error("unauthorized");

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: (error: unknown) => error === AUTH_ERROR,
}));

vi.mock("@/lib/db/classified-transactions", () => ({
  selectClassifiedTransactionRows: mockClassifiedRows,
}));

// Each tx.select() chain resolves to the next queued result, in query order:
// Plaid accounts, manual accounts, the stored plan.
function selectChain(): unknown {
  const result = selectResults.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "limit"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return chain;
}

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (tx: unknown) => unknown) =>
    callback({
      select: vi.fn(() => selectChain()),
      insert: vi.fn(() => ({
        values: (values: unknown) => {
          mockValues(values);
          return { onConflictDoUpdate: mockOnConflict };
        },
      })),
    })
  ),
}));

vi.mock("@/lib/logging", () => ({ logServerError: mockLogServerError }));

import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/fire/route";
import { defaultPlan } from "@/lib/fire-model";

function txn(amount: string, date: string, category: string, categoryDetailed: string) {
  return {
    amount,
    date,
    name: "Fixture",
    merchantName: null,
    category,
    categoryDetailed,
    pending: false,
    accountType: "depository",
    accountSubtype: "checking",
    accountName: "Checking",
  };
}

function put(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/fire", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T18:00:00Z"));
  mockGetUserId.mockResolvedValue("user-a");
  mockOnConflict.mockResolvedValue(undefined);
  selectResults.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET /api/fire", () => {
  it("summarizes the last twelve complete months and suggests account kinds", async () => {
    mockClassifiedRows.mockResolvedValue([
      txn("-12000.00", "2026-08-01", "INCOME", "INCOME_WAGES"),
      txn("7000.00", "2026-08-10", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
      txn("-12000.00", "2026-09-01", "INCOME", "INCOME_WAGES"),
      txn("5000.00", "2026-09-10", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
      txn("-12000.00", "2026-10-01", "INCOME", "INCOME_WAGES"), // October is partial: not counted
    ]);
    selectResults.push(
      [
        { accountId: "chk", name: "Checking", mask: "9701", type: "depository", subtype: "checking", currentBalance: "6819.40", institutionName: "Chase" },
        { accountId: "roth", name: "Roth Contributory IRA", mask: "6093", type: "investment", subtype: "roth", currentBalance: "7094.23", institutionName: "Charles Schwab" },
        { accountId: "brk", name: "Self-Directed", mask: "6850", type: "investment", subtype: "brokerage", currentBalance: "311957.55", institutionName: "Chase" },
      ],
      [{ id: 2, name: "Vanguard 401K", type: "asset", subtype: "401K", balance: "157000.00" }],
      []
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mockClassifiedRows).toHaveBeenCalledWith(expect.anything(), "user-a", "2025-10-01");
    expect(body.asOf).toBe("2026-10-09");
    expect(body.cashflow).toEqual({
      takeHomeMonthly: 12000,
      spendingMonthly: 6000,
      cashSavedYearly: 72000,
      monthsCounted: 2,
      firstMonth: "2026-08",
      lastMonth: "2026-09",
    });
    expect(body.accounts).toEqual([
      { key: "plaid:brk", name: "Self-Directed", detail: "Chase ····6850", source: "plaid", balance: 311957.55, suggestedKind: "brokerage" },
      { key: "plaid:roth", name: "Roth Contributory IRA", detail: "Charles Schwab ····6093", source: "plaid", balance: 7094.23, suggestedKind: "roth" },
      { key: "plaid:chk", name: "Checking", detail: "Chase ····9701", source: "plaid", balance: 6819.4, suggestedKind: "excluded" },
      { key: "manual:2", name: "Vanguard 401K", detail: "Manual account", source: "manual", balance: 157000, suggestedKind: "k401" },
    ]);
    expect(body.plan).toBeNull();
    expect(body.savedAt).toBeNull();
  });

  it("returns the stored plan and when it was saved", async () => {
    mockClassifiedRows.mockResolvedValue([]);
    const plan = { ...defaultPlan(), typedAccounts: [{ id: "river", name: "River", owner: "you", kind: "crypto", balance: 15000, contributionYearly: 0 }] };
    selectResults.push([], [], [{ plan, updatedAt: new Date("2026-10-09T17:00:00Z") }]);
    const body = await (await GET()).json();
    expect(body.plan).toEqual(plan);
    expect(body.savedAt).toBe("2026-10-09T17:00:00.000Z");
  });

  it("drops a stored plan that no longer validates", async () => {
    mockClassifiedRows.mockResolvedValue([]);
    selectResults.push([], [], [{ plan: { version: 99 }, updatedAt: new Date() }]);
    const body = await (await GET()).json();
    expect(body.plan).toBeNull();
    expect(mockLogServerError).toHaveBeenCalledWith("Stored FIRE plan failed validation", expect.any(Error));
  });

  it("returns 401 when signed out", async () => {
    mockGetUserId.mockRejectedValue(AUTH_ERROR);
    expect((await GET()).status).toBe(401);
  });
});

describe("PUT /api/fire", () => {
  it("validates and upserts the plan", async () => {
    const plan = { ...defaultPlan(), assumptions: { ...defaultPlan().assumptions, yourAge: 36 } };
    const response = await PUT(put(plan));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ plan, savedAt: "2026-10-09T18:00:00.000Z" });
    expect(mockValues).toHaveBeenCalledWith({ userId: "user-a", plan, updatedAt: new Date("2026-10-09T18:00:00Z") });
    expect(mockOnConflict).toHaveBeenCalledWith(expect.objectContaining({ set: { plan, updatedAt: new Date("2026-10-09T18:00:00Z") } }));
  });

  it("rejects an invalid plan or a body that is not JSON", async () => {
    const bad = await PUT(put({ version: 1, assumptions: { yourAge: 5 } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("yourAge must be a number from 18 to 100");
    expect((await PUT(put("not json"))).status).toBe(400);
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    mockGetUserId.mockRejectedValue(AUTH_ERROR);
    expect((await PUT(put(defaultPlan()))).status).toBe(401);
  });
});
