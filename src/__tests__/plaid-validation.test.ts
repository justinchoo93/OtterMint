import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockItemPublicTokenExchange,
  mockAccountsBalanceGet,
  mockLinkTokenCreate,
  mockGetUserId,
  mockInsert,
  mockSelect,
} = vi.hoisted(() => ({
  mockItemPublicTokenExchange: vi.fn(),
  mockAccountsBalanceGet: vi.fn(),
  mockLinkTokenCreate: vi.fn(),
  mockGetUserId: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/plaid", () => ({
  plaidClient: {
    itemPublicTokenExchange: mockItemPublicTokenExchange,
    accountsBalanceGet: mockAccountsBalanceGet,
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
// fake tx exposes the same insert/select mocks the tests control.
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ insert: mockInsert, select: mockSelect })
  ),
}));

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
  mockAccountsBalanceGet.mockResolvedValue({ data: { accounts: [] } });
  mockLinkTokenCreate.mockResolvedValue({ data: { link_token: "lt" } });
  // exchange insert returning a plaid item
  mockInsert.mockReturnValue({
    values: vi.fn(() => ({ returning: vi.fn(() => [{ id: 1 }]) })),
  });
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
