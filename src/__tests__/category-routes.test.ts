// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUserId, mockLoad, tx } = vi.hoisted(() => {
  const tx = {
    insertValues: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    updateSet: vi.fn(),
    updateWhere: vi.fn(),
    returning: vi.fn(),
    deleteWhere: vi.fn(),
    inserted: [] as unknown[],
    updatedTables: [] as unknown[],
  };
  return { mockGetUserId: vi.fn(), mockLoad: vi.fn(), tx };
});

const AUTH_ERROR = new Error("unauthorized");

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: (error: unknown) => error === AUTH_ERROR,
}));

vi.mock("@/lib/db/classified-transactions", () => ({
  loadClassifiedTransactions: mockLoad,
  selectClassifiedTransactionRows: vi.fn(async (...args: unknown[]) => (await mockLoad(...args)).rows),
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (handle: unknown) => unknown) =>
    callback({
      insert: (table: unknown) => {
        tx.inserted.push(table);
        return {
          values: (values: unknown) => {
            tx.insertValues(values);
            return { onConflictDoUpdate: tx.onConflictDoUpdate };
          },
        };
      },
      update: (table: unknown) => {
        tx.updatedTables.push(table);
        return {
          set: (values: unknown) => {
            tx.updateSet(values);
            return {
              where: (...args: unknown[]) => {
                tx.updateWhere(...args);
                const pending = Promise.resolve(undefined);
                return Object.assign(pending, { returning: tx.returning });
              },
            };
          },
        };
      },
      delete: () => ({
        where: (...args: unknown[]) => {
          tx.deleteWhere(...args);
          return { returning: tx.returning };
        },
      }),
    })
  ),
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { NextRequest } from "next/server";
import { categoryMemories, transactions } from "@/lib/db/schema";
import { GET as getCategories } from "@/app/api/categories/route";
import { GET as getUncategorized } from "@/app/api/analytics/uncategorized/route";
import { GET as getSimilar } from "@/app/api/transactions/[id]/similar/route";
import { DELETE as resetCategory, PUT as putCategory } from "@/app/api/transactions/[id]/category/route";
import { GET as getMemories } from "@/app/api/category-memories/route";
import { DELETE as deleteMemory } from "@/app/api/category-memories/[id]/route";

function row(id: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    amount: "12.00",
    date: `2026-03-${String(id).padStart(2, "0")}`,
    name,
    merchantName: null,
    storedMerchantName: null,
    category: "UNCATEGORIZED",
    categoryDetailed: null,
    userCategory: null,
    userCategoryDetailed: null,
    pending: false,
    accountType: "credit",
    accountSubtype: "credit card",
    accountName: "Sapphire",
    ...overrides,
  };
}

const ROWS = [
  row(1, "MONKEY GRIND SEATTLE WA 1", { amount: "5.50" }),
  row(2, "MONKEY GRIND SEATTLE WA 2", { amount: "6.25" }),
  row(3, "MONKEY GRIND SEATTLE WA 3", { amount: "4.75" }),
  row(4, "MONKEY GRIND SEATTLE WA 4", { amount: "7.00", pending: true }),
  row(5, "Venmo Payment 1041576003169 Web ID: 3264681992", { amount: "40.00" }),
  row(6, "Netflix", {
    merchantName: "Netflix",
    storedMerchantName: "Netflix",
    category: "ENTERTAINMENT",
    categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    amount: "17.99",
  }),
  row(7, "ACME PAYROLL PPD 123", { amount: "-2000.00" }),
];

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) =>
  new NextRequest("http://localhost/api/transactions/1/category", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const GROCERIES = { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE" };

beforeEach(() => {
  vi.clearAllMocks();
  tx.inserted.length = 0;
  tx.updatedTables.length = 0;
  mockGetUserId.mockResolvedValue("user-123");
  mockLoad.mockResolvedValue({ rows: ROWS, memories: [] });
  tx.returning.mockResolvedValue([{ id: 1 }]);
  tx.onConflictDoUpdate.mockResolvedValue(undefined);
});

describe("every category route", () => {
  it("answers 401 when signed out", async () => {
    mockGetUserId.mockRejectedValue(AUTH_ERROR);
    const responses = await Promise.all([
      getCategories(),
      getUncategorized(),
      getSimilar(new NextRequest("http://localhost"), params("1")),
      putCategory(put({ ...GROCERIES, applyToSimilar: true }), params("1")),
      resetCategory(new NextRequest("http://localhost"), params("1")),
      getMemories(),
      deleteMemory(new NextRequest("http://localhost"), params("1")),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
  });
});

describe("GET /api/categories", () => {
  it("lists the pairs in the rows and memories plus the fixed pairs", async () => {
    mockLoad.mockResolvedValue({
      rows: ROWS,
      memories: [{ id: 1, matchKey: "x club", category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_KIDS" }],
    });
    const body = await (await getCategories()).json();
    const keys = body.options.map((o: { categoryDetailed: string }) => o.categoryDetailed);
    expect(keys).toContain("ENTERTAINMENT_TV_AND_MOVIES");
    expect(keys).toContain("CUSTOM_SPENDING_KIDS");
    expect(keys).toContain("INCOME_SALARY");
  });
});

describe("GET /api/analytics/uncategorized", () => {
  it("groups posted uncategorized rows and totals both directions", async () => {
    const body = await (await getUncategorized()).json();
    expect(body.groups.map((g: { key: string }) => g.key)).toEqual(["acme payroll ppd", "venmo payment web", "monkey grind seattle"]);
    expect(body.groups[2]).toMatchObject({ count: 3, total: "16.50", id: 3 });
    expect(body).toMatchObject({ count: 5, outflow: "56.50", inflow: "2000.00" });
  });
});

describe("GET /api/transactions/:id/similar", () => {
  it("counts the other transactions a memory would decide, with samples", async () => {
    const body = await (await getSimilar(new NextRequest("http://localhost"), params("1"))).json();
    expect(body).toMatchObject({
      key: "monkey grind seattle",
      label: "MONKEY GRIND SEATTLE WA 1",
      similarCount: 3,
      defaultApply: true,
      hasOwnChoice: false,
      hasMemory: false,
      pending: false,
    });
    expect(body.samples.map((s: { id: number }) => s.id)).toEqual([4, 3, 2]);
  });

  it("starts unticked for a payment app", async () => {
    const body = await (await getSimilar(new NextRequest("http://localhost"), params("5"))).json();
    expect(body).toMatchObject({ key: "venmo payment web", defaultApply: false, similarCount: 0 });
  });

  it("answers 404 for a transaction that is not the user's or not a number", async () => {
    expect((await getSimilar(new NextRequest("http://localhost"), params("999"))).status).toBe(404);
    expect((await getSimilar(new NextRequest("http://localhost"), params("abc"))).status).toBe(404);
  });
});

describe("PUT /api/transactions/:id/category", () => {
  it("rejects a malformed body", async () => {
    const bad = [
      "{not json",
      { category: "food", categoryDetailed: "FOOD", applyToSimilar: true },
      { category: "UNCATEGORIZED", categoryDetailed: "UNCATEGORIZED", applyToSimilar: true },
      { category: "CUSTOM_INCOME", categoryDetailed: "CUSTOM_SPENDING_X", applyToSimilar: true },
      { ...GROCERIES, applyToSimilar: "yes" },
    ];
    for (const body of bad) {
      expect((await putCategory(put(body), params("1"))).status).toBe(400);
    }
    expect(tx.insertValues).not.toHaveBeenCalled();
    expect(tx.updateSet).not.toHaveBeenCalled();
  });

  it("remembers the pair for similar transactions and clears the row's own choice", async () => {
    const response = await putCategory(put({ ...GROCERIES, applyToSimilar: true }), params("2"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, matchKey: "monkey grind seattle" });
    expect(tx.inserted).toEqual([categoryMemories]);
    expect(tx.insertValues).toHaveBeenCalledWith({ userId: "user-123", matchKey: "monkey grind seattle", ...GROCERIES });
    expect(tx.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining(GROCERIES) })
    );
    expect(tx.updatedTables).toEqual([transactions]);
    expect(tx.updateSet).toHaveBeenCalledWith({ userCategory: null, userCategoryDetailed: null });
  });

  it("sets the pair on one transaction only when not applying to similar", async () => {
    const response = await putCategory(put({ ...GROCERIES, applyToSimilar: false }), params("2"));
    expect(response.status).toBe(200);
    expect(tx.insertValues).not.toHaveBeenCalled();
    expect(tx.updateSet).toHaveBeenCalledWith({
      userCategory: "FOOD_AND_DRINK",
      userCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
    });
  });

  it("refuses a one-off choice on a pending transaction but accepts a memory", async () => {
    expect((await putCategory(put({ ...GROCERIES, applyToSimilar: false }), params("4"))).status).toBe(400);
    expect((await putCategory(put({ ...GROCERIES, applyToSimilar: true }), params("4"))).status).toBe(200);
  });

  it("refuses to remember a transaction that cannot be matched", async () => {
    mockLoad.mockResolvedValue({ rows: [row(9, "BP 1234")], memories: [] });
    const response = await putCategory(put({ ...GROCERIES, applyToSimilar: true }), params("9"));
    expect(response.status).toBe(400);
    expect(tx.insertValues).not.toHaveBeenCalled();
  });

  it("answers 404 for a transaction that is not the user's", async () => {
    expect((await putCategory(put({ ...GROCERIES, applyToSimilar: true }), params("999"))).status).toBe(404);
  });
});

describe("DELETE /api/transactions/:id/category", () => {
  it("clears the transaction's own choice", async () => {
    const response = await resetCategory(new NextRequest("http://localhost"), params("2"));
    expect(response.status).toBe(200);
    expect(tx.updateSet).toHaveBeenCalledWith({ userCategory: null, userCategoryDetailed: null });
  });

  it("answers 404 when no row of the user's matched", async () => {
    tx.returning.mockResolvedValue([]);
    expect((await resetCategory(new NextRequest("http://localhost"), params("999"))).status).toBe(404);
  });
});

describe("category memories", () => {
  it("lists each memory with the transactions it decides", async () => {
    mockLoad.mockResolvedValue({
      rows: ROWS,
      memories: [
        { id: 11, matchKey: "monkey grind seattle", ...GROCERIES },
        { id: 12, matchKey: "gone merchant", ...GROCERIES },
      ],
    });
    const body = await (await getMemories()).json();
    expect(body.memories).toEqual([
      expect.objectContaining({ id: 12, label: "gone merchant", matchCount: 0 }),
      expect.objectContaining({ id: 11, label: "MONKEY GRIND SEATTLE WA 4", matchCount: 4 }),
    ]);
  });

  it("deletes one of the user's memories and answers 404 for anyone else's", async () => {
    expect((await deleteMemory(new NextRequest("http://localhost"), params("11"))).status).toBe(200);
    tx.returning.mockResolvedValue([]);
    expect((await deleteMemory(new NextRequest("http://localhost"), params("77"))).status).toBe(404);
  });
});
