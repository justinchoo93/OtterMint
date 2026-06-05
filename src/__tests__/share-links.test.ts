import { describe, it, expect, vi, beforeEach } from "vitest";

// Captures the values passed into the most recent tx.insert(...).values(...)
let lastInsertValues: Record<string, unknown> | null = null;

// The route now does its insert inside withUser(userId, tx => ...). The mock
// invokes the callback with a fake tx whose insert chain captures the values.
const fakeTx = {
  insert: vi.fn(() => ({
    values: vi.fn((vals: Record<string, unknown>) => {
      lastInsertValues = vals;
      return {
        returning: vi.fn(() => [
          {
            id: "link-id",
            token: "tok",
            label: vals.label ?? null,
            includeNetWorth: vals.includeNetWorth ?? true,
            includeBalances: vals.includeBalances ?? false,
            includeTransactions: vals.includeTransactions ?? false,
            expiresAt: vals.expiresAt ?? null,
            createdAt: new Date(),
          },
        ]),
      };
    }),
  })),
};

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn(fakeTx)
  ),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: vi.fn(() => "test-user-id"),
  isAuthError: vi.fn(() => false),
}));

import { NextRequest } from "next/server";
import { POST as shareLinksPost } from "@/app/api/share-links/route";

function makePost(body: unknown) {
  return new NextRequest("http://localhost:3000/api/share-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  lastInsertValues = null;
});

describe("share-links POST label validation (M2)", () => {
  it("returns 400 when label exceeds 200 characters", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 30, label: "a".repeat(201) }));
    expect(res.status).toBe(400);
  });

  it("accepts a 200-character label", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 30, label: "a".repeat(200) }));
    expect(res.status).toBe(201);
  });
});

describe("share-links POST expiry validation (M4)", () => {
  it("returns 400 when expiresInDays is omitted", async () => {
    const res = await shareLinksPost(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresInDays is 0", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresInDays is -1", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresInDays is 1.5", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 1.5 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresInDays is 366", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 366 }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with a non-null expiresAt when expiresInDays is 30", async () => {
    const res = await shareLinksPost(makePost({ expiresInDays: 30 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.shareLink.expiresAt).not.toBeNull();
    expect(lastInsertValues?.expiresAt).toBeInstanceOf(Date);
  });
});
