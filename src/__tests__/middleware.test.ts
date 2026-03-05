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
