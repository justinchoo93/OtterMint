import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockVerify,
  mockDbSelect,
  mockDbUpdate,
  mockDecrypt,
  mockSyncTransactions,
  mockSyncHoldings,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDecrypt: vi.fn(),
  mockSyncTransactions: vi.fn(),
  mockSyncHoldings: vi.fn(),
}));

vi.mock("@/lib/plaid-webhook", () => ({
  verifyPlaidWebhook: mockVerify,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
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

// db.select().from(...).where(...) resolves to the given rows.
function selectReturns(rows: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe("POST /api/plaid/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    mockDecrypt.mockReturnValue("decrypted-access-token");
  });

  it("returns 401 and does no db work when header is missing", async () => {
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", item_id: "i1" });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 and does no db work when verification fails", async () => {
    mockVerify.mockResolvedValue(false);
    const body = JSON.stringify({ webhook_type: "TRANSACTIONS", item_id: "i1" });
    const res = await POST(makeRequest(body, "bad-jwt"));
    expect(res.status).toBe(401);
    expect(mockVerify).toHaveBeenCalledWith(body, "bad-jwt");
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 and dispatches SYNC_UPDATES_AVAILABLE to syncTransactions", async () => {
    mockVerify.mockResolvedValue(true);
    selectReturns([
      {
        id: 7,
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
      "cur"
    );
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("returns 200 (no dispatch) when the item is not found", async () => {
    mockVerify.mockResolvedValue(true);
    selectReturns([]);
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
