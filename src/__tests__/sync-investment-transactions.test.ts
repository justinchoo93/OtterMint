import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvestmentsTransactionsGet, mockInsert, mockSelect } = vi.hoisted(
  () => ({
    mockInvestmentsTransactionsGet: vi.fn(),
    mockInsert: vi.fn(),
    mockSelect: vi.fn(),
  })
);

vi.mock("@/lib/plaid", () => ({
  plaidClient: { investmentsTransactionsGet: mockInvestmentsTransactionsGet },
}));

vi.mock("@/lib/db/schema", () => ({
  investmentTransactions: {
    accountId: "account_id",
    date: "date",
    investmentTransactionId: "investment_transaction_id",
  },
}));

import { syncInvestmentTransactions } from "@/lib/sync-investment-transactions";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeExecutor(latestDate: string | null) {
  mockSelect.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ maxDate: latestDate }]),
    })),
  });
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
  });
  return { select: mockSelect, insert: mockInsert } as unknown as Parameters<
    typeof syncInvestmentTransactions
  >[3];
}

function plaidTxn(overrides: Record<string, unknown> = {}) {
  return {
    investment_transaction_id: "itx_001",
    account_id: "acc_invest",
    security_id: "sec_pm",
    date: "2026-08-01",
    name: "PHILIP MORRIS DIV",
    amount: -46.8, // negative = cash credited (a dividend)
    type: "cash",
    subtype: "dividend",
    quantity: 0,
    price: 0,
    iso_currency_code: "USD",
    ...overrides,
  };
}

function page(transactions: unknown[], total: number) {
  return {
    data: { investment_transactions: transactions, total_investment_transactions: total },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncInvestmentTransactions", () => {
  it("returns immediately with no investment accounts", async () => {
    const result = await syncInvestmentTransactions(
      "token",
      [],
      USER_ID,
      makeExecutor(null)
    );
    expect(result.count).toBe(0);
    expect(mockInvestmentsTransactionsGet).not.toHaveBeenCalled();
  });

  it("requests a 24-month window on first sync and upserts rows", async () => {
    mockInvestmentsTransactionsGet.mockResolvedValueOnce(page([plaidTxn()], 1));
    const result = await syncInvestmentTransactions(
      "token",
      ["acc_invest"],
      USER_ID,
      makeExecutor(null)
    );

    expect(result.count).toBe(1);
    const call = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(call.options.account_ids).toEqual(["acc_invest"]);
    // ~24 months back:
    const start = new Date(call.start_date + "T00:00:00Z");
    const monthsBack =
      (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    expect(monthsBack).toBeGreaterThan(23);
    expect(monthsBack).toBeLessThan(25);

    const values = mockInsert.mock.results[0].value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        investmentTransactionId: "itx_001",
        amount: "-46.8",
        type: "cash",
        subtype: "dividend",
      })
    );
  });

  it("re-syncs from the last stored date minus seven days", async () => {
    mockInvestmentsTransactionsGet.mockResolvedValueOnce(page([], 0));
    await syncInvestmentTransactions(
      "token",
      ["acc_invest"],
      USER_ID,
      makeExecutor("2026-08-10")
    );
    const call = mockInvestmentsTransactionsGet.mock.calls[0][0];
    expect(call.start_date).toBe("2026-08-03");
  });

  it("pages through results using the reported total", async () => {
    mockInvestmentsTransactionsGet
      .mockResolvedValueOnce(
        page([plaidTxn(), plaidTxn({ investment_transaction_id: "itx_002" })], 3)
      )
      .mockResolvedValueOnce(
        page([plaidTxn({ investment_transaction_id: "itx_003" })], 3)
      );

    const result = await syncInvestmentTransactions(
      "token",
      ["acc_invest"],
      USER_ID,
      makeExecutor(null)
    );

    expect(result.count).toBe(3);
    expect(mockInvestmentsTransactionsGet).toHaveBeenCalledTimes(2);
    expect(mockInvestmentsTransactionsGet.mock.calls[1][0].options.offset).toBe(2);
  });

  it("stores null security and subtype safely", async () => {
    mockInvestmentsTransactionsGet.mockResolvedValueOnce(
      page(
        [plaidTxn({ security_id: null, subtype: null, quantity: null, price: null })],
        1
      )
    );
    await syncInvestmentTransactions(
      "token",
      ["acc_invest"],
      USER_ID,
      makeExecutor(null)
    );
    const values = mockInsert.mock.results[0].value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: null,
        subtype: null,
        quantity: null,
        price: null,
      })
    );
  });
});
