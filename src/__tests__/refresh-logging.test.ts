import { describe, it, expect, vi, beforeEach } from "vitest";

// Logging-hygiene regression test for the account-refresh route.
//
// The route stores the verbatim Plaid `error_message` in the database (so the
// re-auth UI can show it to the owning user) but must NEVER pass it to
// logServerError, where it could leak third-party detail into server logs.
// We drive the real POST handler through a simulated Plaid failure and assert
// that the logger only ever sees the short machine `errorCode`.

const PLAID_SECRET_MESSAGE =
  "the requested account is not available; contact First National Bank of Secrets";
const PLAID_ERROR_CODE = "ITEM_LOGIN_REQUIRED";

const {
  mockGetUserId,
  mockEnforceRateLimit,
  mockDbSelect,
  mockDbUpdate,
  mockDecrypt,
  mockAccountsGet,
  mockComputeSnapshot,
  mockSaveUserSnapshot,
  mockSaveGroupSnapshot,
  mockLogServerError,
} = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDecrypt: vi.fn(),
  mockAccountsGet: vi.fn(),
  mockComputeSnapshot: vi.fn(),
  mockSaveUserSnapshot: vi.fn(),
  mockSaveGroupSnapshot: vi.fn(),
  mockLogServerError: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));
vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect, update: mockDbUpdate },
}));
// The route now runs its DB work inside withUser(userId, tx => ...). The fake
// tx exposes the same select/update mocks the test controls.
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ select: mockDbSelect, update: mockDbUpdate })
  ),
}));
vi.mock("@/lib/db/schema", () => ({
  accounts: { plaidItemId: "plaid_item_id", accountId: "account_id" },
  plaidItems: { id: "id", userId: "user_id" },
  manualAccounts: { userId: "user_id" },
  groupMembers: { groupId: "group_id", userId: "user_id" },
}));
vi.mock("@/lib/plaid", () => ({
  plaidClient: { accountsGet: mockAccountsGet },
}));
vi.mock("@/lib/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("@/lib/sync-transactions", () => ({ syncTransactions: vi.fn() }));
vi.mock("@/lib/sync-holdings", () => ({ syncHoldings: vi.fn() }));
vi.mock("@/lib/compute-snapshot", () => ({
  computeSnapshot: mockComputeSnapshot,
  saveUserSnapshot: mockSaveUserSnapshot,
  saveGroupSnapshot: mockSaveGroupSnapshot,
}));
vi.mock("@/lib/logging", () => ({ logServerError: mockLogServerError }));

import { POST } from "@/app/api/accounts/refresh/route";

// db.select().from(...).where(...) resolves to a queue of result sets in order.
function queueSelects(resultSets: unknown[][]) {
  let i = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const rows = resultSets[i] ?? [];
        i += 1;
        return Promise.resolve(rows);
      }),
    }),
  }));
}

describe("POST /api/accounts/refresh logging hygiene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserId.mockResolvedValue("11111111-1111-1111-1111-111111111111");
    mockEnforceRateLimit.mockResolvedValue(null);
    mockDecrypt.mockReturnValue("access-token");
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    mockComputeSnapshot.mockReturnValue({});
    mockSaveUserSnapshot.mockResolvedValue(undefined);
  });

  it("logs only the Plaid errorCode, never the verbatim error_message", async () => {
    // 1st select: user's plaid items. 2nd select: that item's accounts (stale).
    // Remaining selects (post-loop snapshot work): empty.
    queueSelects([
      [
        {
          id: 5,
          userId: "11111111-1111-1111-1111-111111111111",
          accessTokenEncrypted: "enc",
          transactionsCursor: "cur",
          institutionName: "First National Bank of Secrets",
        },
      ],
      [{ accountId: "a1", type: "depository", lastRefreshedAt: null }],
    ]);

    // Simulate a Plaid-shaped failure carrying a sensitive human-readable
    // message that must not reach the logs.
    mockAccountsGet.mockRejectedValue({
      response: {
        data: {
          error_code: PLAID_ERROR_CODE,
          error_message: PLAID_SECRET_MESSAGE,
        },
      },
    });

    const res = await POST();
    expect(res.status).toBe(200);

    // The DB write still stores the full message (re-auth UI needs it).
    expect(mockDbUpdate).toHaveBeenCalled();

    // The logger was called for the Plaid error...
    expect(mockLogServerError).toHaveBeenCalled();
    const loggedContexts = mockLogServerError.mock.calls.map(
      (call) => String(call[0])
    );

    // ...with the short errorCode...
    expect(
      loggedContexts.some((c) => c.includes(PLAID_ERROR_CODE))
    ).toBe(true);

    // ...and NEVER with the verbatim error_message.
    for (const context of loggedContexts) {
      expect(context).not.toContain(PLAID_SECRET_MESSAGE);
    }
  });
});
