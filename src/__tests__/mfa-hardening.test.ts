import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetUserId,
  mockSelect,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

// decrypt returns the live TOTP secret base32 set per test
let totpSecretBase32 = "";
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(() => "encrypted"),
  decrypt: vi.fn(() => totpSecretBase32),
}));

// setup / verify-setup / disable now run their DB work inside
// withUser(userId, tx => ...). The fake tx exposes the same select/update
// mocks the tests control.
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({ select: mockSelect, update: mockUpdate })
  ),
}));

import { NextRequest } from "next/server";
import { POST as setupPost } from "@/app/api/auth/mfa/setup/route";
import { POST as verifySetupPost } from "@/app/api/auth/mfa/verify-setup/route";
import { POST as disablePost } from "@/app/api/auth/mfa/disable/route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function makePost(url: string, body: unknown, withSessionCookie = true) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (withSessionCookie) headers.set("cookie", `session_id=${SESSION_ID}`);
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// Tracks every update().set() payload so we can assert reset / lockout
// persistence across the (possibly multiple) updates a handler performs.
let updateSets: Record<string, unknown>[] = [];
function findSet(key: string): Record<string, unknown> | undefined {
  return updateSets.find((s) => key in s);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  updateSets = [];
  mockUpdate.mockReturnValue({
    set: vi.fn((vals: Record<string, unknown>) => {
      updateSets.push(vals);
      return { where: vi.fn(() => Promise.resolve()) };
    }),
  });
});

describe("mfa/setup blocks when already enabled (M7)", () => {
  it("returns 409 and does not write a new secret", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ email: "a@b.com", mfaEnabled: true }]),
      })),
    });
    const res = await setupPost();
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// Shared helper: route selects the session row, then the user (totpSecret).
function setupSessionAndUser(sessionRow: Record<string, unknown>) {
  mockSelect.mockImplementation((projection?: Record<string, unknown>) => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        // user select projects totpSecret (and mfaEnabled for disable)
        if (projection && ("totpSecret" in projection)) {
          return [{ totpSecret: "enc", mfaEnabled: true }];
        }
        return [sessionRow];
      }),
    })),
  }));
}

describe("mfa/verify-setup per-session lockout (M7)", () => {
  it("returns 429 when the session is already locked", async () => {
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 0,
      mfaLockedUntil: new Date(Date.now() + 60_000),
    });
    const res = await verifySetupPost(
      makePost("http://localhost/api/auth/mfa/verify-setup", { code: "123456" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 429 on the attempt that crosses MAX_MFA_ATTEMPTS", async () => {
    const { Secret } = await import("otpauth");
    totpSecretBase32 = new Secret({ size: 20 }).base32;
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 4, // 5th attempt locks
      mfaLockedUntil: null,
    });
    const res = await verifySetupPost(
      makePost("http://localhost/api/auth/mfa/verify-setup", { code: "000000" })
    );
    expect(res.status).toBe(429);
    expect(findSet("mfaLockedUntil")?.mfaLockedUntil).toBeInstanceOf(Date);
  });

  it("returns 400 on a non-final invalid attempt", async () => {
    const { Secret } = await import("otpauth");
    totpSecretBase32 = new Secret({ size: 20 }).base32;
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    });
    const res = await verifySetupPost(
      makePost("http://localhost/api/auth/mfa/verify-setup", { code: "000000" })
    );
    expect(res.status).toBe(400);
    expect(findSet("mfaFailedAttempts")?.mfaFailedAttempts).toBe(1);
  });

  it("resets counters on a valid code", async () => {
    const { TOTP, Secret } = await import("otpauth");
    const secret = new Secret({ size: 20 });
    totpSecretBase32 = secret.base32;
    const code = new TOTP({ issuer: "OtterMint", secret }).generate();
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 3,
      mfaLockedUntil: null,
    });
    const res = await verifySetupPost(
      makePost("http://localhost/api/auth/mfa/verify-setup", { code })
    );
    expect(res.status).toBe(200);
    expect(findSet("mfaEnabled")?.mfaEnabled).toBe(true);
    const reset = findSet("mfaFailedAttempts");
    expect(reset?.mfaFailedAttempts).toBe(0);
    expect(reset?.mfaLockedUntil).toBeNull();
  });
});

describe("mfa/disable per-session lockout (M7)", () => {
  it("returns 429 when the session is already locked", async () => {
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 0,
      mfaLockedUntil: new Date(Date.now() + 60_000),
    });
    const res = await disablePost(
      makePost("http://localhost/api/auth/mfa/disable", { code: "123456" })
    );
    expect(res.status).toBe(429);
  });

  it("returns 429 on the attempt that crosses MAX_MFA_ATTEMPTS", async () => {
    const { Secret } = await import("otpauth");
    totpSecretBase32 = new Secret({ size: 20 }).base32;
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 4,
      mfaLockedUntil: null,
    });
    const res = await disablePost(
      makePost("http://localhost/api/auth/mfa/disable", { code: "000000" })
    );
    expect(res.status).toBe(429);
  });

  it("disables and resets counters on a valid code", async () => {
    const { TOTP, Secret } = await import("otpauth");
    const secret = new Secret({ size: 20 });
    totpSecretBase32 = secret.base32;
    const code = new TOTP({ issuer: "OtterMint", secret }).generate();
    setupSessionAndUser({
      id: SESSION_ID,
      userId: "user-123",
      mfaFailedAttempts: 2,
      mfaLockedUntil: null,
    });
    const res = await disablePost(
      makePost("http://localhost/api/auth/mfa/disable", { code })
    );
    expect(res.status).toBe(200);
    expect(findSet("mfaEnabled")?.mfaEnabled).toBe(false);
    const reset = findSet("mfaFailedAttempts");
    expect(reset?.mfaFailedAttempts).toBe(0);
    expect(reset?.mfaLockedUntil).toBeNull();
  });
});
