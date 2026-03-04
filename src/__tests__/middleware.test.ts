import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

beforeEach(() => {
  vi.stubEnv("AUTH_USERNAME", "admin");
  vi.stubEnv("AUTH_PASSWORD", "secret123");
});

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost:3000/", { headers });
}

describe("middleware", () => {
  it("returns 401 when no auth header is provided", () => {
    const response = middleware(makeRequest());
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("returns 401 for invalid credentials", () => {
    const encoded = btoa("wrong:creds");
    const response = middleware(makeRequest(`Basic ${encoded}`));
    expect(response.status).toBe(401);
  });

  it("allows request with valid credentials", () => {
    const encoded = btoa("admin:secret123");
    const response = middleware(makeRequest(`Basic ${encoded}`));
    expect(response.status).toBe(200);
  });

  it("returns 401 for non-Basic auth scheme", () => {
    const response = middleware(makeRequest("Bearer some-token"));
    expect(response.status).toBe(401);
  });
});
