import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => [] }) }),
  },
}));

import { NextRequest } from "next/server";
import { GET as sharedGet } from "@/app/api/shared/[token]/route";

function reqFromIp(ip: string) {
  return new NextRequest("http://localhost:3000/api/shared/sometoken", {
    headers: { "x-forwarded-for": ip },
  });
}
const params = Promise.resolve({ token: "sometoken" });

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); // force in-memory limiter
});

describe("shared-link lookup rate limiting", () => {
  it("returns 429 with Retry-After once the per-IP budget is exceeded", async () => {
    // Random IP per run so the process-persistent in-memory limiter state
    // does not leak between runs.
    const ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
    // Policy is 30/min. Exhaust it, then one more must be 429.
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await sharedGet(reqFromIp(ip), { params });
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    const seconds = Number(last!.headers.get("Retry-After"));
    expect(seconds).toBeGreaterThan(0);
  });

  it("returns a normal (non-429) status while under the budget", async () => {
    const ip = `10.0.1.${Math.floor(Math.random() * 250) + 1}`;
    const res = await sharedGet(reqFromIp(ip), { params });
    // db mock returns no link, so the under-limit response is the 404
    // not-found path — the point is it is NOT a 429.
    expect(res.status).not.toBe(429);
    expect(res.status).toBe(404);
  });
});
