import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => {
  return {
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn(),
      }),
    }),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  accounts: { type: "type" },
  manualAccounts: { type: "type" },
  netWorthSnapshots: { date: "date" },
}));

import { computeSnapshot, type SnapshotData } from "@/lib/compute-snapshot";

describe("computeSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn(),
      }),
    });
  });

  it("computes totals from plaid accounts and manual accounts", () => {
    const plaidAccounts = [
      { type: "depository", currentBalance: "5000.00" },
      { type: "depository", currentBalance: "2000.00" },
      { type: "credit", currentBalance: "1500.00" },
      { type: "investment", currentBalance: "10000.00" },
    ];
    const manualAccounts = [
      { type: "asset", balance: "3000.00" },
      { type: "liability", balance: "500.00" },
    ];

    const result: SnapshotData = computeSnapshot(
      plaidAccounts as Parameters<typeof computeSnapshot>[0],
      manualAccounts as Parameters<typeof computeSnapshot>[1]
    );

    expect(result.totalAssets).toBe("20000.00");
    expect(result.totalLiabilities).toBe("2000.00");
    expect(result.netWorth).toBe("18000.00");
    expect(result.depositoryTotal).toBe("7000.00");
    expect(result.creditTotal).toBe("1500.00");
    expect(result.investmentTotal).toBe("10000.00");
    expect(result.manualAssetsTotal).toBe("3000.00");
    expect(result.manualLiabilitiesTotal).toBe("500.00");
  });

  it("handles empty accounts", () => {
    const result = computeSnapshot([], []);

    expect(result.totalAssets).toBe("0.00");
    expect(result.totalLiabilities).toBe("0.00");
    expect(result.netWorth).toBe("0.00");
  });

  it("handles null balances gracefully", () => {
    const plaidAccounts = [
      { type: "depository", currentBalance: null },
      { type: "credit", currentBalance: "100.00" },
    ];

    const result = computeSnapshot(
      plaidAccounts as Parameters<typeof computeSnapshot>[0],
      []
    );

    expect(result.totalAssets).toBe("0.00");
    expect(result.totalLiabilities).toBe("100.00");
    expect(result.netWorth).toBe("-100.00");
  });

  it("includes loan accounts in liabilities", () => {
    const plaidAccounts = [
      { type: "loan", currentBalance: "25000.00" },
    ];

    const result = computeSnapshot(
      plaidAccounts as Parameters<typeof computeSnapshot>[0],
      []
    );

    expect(result.totalLiabilities).toBe("25000.00");
    expect(result.loanTotal).toBe("25000.00");
  });
});
