import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetUserId,
  mockVerifyPassword,
  mockSelect,
  mockDelete,
  mockItemRemove,
} = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockItemRemove: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock("@/lib/plaid", () => ({
  plaidClient: { itemRemove: mockItemRemove },
}));

// crypto decrypt returns the stored TOTP secret base32
let totpSecretBase32 = "";
vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => totpSecretBase32),
}));

// The route now runs its reads/delete inside withUser(userId, tx => ...). The
// fake tx exposes the same select/delete chain the test controls.
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ select: mockSelect, delete: mockDelete })
  ),
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/auth/delete-account/route";

function makeDelete(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/delete-account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The route calls tx.select({projection}).from(users) for the user row, then
// tx.select().from(plaidItems) (no projection) for the items. Key the returned
// rows off whether a projection argument was passed to select().
function setupUser(opts: { mfaEnabled: boolean; totpSecret?: string }) {
  mockSelect.mockImplementation((projection?: unknown) => {
    const userRow = {
      passwordHash: "hash",
      mfaEnabled: opts.mfaEnabled,
      totpSecret: opts.totpSecret ?? null,
    };
    const rows = projection ? [userRow] : []; // plaidItems select has no projection
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => rows),
      })),
    };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  mockDelete.mockReturnValue({ where: vi.fn(() => Promise.resolve()) });
});

describe("delete-account re-authentication (M6)", () => {
  it("returns 400 when no password is supplied", async () => {
    const res = await DELETE(makeDelete({}));
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 401 when the password is wrong", async () => {
    setupUser({ mfaEnabled: false });
    mockVerifyPassword.mockResolvedValue(false);
    const res = await DELETE(makeDelete({ password: "wrong" }));
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 403 when password is correct, MFA enabled, but no code", async () => {
    setupUser({ mfaEnabled: true, totpSecret: "enc" });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await DELETE(makeDelete({ password: "right" }));
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 401 when password is correct, MFA enabled, code wrong", async () => {
    const { Secret } = await import("otpauth");
    totpSecretBase32 = new Secret({ size: 20 }).base32;
    setupUser({ mfaEnabled: true, totpSecret: "enc" });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await DELETE(makeDelete({ password: "right", code: "000000" }));
    // 000000 is astronomically unlikely to be the live code
    expect([401]).toContain(res.status);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 200 and deletes when MFA off and password correct", async () => {
    setupUser({ mfaEnabled: false });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await DELETE(makeDelete({ password: "right" }));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 200 and deletes when MFA on with a valid code", async () => {
    const { TOTP, Secret } = await import("otpauth");
    const secret = new Secret({ size: 20 });
    totpSecretBase32 = secret.base32;
    const totp = new TOTP({ issuer: "OtterMint", secret });
    const code = totp.generate();

    setupUser({ mfaEnabled: true, totpSecret: "enc" });
    mockVerifyPassword.mockResolvedValue(true);
    const res = await DELETE(makeDelete({ password: "right", code }));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
