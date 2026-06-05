import { describe, it, expect, vi } from "vitest";

// Mock db and auth modules before importing routes. login uses db.execute for
// its SECURITY DEFINER lookups; me PUT runs its DB work inside withUser.
const fakeTx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => [
        {
          id: "test-user-id",
          email: "a@b.com",
          displayName: "a".repeat(200),
          mfaEnabled: false,
          passwordHash: "hash",
        },
      ]),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(),
    })),
  })),
};

vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn(fakeTx)
  ),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: vi.fn(() => "test-user-id"),
  isAuthError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

import { NextRequest } from "next/server";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { PUT as mePut } from "@/app/api/auth/me/route";

function makeJsonRequest(body: unknown, url = "http://localhost:3000/api/auth/login") {
  return new NextRequest(url, {
    method: url.includes("/me") ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("login rejects primitive/non-object bodies", () => {
  it("returns 400 when body is null", async () => {
    const res = await loginPost(makeJsonRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is a string", async () => {
    const res = await loginPost(makeJsonRequest("not-an-object"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is an array", async () => {
    const res = await loginPost(makeJsonRequest([1, 2, 3]));
    expect(res.status).toBe(400);
  });
});

describe("me PUT rejects primitive/non-object bodies", () => {
  it("returns 400 when body is null", async () => {
    const res = await mePut(makeJsonRequest(null, "http://localhost:3000/api/auth/me"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is a number", async () => {
    const res = await mePut(makeJsonRequest(42, "http://localhost:3000/api/auth/me"));
    expect(res.status).toBe(400);
  });
});

describe("Bug 11: login rejects non-string email/password", () => {
  it("returns 400 when email is an object", async () => {
    const res = await loginPost(makeJsonRequest({ email: {}, password: "test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is an object", async () => {
    const res = await loginPost(makeJsonRequest({ email: "a@b.com", password: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is a number", async () => {
    const res = await loginPost(makeJsonRequest({ email: 123, password: "test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is an array", async () => {
    const res = await loginPost(makeJsonRequest({ email: "a@b.com", password: [1, 2] }));
    expect(res.status).toBe(400);
  });
});

describe("me PUT rejects oversized displayName", () => {
  it("returns 400 when displayName is 201 characters", async () => {
    const res = await mePut(
      makeJsonRequest(
        { displayName: "a".repeat(201) },
        "http://localhost:3000/api/auth/me"
      )
    );
    expect(res.status).toBe(400);
  });

  it("accepts a 200-character displayName", async () => {
    const res = await mePut(
      makeJsonRequest(
        { displayName: "a".repeat(200) },
        "http://localhost:3000/api/auth/me"
      )
    );
    expect(res.status).toBe(200);
  });
});

describe("Bug 12: password change rejects non-string currentPassword", () => {
  it("returns 400 when currentPassword is an object", async () => {
    const res = await mePut(
      makeJsonRequest(
        { newPassword: "newpass123", currentPassword: {} },
        "http://localhost:3000/api/auth/me"
      )
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when currentPassword is a number", async () => {
    const res = await mePut(
      makeJsonRequest(
        { newPassword: "newpass123", currentPassword: 12345 },
        "http://localhost:3000/api/auth/me"
      )
    );
    expect(res.status).toBe(400);
  });
});
