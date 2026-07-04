import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockItemPublicTokenExchange,
  mockAccountsGet,
  mockLinkTokenCreate,
  mockGetUserId,
  mockInsert,
  mockSelect,
  mockUpdate,
  mockSyncTransactions,
  mockSyncHoldings,
} = vi.hoisted(() => ({
  mockItemPublicTokenExchange: vi.fn(),
  mockAccountsGet: vi.fn(),
  mockLinkTokenCreate: vi.fn(),
  mockGetUserId: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockSyncTransactions: vi.fn(),
  mockSyncHoldings: vi.fn(),
}));

vi.mock("@/lib/plaid", () => ({
  plaidClient: {
    itemPublicTokenExchange: mockItemPublicTokenExchange,
    accountsGet: mockAccountsGet,
    linkTokenCreate: mockLinkTokenCreate,
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(() => "encrypted"),
  decrypt: vi.fn(() => "decrypted-access-token"),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

// Both routes now run their DB work inside withUser(userId, tx => ...). The
// fake tx exposes the same insert/select/update mocks the tests control.
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ insert: mockInsert, select: mockSelect, update: mockUpdate })
  ),
}));

vi.mock("@/lib/sync-transactions", () => ({
  syncTransactions: mockSyncTransactions,
}));
vi.mock("@/lib/sync-holdings", () => ({ syncHoldings: mockSyncHoldings }));

import { NextRequest } from "next/server";
import { POST as exchangePost } from "@/app/api/plaid/exchange-token/route";
import { POST as updateLinkPost } from "@/app/api/plaid/create-update-link-token/route";

function makePost(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXCHANGE_URL = "http://localhost:3000/api/plaid/exchange-token";
const UPDATE_URL = "http://localhost:3000/api/plaid/create-update-link-token";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  mockItemPublicTokenExchange.mockResolvedValue({
    data: { access_token: "at", item_id: "item-1" },
  });
  mockAccountsGet.mockResolvedValue({ data: { accounts: [] } });
  mockLinkTokenCreate.mockResolvedValue({ data: { link_token: "lt" } });
  // exchange insert returning a plaid item
  mockInsert.mockReturnValue({
    values: vi.fn(() => ({ returning: vi.fn(() => [{ id: 1 }]) })),
  });
  // exchange updates the item's transactions cursor after the initial sync
  mockUpdate.mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  });
  mockSyncTransactions.mockResolvedValue({
    added: 0,
    modified: 0,
    removed: 0,
    nextCursor: "cursor-1",
  });
  mockSyncHoldings.mockResolvedValue({ count: 0 });
});

describe("exchange-token validation (M3)", () => {
  it("returns 400 when institution is missing", async () => {
    const res = await exchangePost(makePost(EXCHANGE_URL, { public_token: "tok" }));
    expect(res.status).toBe(400);
    expect(mockItemPublicTokenExchange).not.toHaveBeenCalled();
  });

  it("returns 400 when institution.name exceeds 200 chars", async () => {
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "ins_1", name: "a".repeat(201) },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when institution.institution_id exceeds 100 chars", async () => {
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "a".repeat(101), name: "Bank" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when public_token is not a non-empty string", async () => {
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "",
        institution: { institution_id: "ins_1", name: "Bank" },
      })
    );
    expect(res.status).toBe(400);
    expect(mockItemPublicTokenExchange).not.toHaveBeenCalled();
  });

  it("accepts valid input", async () => {
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "ins_1", name: "Bank" },
      })
    );
    expect(res.status).toBe(200);
    expect(mockItemPublicTokenExchange).toHaveBeenCalled();
  });

  it("kicks off an initial transactions sync on a successful link", async () => {
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "ins_1", name: "Bank" },
      })
    );
    expect(res.status).toBe(200);
    expect(mockSyncTransactions).toHaveBeenCalled();
  });

  it("still returns 200 when the initial sync fails (best-effort)", async () => {
    // A Plaid sync that errors right after link (e.g. PRODUCT_NOT_READY) must
    // never undo the link — the item is already saved and backfills on refresh.
    mockSyncTransactions.mockRejectedValueOnce(new Error("PRODUCT_NOT_READY"));
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "ins_1", name: "Bank" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("syncs holdings when an investment account is linked", async () => {
    mockAccountsGet.mockResolvedValueOnce({
      data: {
        accounts: [
          {
            account_id: "inv1",
            name: "Brokerage",
            type: "investment",
            balances: {
              current: 100,
              available: 0,
              limit: null,
              iso_currency_code: "USD",
            },
          },
        ],
      },
    });
    const res = await exchangePost(
      makePost(EXCHANGE_URL, {
        public_token: "tok",
        institution: { institution_id: "ins_1", name: "Bank" },
      })
    );
    expect(res.status).toBe(200);
    expect(mockSyncHoldings).toHaveBeenCalled();
  });
});

describe("create-update-link-token itemId validation (M3)", () => {
  it("returns 400 when itemId is missing", async () => {
    const res = await updateLinkPost(makePost(UPDATE_URL, {}));
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 400 when itemId is a string", async () => {
    const res = await updateLinkPost(makePost(UPDATE_URL, { itemId: "1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when itemId is 1.5", async () => {
    const res = await updateLinkPost(makePost(UPDATE_URL, { itemId: 1.5 }));
    expect(res.status).toBe(400);
  });

  it("proceeds past validation for a valid integer itemId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          { id: 1, accessTokenEncrypted: "enc", userId: "user-123" },
        ]),
      })),
    });
    const res = await updateLinkPost(makePost(UPDATE_URL, { itemId: 1 }));
    expect(res.status).toBe(200);
    expect(mockSelect).toHaveBeenCalled();
  });
});
