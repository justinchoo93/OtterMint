// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET } from "@/app/api/analytics/cashflow/items/route";

function fixtureRow(overrides: Record<string, unknown>) {
  return {
    name: "Fixture Txn",
    merchantName: null,
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
    accountName: "CREDIT CARD",
    category: "FOOD_AND_DRINK",
    categoryDetailed: "FOOD_AND_DRINK_RESTAURANTS",
    ...overrides,
  };
}

const ROWS = [
  fixtureRow({ amount: "412.33", date: "2026-08-05", name: "Sushi" }),
  fixtureRow({ amount: "20.00", date: "2026-08-09", name: "Coffee" }),
  fixtureRow({ amount: "350.00", date: "2026-08-03", name: "Grocer", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" }),
  fixtureRow({ amount: "-4200.00", date: "2026-08-01", name: "Payroll", category: "INCOME", categoryDetailed: "INCOME_WAGES", accountType: "depository", accountSubtype: "checking" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  mockWhere.mockResolvedValue(ROWS);
});

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/cashflow/items?${query}`);
}

describe("GET /api/analytics/cashflow/items", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUserId.mockRejectedValueOnce(AUTH_ERROR);
    const response = await GET(request("from=2026-08&to=2026-08&flow=spending"));
    expect(response.status).toBe(401);
  });

  it.each([
    ["a bad month", "from=2026-13&to=2026-08&flow=spending"],
    ["a reversed range", "from=2026-09&to=2026-08&flow=spending"],
    ["an unknown flow", "from=2026-08&to=2026-08&flow=internal"],
    ["a lowercase category", "from=2026-08&to=2026-08&flow=spending&category=restaurants"],
    ["a zero limit", "from=2026-08&to=2026-08&flow=spending&limit=0"],
    ["an unknown sort", "from=2026-08&to=2026-08&flow=spending&sort=name"],
  ])("rejects %s with 400 before reading the database", async (_label, query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it("filters to the requested categories, newest first, with count and total", async () => {
    const response = await GET(
      request("from=2026-08&to=2026-08&flow=spending&category=FOOD_AND_DRINK_RESTAURANTS")
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(["Coffee", "Sushi"]);
    expect(body.count).toBe(2);
    expect(body.total).toBe("432.33");
  });

  it("sorts by amount and applies the limit after counting", async () => {
    const body = await (await GET(request("from=2026-08&to=2026-08&flow=spending&sort=amount&limit=1"))).json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(["Sushi"]);
    expect(body.count).toBe(3);
    expect(body.total).toBe("782.33");
  });

  it("accepts several category values", async () => {
    const body = await (
      await GET(
        request(
          "from=2026-08&to=2026-08&flow=spending&category=FOOD_AND_DRINK_GROCERIES&category=FOOD_AND_DRINK_RESTAURANTS"
        )
      )
    ).json();
    expect(body.count).toBe(3);
  });
});
