import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new NextRequest(url, { headers });
}

const VALID_COOKIE = "session_id=550e8400-e29b-41d4-a716-446655440000";

function makePostRequest(
  path: string,
  origin: string | null,
  host = "localhost:3000",
  cookie?: string,
  referer?: string
): NextRequest {
  const url = `http://${host}${path}`;
  const headers = new Headers();
  headers.set("host", host);
  if (origin) headers.set("origin", origin);
  if (referer) headers.set("referer", referer);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { method: "POST", headers });
}

describe("middleware", () => {
  // Public paths should pass through without auth
  it("allows /login without auth", () => {
    const response = middleware(makeRequest("/login"));
    expect(response.status).toBe(200);
  });

  it("allows /register without auth", () => {
    const response = middleware(makeRequest("/register"));
    expect(response.status).toBe(200);
  });

  it("allows /api/auth/login without auth", () => {
    const response = middleware(makeRequest("/api/auth/login"));
    expect(response.status).toBe(200);
  });

  it("allows /api/auth/register without auth", () => {
    const response = middleware(makeRequest("/api/auth/register"));
    expect(response.status).toBe(200);
  });

  it("allows /invite/some-token without auth", () => {
    const response = middleware(makeRequest("/invite/some-token"));
    expect(response.status).toBe(200);
  });

  it("allows /shared/some-token without auth", () => {
    const response = middleware(makeRequest("/shared/some-token"));
    expect(response.status).toBe(200);
  });

  it("allows /api/shared/some-token without auth", () => {
    const response = middleware(makeRequest("/api/shared/some-token"));
    expect(response.status).toBe(200);
  });

  it("allows /api/invite/some-token without auth", () => {
    const response = middleware(makeRequest("/api/invite/some-token"));
    expect(response.status).toBe(200);
  });

  it("allows /api/plaid/webhook without auth", () => {
    const response = middleware(makeRequest("/api/plaid/webhook"));
    expect(response.status).toBe(200);
  });

  it("allows /api/health without auth", () => {
    const response = middleware(makeRequest("/api/health"));
    expect(response.status).toBe(200);
  });

  // Protected routes redirect to login when no session cookie
  it("redirects to /login for protected pages when no session cookie", () => {
    const response = middleware(makeRequest("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("returns 401 for protected API routes when no session cookie", () => {
    const response = middleware(makeRequest("/api/accounts"));
    expect(response.status).toBe(401);
  });

  // Valid session cookie passes through
  it("passes through when session cookie exists", () => {
    const response = middleware(
      makeRequest("/", "session_id=550e8400-e29b-41d4-a716-446655440000")
    );
    expect(response.status).toBe(200);
  });

  it("passes through for API routes when session cookie exists", () => {
    const response = middleware(
      makeRequest("/api/accounts", "session_id=550e8400-e29b-41d4-a716-446655440000")
    );
    expect(response.status).toBe(200);
  });
});

describe("middleware cross-origin protection (M5)", () => {
  it("blocks a cross-origin POST to /api/manual-accounts with 403", () => {
    const response = middleware(
      makePostRequest("/api/manual-accounts", "https://evil.example", "localhost:3000", VALID_COOKIE)
    );
    expect(response.status).toBe(403);
  });

  it("allows a same-origin POST (then hits the cookie gate, 200 with valid cookie)", () => {
    const response = middleware(
      makePostRequest("/api/manual-accounts", "http://localhost:3000", "localhost:3000", VALID_COOKIE)
    );
    expect(response.status).toBe(200);
  });

  it("allows a POST with no Origin and no Referer (absence is not cross-origin)", () => {
    const response = middleware(
      makePostRequest("/api/manual-accounts", null, "localhost:3000", VALID_COOKIE)
    );
    expect(response.status).toBe(200);
  });

  it("blocks when Referer is cross-origin and Origin is absent", () => {
    const response = middleware(
      makePostRequest(
        "/api/manual-accounts",
        null,
        "localhost:3000",
        VALID_COOKIE,
        "https://evil.example/page"
      )
    );
    expect(response.status).toBe(403);
  });

  it("allows when Referer is same-origin and Origin is absent", () => {
    const response = middleware(
      makePostRequest(
        "/api/manual-accounts",
        null,
        "localhost:3000",
        VALID_COOKIE,
        "http://localhost:3000/accounts"
      )
    );
    expect(response.status).toBe(200);
  });

  it("does not affect GET requests (cross-origin GET still allowed)", () => {
    const response = middleware(makeRequest("/api/accounts", VALID_COOKIE));
    expect(response.status).toBe(200);
  });

  it("does not affect OPTIONS requests", () => {
    const url = "http://localhost:3000/api/manual-accounts";
    const headers = new Headers();
    headers.set("host", "localhost:3000");
    headers.set("origin", "https://evil.example");
    headers.set("cookie", VALID_COOKIE);
    const req = new NextRequest(url, { method: "OPTIONS", headers });
    const response = middleware(req);
    expect(response.status).toBe(200);
  });

  it("allows a cross-origin POST to /api/auth/login (excluded)", () => {
    const response = middleware(
      makePostRequest("/api/auth/login", "https://evil.example")
    );
    expect(response.status).toBe(200);
  });

  it("allows a cross-origin POST to /api/plaid/webhook (excluded)", () => {
    const response = middleware(
      makePostRequest("/api/plaid/webhook", "https://evil.example")
    );
    expect(response.status).toBe(200);
  });

  it("allows a cross-origin POST to /api/shared/x (excluded prefix)", () => {
    const response = middleware(
      makePostRequest("/api/shared/x", "https://evil.example")
    );
    expect(response.status).toBe(200);
  });

  it("allows a cross-origin POST to /api/invite/x (excluded prefix)", () => {
    const response = middleware(
      makePostRequest("/api/invite/x", "https://evil.example")
    );
    expect(response.status).toBe(200);
  });
});
