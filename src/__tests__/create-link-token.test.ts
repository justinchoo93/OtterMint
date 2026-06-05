import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLinkTokenCreate, mockGetUserId } = vi.hoisted(() => ({
  mockLinkTokenCreate: vi.fn(),
  mockGetUserId: vi.fn(),
}));

vi.mock("@/lib/plaid", () => ({
  plaidClient: { linkTokenCreate: mockLinkTokenCreate },
}));
vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

import { POST } from "@/app/api/plaid/create-link-token/route";

describe("create-link-token route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserId.mockResolvedValue("user-123");
    mockLinkTokenCreate.mockResolvedValue({ data: { link_token: "lt-1" } });
  });
  afterEach(() => {
    delete process.env.PLAID_REDIRECT_URI;
    delete process.env.PLAID_WEBHOOK_URL;
  });

  it("includes redirect_uri and webhook when env vars are set", async () => {
    process.env.PLAID_REDIRECT_URI = "https://app.example.com/oauth";
    process.env.PLAID_WEBHOOK_URL = "https://app.example.com/api/plaid/webhook";
    await POST();
    expect(mockLinkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect_uri: "https://app.example.com/oauth",
        webhook: "https://app.example.com/api/plaid/webhook",
      })
    );
  });

  it("omits redirect_uri and webhook when env vars are unset", async () => {
    await POST();
    const arg = mockLinkTokenCreate.mock.calls[0][0];
    expect(arg.redirect_uri).toBeUndefined();
    expect(arg.webhook).toBeUndefined();
  });
});
