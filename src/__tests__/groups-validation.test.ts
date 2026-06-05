import { describe, it, expect, vi } from "vitest";

// Both routes now run their DB work inside withUser(userId, tx => ...). The
// fake tx returns an owner membership row for invitations, an empty membership
// for groups POST (so it proceeds to create), and chainable insert/returning.
// `selectRows` lets a test override what the next select(s) return.
let selectRows: unknown[] = [];
const fakeTx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => selectRows),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => [
        {
          id: "group-id",
          name: "n",
          createdAt: new Date(),
          token: "tok",
          invitedEmail: null,
          expiresAt: new Date(),
        },
      ]),
    })),
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
import { POST as groupsPost } from "@/app/api/groups/route";
import { POST as invitePost } from "@/app/api/groups/[id]/invitations/route";

function makeGroupPost(body: unknown) {
  return new NextRequest("http://localhost:3000/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("groups POST name validation (M2)", () => {
  it("returns 400 when a supplied name exceeds 200 characters", async () => {
    const res = await groupsPost(makeGroupPost({ name: "a".repeat(201) }));
    expect(res.status).toBe(400);
  });

  it("auto-defaults when name is absent (201)", async () => {
    // No existing membership, so the route proceeds to create the group.
    selectRows = [];
    const res = await groupsPost(makeGroupPost({}));
    expect(res.status).toBe(201);
  });
});

describe("group invitations POST email validation (M2)", () => {
  const params = Promise.resolve({ id: "group-id" });

  function makeInvitePost(body: unknown) {
    return new NextRequest(
      "http://localhost:3000/api/groups/group-id/invitations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  }

  it("returns 400 when a supplied email is malformed", async () => {
    // Validation runs before any DB access, so membership rows don't matter.
    const res = await invitePost(makeInvitePost({ email: "notanemail" }), {
      params,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a supplied email exceeds 320 characters", async () => {
    const res = await invitePost(
      makeInvitePost({ email: "a".repeat(320) + "@b.com" }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("allows an absent email (link-only invite, 201)", async () => {
    // membership lookup returns owner so the insert proceeds
    selectRows = [{ role: "owner" }];
    const res = await invitePost(makeInvitePost({}), { params });
    expect(res.status).toBe(201);
  });
});
