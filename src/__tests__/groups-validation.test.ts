import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const selectChain = {
    from: vi.fn(() => ({
      where: vi.fn(() => []),
    })),
  };
  return {
    db: {
      // groups POST: checks existing membership (empty), then user displayName
      select: vi.fn(() => selectChain),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [
                { id: "group-id", name: "n", createdAt: new Date() },
              ]),
            })),
          })),
        };
        return cb(tx);
      }),
      // invitations POST: insert returning
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => [
            {
              id: "inv-id",
              token: "tok",
              invitedEmail: null,
              expiresAt: new Date(),
              createdAt: new Date(),
            },
          ]),
        })),
      })),
    },
  };
});

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
    const res = await groupsPost(makeGroupPost({}));
    expect(res.status).toBe(201);
  });
});

describe("group invitations POST email validation (M2)", () => {
  // The owner-membership mock differs from groups, so mock per-call via the
  // shared db select chain which returns an owner membership row here.
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
    // membership lookup returns owner so we reach validation
    const { db } = await import("@/lib/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ role: "owner" }]),
      })),
    });
    const res = await invitePost(makeInvitePost({ email: "notanemail" }), {
      params,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a supplied email exceeds 320 characters", async () => {
    const { db } = await import("@/lib/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ role: "owner" }]),
      })),
    });
    const res = await invitePost(
      makeInvitePost({ email: "a".repeat(320) + "@b.com" }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("allows an absent email (link-only invite, 201)", async () => {
    const { db } = await import("@/lib/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ role: "owner" }]),
      })),
    });
    const res = await invitePost(makeInvitePost({}), { params });
    expect(res.status).toBe(201);
  });
});
