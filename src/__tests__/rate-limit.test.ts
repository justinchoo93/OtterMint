import { describe, it, expect } from "vitest";
import { InMemoryRateLimiter } from "@/lib/rate-limit";

describe("InMemoryRateLimiter (sliding window)", () => {
  it("allows requests up to the limit, then denies", () => {
    const now = 1_000_000;
    const clock = () => now;
    const limiter = new InMemoryRateLimiter({ limit: 3, windowMs: 60_000 }, clock);

    expect(limiter.check("ip1").success).toBe(true); // 1
    expect(limiter.check("ip1").success).toBe(true); // 2
    expect(limiter.check("ip1").success).toBe(true); // 3
    const denied = limiter.check("ip1"); // 4 -> over budget
    expect(denied.success).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.reset).toBeGreaterThan(now);
  });

  it("reports remaining budget on successful checks", () => {
    const now = 1_000_000;
    const limiter = new InMemoryRateLimiter({ limit: 3, windowMs: 60_000 }, () => now);

    expect(limiter.check("ip1").remaining).toBe(2);
    expect(limiter.check("ip1").remaining).toBe(1);
    expect(limiter.check("ip1").remaining).toBe(0);
  });

  it("tracks keys independently", () => {
    const now = 1_000_000;
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 60_000 }, () => now);

    expect(limiter.check("a").success).toBe(true);
    expect(limiter.check("a").success).toBe(false);
    expect(limiter.check("b").success).toBe(true); // different key, fresh budget
  });

  it("slides: old requests expire as time advances", () => {
    let now = 1_000_000;
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 60_000 }, () => now);

    expect(limiter.check("ip1").success).toBe(true);
    expect(limiter.check("ip1").success).toBe(false);
    now += 60_001; // advance past the window
    expect(limiter.check("ip1").success).toBe(true); // budget recovered
  });

  it("recovers partially as the oldest request leaves the window", () => {
    let now = 1_000_000;
    const limiter = new InMemoryRateLimiter({ limit: 2, windowMs: 60_000 }, () => now);

    expect(limiter.check("ip1").success).toBe(true); // at t=1_000_000
    now += 30_000;
    expect(limiter.check("ip1").success).toBe(true); // at t=1_030_000, now full
    expect(limiter.check("ip1").success).toBe(false); // denied
    now += 30_001; // first request (t=1_000_000) now expired
    expect(limiter.check("ip1").success).toBe(true); // one slot freed
  });
});
