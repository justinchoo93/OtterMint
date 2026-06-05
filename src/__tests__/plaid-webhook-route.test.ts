import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVerify,
  mockExecute,
  mockTxSelect,
  mockTxUpdate,
  mockDecrypt,
  mockSyncTransactions,
  mockSyncHoldings,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockExecute: vi.fn(),
  mockTxSelect: vi.fn(),
  mockTxUpdate: vi.fn(),
  mockDecrypt: vi.fn(),
  mockSyncTransactions: vi.fn(),
  mockSyncHoldings: vi.fn(),
}));

vi.mock("@/lib/plaid-webhook", () => ({
  verifyPlaidWebhook: mockVerify,
}));

// The route resolves the owner via db.execute(resolve_item_owner) then does its
// reads/writes inside withUser(ownerId, tx => ...).
vi.mock("@/lib/db", () => ({
  db: { execute: mockExecute },
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ select: mockTxSelect, update: mockTxUpdate })
  ),
}));

vi.mock("@/lib/db/schema", () => ({
  plaidItems: { id: "id", itemId: "item_id" },
  accounts: { plaidItemId: "plaid_item_id" },
}));

vi.mock("@/lib/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("@/lib/sync-transactions", () => ({
  syncTransactions: mockSyncTransactions,
}));
vi.mock("@/lib/sync-holdings", () => ({ syncHoldings: mockSyncHoldings }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/plaid/webhook/route";

function makeRequest(body: string, header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("Plaid-Verification", header);
  return new Request("http://localhost/api/plaid/webhook", {
    method: "POST",
    headers,
    body,
  });
}

// resolve_item_owner returns one { user_id } row.
function ownerResolves(userId: string | null) {
  mockExecute.mockResolvedValue([{ user_id: userId }]);
}

// tx.select().from(...).where(...) resolves to the given rows.
function selectReturns(rows: unknown[]) {
  mockTxSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe("POST /api/plaid/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    mockDecrypt.mockReturnValue("decrypted-access-token");
  });

  it("returns 401 and does no db work when header is missing", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", item_id: "i1" });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 and does no db work when verification fails", async () => {
    mockVerify.mockResolvedValue(false);
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", item_id: "i1" });
    const res = await POST(makeRequest(body, "bad-jwt"));
    expect(res.status).toBe(401);
    expect(mockVerify).toHaveBeenCalledWith(body, "bad-jwt");
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 and dispatches SYNC_UPDATES_AVAILABLE to syncTransactions", async () => {
    mockVerify.mockResolvedValue(true);
    ownerResolves("44444444-4444-4444-4444-444444444444");
    selectReturns([
      {
        id: 7,
        userId: "44444444-4444-4444-4444-444444444444",
        itemId: "i1",
        accessTokenEncrypted: "enc",
        transactionsCursor: "cur",
      },
    ]);
    mockSyncTransactions.mockResolvedValue({ nextCursor: "cur2" });

    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "i1",
    });
    const res = await POST(makeRequest(body, "good-jwt"));

    expect(res.status).toBe(200);
    expect(mockDecrypt).toHaveBeenCalledWith("enc");
    expect(mockSyncTransactions).toHaveBeenCalledWith(
      "decrypted-access-token",
      "cur",
      "44444444-4444-4444-4444-444444444444",
      expect.anything()
    );
    expect(mockTxUpdate).toHaveBeenCalled();
  });

  it("returns 200 (no dispatch) when the item owner is not found", async () => {
    mockVerify.mockResolvedValue(true);
    ownerResolves(null);
    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "missing",
    });
    const res = await POST(makeRequest(body, "good-jwt"));
    expect(res.status).toBe(200);
    expect(mockSyncTransactions).not.toHaveBeenCalled();
  });
});
