import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  accounts: { userId: "user_id" },
  holdings: { userId: "user_id" },
  accountBalanceSnapshots: { accountId: "account_id", date: "date" },
  holdingSnapshots: {
    accountId: "account_id",
    securityId: "security_id",
    date: "date",
  },
}));

import { captureAccountSnapshots } from "@/lib/capture-snapshots";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = new Date().toISOString().split("T")[0];

function makeExecutor(accountRows: unknown[], holdingRows: unknown[]) {
  let selectCall = 0;
  mockSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () =>
        selectCall++ === 0 ? accountRows : holdingRows
      ),
    })),
  }));
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn(),
    }),
  });
  return { select: mockSelect, insert: mockInsert } as unknown as Parameters<
    typeof captureAccountSnapshots
  >[1];
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc_checking",
    type: "depository",
    subtype: "checking",
    currentBalance: "1200.00",
    ...overrides,
  };
}

function holding(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc_invest",
    securityId: "sec_qqq",
    tickerSymbol: "QQQ",
    quantity: "10.00000000",
    price: "500.0000",
    value: "5000.00",
    costBasis: "4000.00",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureAccountSnapshots", () => {
  it("upserts one balance snapshot per account with today's date", async () => {
    const exec = makeExecutor(
      [account(), account({ accountId: "acc_credit", type: "credit", subtype: "credit card", currentBalance: "-350.00" })],
      []
    );
    await captureAccountSnapshots(USER_ID, exec);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    const firstValues = mockInsert.mock.results[0].value.values;
    expect(firstValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accountId: "acc_checking",
        date: TODAY,
        balance: "1200.00",
        type: "depository",
        subtype: "checking",
      })
    );
  });

  it("skips accounts with a null balance rather than storing zero", async () => {
    const exec = makeExecutor(
      [account({ currentBalance: null }), account({ accountId: "acc_b" })],
      []
    );
    await captureAccountSnapshots(USER_ID, exec);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.results[0].value.values).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc_b" })
    );
  });

  it("captures holding snapshots only for investment accounts", async () => {
    const exec = makeExecutor(
      [
        account(),
        account({ accountId: "acc_invest", type: "investment", subtype: "brokerage", currentBalance: "5000.00" }),
      ],
      [holding(), holding({ accountId: "acc_checking", securityId: "sec_odd" })]
    );
    await captureAccountSnapshots(USER_ID, exec);

    // 2 balance rows + 1 holding row (the non-investment-account holding is skipped)
    expect(mockInsert).toHaveBeenCalledTimes(3);
    const holdingValues = mockInsert.mock.results[2].value.values;
    expect(holdingValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accountId: "acc_invest",
        securityId: "sec_qqq",
        value: "5000.00",
        costBasis: "4000.00",
        date: TODAY,
      })
    );
  });

  it("does not query holdings when the user has no investment accounts", async () => {
    const exec = makeExecutor([account()], []);
    await captureAccountSnapshots(USER_ID, exec);
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("preserves a null cost basis on holding snapshots", async () => {
    const exec = makeExecutor(
      [account({ accountId: "acc_invest", type: "investment", currentBalance: "5000.00" })],
      [holding({ costBasis: null })]
    );
    await captureAccountSnapshots(USER_ID, exec);
    const holdingValues = mockInsert.mock.results[1].value.values;
    expect(holdingValues).toHaveBeenCalledWith(
      expect.objectContaining({ costBasis: null })
    );
  });
});
