import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Holding, Security } from "plaid";

const { mockHoldingsGet, mockDbInsert, mockDbDelete, mockDbSelect } =
  vi.hoisted(() => {
    return {
      mockHoldingsGet: vi.fn(),
      mockDbInsert: vi.fn().mockReturnValue({
        values: vi.fn(),
      }),
      mockDbDelete: vi.fn().mockReturnValue({
        where: vi.fn(),
      }),
      mockDbSelect: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
  });

vi.mock("@/lib/plaid", () => ({
  plaidClient: { investmentsHoldingsGet: mockHoldingsGet },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockDbInsert,
    delete: mockDbDelete,
    select: mockDbSelect,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  holdings: { accountId: "account_id" },
  accounts: { plaidItemId: "plaid_item_id", type: "type" },
}));

import { syncHoldings } from "@/lib/sync-holdings";
import { db } from "@/lib/db";

const USER_ID = "22222222-2222-2222-2222-222222222222";
// The function now takes an explicit executor; the tests pass the mocked db.
const exec = db as unknown as Parameters<typeof syncHoldings>[3];

function makeSecurity(overrides: Partial<Security> = {}): Security {
  return {
    security_id: "sec_001",
    name: "Apple Inc",
    ticker_symbol: "AAPL",
    iso_currency_code: "USD",
    ...overrides,
  } as Security;
}

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    account_id: "acc_001",
    security_id: "sec_001",
    quantity: 10,
    institution_price: 150.25,
    institution_value: 1502.5,
    cost_basis: 1200,
    iso_currency_code: "USD",
    ...overrides,
  } as Holding;
}

describe("syncHoldings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockReturnValue({
      values: vi.fn(),
    });
    mockDbDelete.mockReturnValue({
      where: vi.fn(),
    });
  });

  it("calls investmentsHoldingsGet with the access token", async () => {
    mockHoldingsGet.mockResolvedValueOnce({
      data: {
        holdings: [],
        securities: [],
        accounts: [],
      },
    });

    await syncHoldings("access-token-123", [], USER_ID, exec);

    expect(mockHoldingsGet).toHaveBeenCalledWith({
      access_token: "access-token-123",
    });
  });

  it("deletes existing holdings for investment accounts before inserting", async () => {
    mockHoldingsGet.mockResolvedValueOnce({
      data: {
        holdings: [makeHolding()],
        securities: [makeSecurity()],
        accounts: [],
      },
    });

    await syncHoldings("token", ["acc_001"], USER_ID, exec);

    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("inserts holdings with security name and ticker mapped", async () => {
    const security = makeSecurity({
      security_id: "sec_abc",
      name: "Tesla Inc",
      ticker_symbol: "TSLA",
    });
    const holding = makeHolding({
      security_id: "sec_abc",
      quantity: 5,
      institution_price: 200,
      institution_value: 1000,
      cost_basis: 800,
    });

    mockHoldingsGet.mockResolvedValueOnce({
      data: {
        holdings: [holding],
        securities: [security],
        accounts: [],
      },
    });

    await syncHoldings("token", ["acc_001"], USER_ID, exec);

    expect(mockDbInsert).toHaveBeenCalled();
    const insertValues = mockDbInsert.mock.results[0].value.values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        name: "Tesla Inc",
        tickerSymbol: "TSLA",
        securityId: "sec_abc",
        quantity: "5",
        price: "200",
        value: "1000",
        costBasis: "800",
      })
    );
  });

  it("returns the count of holdings synced", async () => {
    mockHoldingsGet.mockResolvedValueOnce({
      data: {
        holdings: [
          makeHolding({ security_id: "sec_1" }),
          makeHolding({ security_id: "sec_2", account_id: "acc_001" }),
        ],
        securities: [
          makeSecurity({ security_id: "sec_1" }),
          makeSecurity({ security_id: "sec_2", name: "Google", ticker_symbol: "GOOGL" }),
        ],
        accounts: [],
      },
    });

    const result = await syncHoldings("token", ["acc_001"], USER_ID, exec);

    expect(result.count).toBe(2);
  });

  it("handles holdings with no matching security gracefully", async () => {
    const holding = makeHolding({ security_id: "sec_unknown" });

    mockHoldingsGet.mockResolvedValueOnce({
      data: {
        holdings: [holding],
        securities: [],
        accounts: [],
      },
    });

    const result = await syncHoldings("token", ["acc_001"], USER_ID, exec);

    expect(result.count).toBe(1);
    const insertValues = mockDbInsert.mock.results[0].value.values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Unknown Security",
        tickerSymbol: null,
      })
    );
  });
});
