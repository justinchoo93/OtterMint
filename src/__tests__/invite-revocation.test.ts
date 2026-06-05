import { describe, it, expect, beforeEach, vi } from "vitest";

// getUserId returns a fixed caller id; tests vary the definer/membership rows.
vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: vi.fn(async () => "caller-id"),
  isAuthError: () => false,
}));

// The invite GET and accept POST now call SECURITY DEFINER functions via
// db.execute(sql`...`). `executeResult` is the rows returned; `executeError`,
// if set, is thrown (to simulate accept_invitation's typed RAISE).
// The DELETE invitation route runs inside withUser(userId, tx => ...); the
// fake tx select returns `membershipRows` and update resolves.
const { mockExecute, updateWhere, getState } = vi.hoisted(() => {
  const state: {
    executeResult: unknown[];
    executeError: Error | null;
    membershipRows: unknown[];
  } = { executeResult: [], executeError: null, membershipRows: [] };
  return {
    getState: () => state,
    mockExecute: vi.fn(async () => {
      if (state.executeError) throw state.executeError;
      return state.executeResult;
    }),
    updateWhere: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/db", () => ({
  db: { execute: mockExecute },
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: () => getState().membershipRows }),
      }),
      update: () => ({ set: () => ({ where: updateWhere }) }),
    })
  ),
}));

import { NextRequest } from "next/server";
import { GET as inviteGet } from "@/app/api/invite/[token]/route";
import { POST as acceptPost } from "@/app/api/groups/[id]/invitations/[token]/accept/route";
import { DELETE as invitationsDelete } from "@/app/api/groups/[id]/invitations/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  const state = getState();
  state.executeResult = [];
  state.executeError = null;
  state.membershipRows = [];
  updateWhere.mockClear();
  mockExecute.mockClear();
});

describe("public invite lookup ignores revoked invites", () => {
  it("returns 404 not-found for a revoked invitation", async () => {
    // resolve_invitation filters revoked invites, so a revoked invite returns
    // no row -> 404.
    getState().executeResult = [];
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
    // accept_invitation raises REVOKED for a revoked invitation.
    getState().executeError = new Error("REVOKED");
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
    getState().membershipRows = [{ id: 1, role: "member", userId: "caller-id" }];
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
    getState().membershipRows = [{ id: 1, role: "owner", userId: "caller-id" }];
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
    getState().membershipRows = [{ id: 1, role: "owner", userId: "caller-id" }];
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
