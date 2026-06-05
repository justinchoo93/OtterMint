import { describe, it, expect, beforeEach, vi } from "vitest";

// getUserId returns a fixed caller id; tests vary the membership/invite row.
vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: vi.fn(async () => "caller-id"),
  isAuthError: () => false,
}));

// A controllable db mock: tests set `selectResult` to the rows returned.
let selectResult: unknown[] = [];
const updateWhere = vi.fn(async () => undefined);
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => selectResult }) }),
    update: () => ({ set: () => ({ where: updateWhere }) }),
  },
}));

import { NextRequest } from "next/server";
import { GET as inviteGet } from "@/app/api/invite/[token]/route";
import { POST as acceptPost } from "@/app/api/groups/[id]/invitations/[token]/accept/route";
import { DELETE as invitationsDelete } from "@/app/api/groups/[id]/invitations/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  selectResult = [];
  updateWhere.mockClear();
});

describe("public invite lookup ignores revoked invites", () => {
  it("returns 404 not-found for a revoked invitation", async () => {
    // The handler filters isNull(revokedAt) in the query, so a revoked
    // invite is simply absent from selectResult.
    selectResult = [];
    const req = new NextRequest("http://localhost:3000/api/invite/tok", {
      headers: { "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250) + 1}` },
    });
    const res = await inviteGet(req, {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("accept rejects a revoked invitation", () => {
  it("returns 410 'no longer available' for a revoked invitation", async () => {
    selectResult = [
      {
        id: "inv1",
        groupId: "g1",
        token: "tok",
        acceptedAt: null,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        invitedEmail: null,
      },
    ];
    const req = new NextRequest(
      "http://localhost:3000/api/groups/g1/invitations/tok/accept",
      { method: "POST" }
    );
    const res = await acceptPost(req, {
      params: Promise.resolve({ id: "g1", token: "tok" }),
    });
    expect(res.status).toBe(410);
  });
});

describe("DELETE invitation (revoke) authorization", () => {
  it("returns 403 when the caller is not the group owner", async () => {
    selectResult = [{ id: 1, role: "member", userId: "caller-id" }];
    const req = new NextRequest(
      "http://localhost:3000/api/groups/g1/invitations?token=tok",
      { method: "DELETE" }
    );
    const res = await invitationsDelete(req, {
      params: Promise.resolve({ id: "g1" }),
    });
    expect(res.status).toBe(403);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns 200 and revokes when the caller is the owner", async () => {
    selectResult = [{ id: 1, role: "owner", userId: "caller-id" }];
    const req = new NextRequest(
      "http://localhost:3000/api/groups/g1/invitations?token=tok",
      { method: "DELETE" }
    );
    const res = await invitationsDelete(req, {
      params: Promise.resolve({ id: "g1" }),
    });
    expect(res.status).toBe(200);
    expect(updateWhere).toHaveBeenCalled();
  });

  it("returns 400 when no token query param is provided", async () => {
    selectResult = [{ id: 1, role: "owner", userId: "caller-id" }];
    const req = new NextRequest(
      "http://localhost:3000/api/groups/g1/invitations",
      { method: "DELETE" }
    );
    const res = await invitationsDelete(req, {
      params: Promise.resolve({ id: "g1" }),
    });
    expect(res.status).toBe(400);
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
