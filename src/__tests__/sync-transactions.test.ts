import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RemovedTransaction, Transaction } from "plaid";

// vi.mock factories are hoisted - can't reference external variables
// Use vi.hoisted() to declare mocks that the factory can reference
const { mockTransactionsSync, mockDbInsert, mockDbDelete, mockDbUpdate } =
  vi.hoisted(() => {
    const mockDbInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn() }),
        onConflictDoNothing: vi.fn(),
      }),
    });
    const mockDbDelete = vi.fn().mockReturnValue({
      where: vi.fn(),
    });
    const mockDbUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });
    return {
      mockTransactionsSync: vi.fn(),
      mockDbInsert,
      mockDbDelete,
      mockDbUpdate,
    };
  });

vi.mock("@/lib/plaid", () => ({
  plaidClient: { transactionsSync: mockTransactionsSync },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockDbInsert,
    delete: mockDbDelete,
    update: mockDbUpdate,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  transactions: { transactionId: "transaction_id" },
  plaidItems: { id: "id" },
}));

import { syncTransactions } from "@/lib/sync-transactions";
import { db } from "@/lib/db";

const USER_ID = "11111111-1111-1111-1111-111111111111";
// The function now takes an explicit executor; the tests pass the mocked db.
const exec = db as unknown as Parameters<typeof syncTransactions>[3];

function makePlaidTransaction(
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    transaction_id: "txn_001",
    account_id: "acc_001",
    amount: 12.5,
    date: "2024-01-15",
    name: "Coffee Shop",
    merchant_name: "Starbucks",
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
      confidence_level: "VERY_HIGH",
    },
    pending: false,
    iso_currency_code: "USD",
    ...overrides,
  } as Transaction;
}

describe("syncTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chained mock return values after clearing
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn() }),
        onConflictDoNothing: vi.fn(),
      }),
    });
    mockDbDelete.mockReturnValue({ where: vi.fn() });
  });

  it("calls transactionsSync with access token and cursor", async () => {
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor_abc",
      },
    });

    const result = await syncTransactions(
      "access-token-123",
      "old_cursor",
      USER_ID,
      exec
    );

    expect(mockTransactionsSync).toHaveBeenCalledWith({
      access_token: "access-token-123",
      cursor: "old_cursor",
    });
    expect(result.nextCursor).toBe("cursor_abc");
  });

  it("inserts added transactions into the database", async () => {
    const txn = makePlaidTransaction();
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [txn],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: "cursor_new",
      },
    });

    await syncTransactions("token", null, USER_ID, exec);

    expect(mockDbInsert).toHaveBeenCalled();
    const insertValues = mockDbInsert.mock.results[0].value.values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
  });

  it("deletes removed transactions from the database", async () => {
    const removed: RemovedTransaction = {
      transaction_id: "txn_removed",
    } as RemovedTransaction;
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [removed],
        has_more: false,
        next_cursor: "cursor_new",
      },
    });

    await syncTransactions("token", null, USER_ID, exec);

    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("pages through when has_more is true", async () => {
    mockTransactionsSync
      .mockResolvedValueOnce({
        data: {
          added: [makePlaidTransaction({ transaction_id: "txn_1" })],
          modified: [],
          removed: [],
          has_more: true,
          next_cursor: "cursor_page2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          added: [makePlaidTransaction({ transaction_id: "txn_2" })],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_final",
        },
      });

    const result = await syncTransactions("token", null, USER_ID, exec);

    expect(mockTransactionsSync).toHaveBeenCalledTimes(2);
    expect(result.nextCursor).toBe("cursor_final");
    expect(result.added).toBe(2);
  });

  it("returns counts of added, modified, and removed", async () => {
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [
          makePlaidTransaction({ transaction_id: "txn_1" }),
          makePlaidTransaction({ transaction_id: "txn_2" }),
        ],
        modified: [makePlaidTransaction({ transaction_id: "txn_3" })],
        removed: [{ transaction_id: "txn_4" } as RemovedTransaction],
        has_more: false,
        next_cursor: "cursor_done",
      },
    });

    const result = await syncTransactions("token", null, USER_ID, exec);

    expect(result.added).toBe(2);
    expect(result.modified).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.nextCursor).toBe("cursor_done");
  });

  describe("EXCLUDED_MERCHANT_KEYWORDS filtering", () => {
    afterEach(() => {
      delete process.env.EXCLUDED_MERCHANT_KEYWORDS;
    });

    it("does not insert added transactions matching an exclusion keyword", async () => {
      process.env.EXCLUDED_MERCHANT_KEYWORDS = "acme clinic";
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [
            makePlaidTransaction({
              transaction_id: "txn_secret",
              name: "ACME CLINIC LLC",
              merchant_name: null,
            }),
            makePlaidTransaction({ transaction_id: "txn_ok" }),
          ],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_done",
        },
      });

      const result = await syncTransactions("token", null, USER_ID, exec);

      // Only the non-matching transaction is inserted and counted.
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
      expect(result.added).toBe(1);
    });

    it("matches against merchant_name as well as name", async () => {
      process.env.EXCLUDED_MERCHANT_KEYWORDS = "starbucks";
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [makePlaidTransaction()], // name "Coffee Shop", merchant "Starbucks"
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor_done",
        },
      });

      const result = await syncTransactions("token", null, USER_ID, exec);

      expect(mockDbInsert).not.toHaveBeenCalled();
      expect(result.added).toBe(0);
    });

    it("deletes a modified transaction that now matches a keyword", async () => {
      process.env.EXCLUDED_MERCHANT_KEYWORDS = "acme clinic";
      mockTransactionsSync.mockResolvedValueOnce({
        data: {
          added: [],
          modified: [
            makePlaidTransaction({
              transaction_id: "txn_now_secret",
              merchant_name: "Acme Clinic",
            }),
          ],
          removed: [],
          has_more: false,
          next_cursor: "cursor_done",
        },
      });

      const result = await syncTransactions("token", null, USER_ID, exec);

      expect(mockDbDelete).toHaveBeenCalled();
      expect(result.modified).toBe(0);
    });
  });
});
