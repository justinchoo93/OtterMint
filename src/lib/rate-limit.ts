import { NextResponse } from "next/server";

// ─── Policy definitions ──────────────────────────────────────────────
// A policy is "how many requests" over "how many milliseconds", measured
// as a sliding window. These are tuned to be generous enough not to block
// a real user retrying, but tight enough to stop a flood. Each surface is
// keyed differently (see usage in the route handlers).

export interface Policy {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_POLICIES = {
  // Sign-in: 10 attempts/minute per IP+email. Per-account lockout in
  // login-lockout.ts handles credential stuffing of a single account;
  // this stops a single source spraying many emails.
  login: { limit: 10, windowMs: 60_000 },
  // Account creation: 5/hour per IP — registration should be rare.
  register: { limit: 5, windowMs: 60 * 60_000 },
  // MFA code entry: 10/minute per IP+pending-session.
  mfaVerify: { limit: 10, windowMs: 60_000 },
  // Public token lookups: 30/minute per IP. Tokens are high-entropy so
  // this mainly caps enumeration noise and cost.
  shareLookup: { limit: 30, windowMs: 60_000 },
  inviteLookup: { limit: 30, windowMs: 60_000 },
  // Plaid refresh: 6/hour per user — refresh makes paid upstream calls
  // and the handler itself only re-fetches data older than 2 hours.
  accountsRefresh: { limit: 6, windowMs: 60 * 60_000 },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof RATE_LIMIT_POLICIES;

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // Unix ms timestamp when budget frees up
}

// ─── In-memory sliding-window limiter (dev/CI/test fallback) ─────────
// Stores, per key, the timestamps of recent requests. On each check it
// drops timestamps older than the window, then admits the request if the
// remaining count is under the limit. NOT correct across multiple server
// instances — that is what the Upstash backend is for — but perfectly
// deterministic and dependency-free for tests and local dev.

export class InMemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private policy: Policy,
    private clock: () => number = () => Date.now()
  ) {}

  check(key: string): RateLimitResult {
    const now = this.clock();
    const windowStart = now - this.policy.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.policy.limit) {
      const oldest = recent[0];
      this.hits.set(key, recent);
      return {
        success: false,
        remaining: 0,
        reset: oldest + this.policy.windowMs,
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return {
      success: true,
      remaining: this.policy.limit - recent.length,
      reset: now + this.policy.windowMs,
    };
  }
}

// ─── Backend selection ───────────────────────────────────────────────
// Lazily build either Upstash-backed limiters (when configured) or a
// single shared in-memory limiter per policy. We cache instances so the
// in-memory state persists across calls within a process.

type UpstashLimiter = {
  limit: (
    key: string
  ) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

let upstashLimiters: Record<PolicyName, UpstashLimiter> | null = null;
const memoryLimiters = new Map<PolicyName, InMemoryRateLimiter>();
let warnedFallback = false;

function upstashConfigured(): boolean {
  // Read at call time so tests can stub the env var per-case.
  return Boolean(process.env.UPSTASH_REDIS_REST_URL);
}

async function getUpstashLimiters(): Promise<Record<PolicyName, UpstashLimiter>> {
  if (upstashLimiters) return upstashLimiters;
  // Imported lazily (dynamic import, never require — the no-require-imports
  // lint rule would reject require) so the Upstash packages are never loaded
  // in the dev/CI/test path where UPSTASH_REDIS_REST_URL is unset.
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  const redis = Redis.fromEnv();
  const build = (p: Policy, prefix: string): UpstashLimiter =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(p.limit, `${p.windowMs} ms`),
      prefix: `ottermint:rl:${prefix}`,
      analytics: false,
    });
  upstashLimiters = Object.fromEntries(
    (Object.keys(RATE_LIMIT_POLICIES) as PolicyName[]).map((name) => [
      name,
      build(RATE_LIMIT_POLICIES[name], name),
    ])
  ) as Record<PolicyName, UpstashLimiter>;
  return upstashLimiters;
}

function getMemoryLimiter(name: PolicyName): InMemoryRateLimiter {
  let lim = memoryLimiters.get(name);
  if (!lim) {
    lim = new InMemoryRateLimiter(RATE_LIMIT_POLICIES[name]);
    memoryLimiters.set(name, lim);
  }
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL not set; using in-memory limiter (not safe across multiple instances)."
    );
  }
  return lim;
}

export async function limit(
  name: PolicyName,
  key: string
): Promise<RateLimitResult> {
  if (upstashConfigured()) {
    const limiters = await getUpstashLimiters();
    const r = await limiters[name].limit(key);
    return { success: r.success, remaining: r.remaining, reset: r.reset };
  }
  return getMemoryLimiter(name).check(key);
}

// ─── HTTP enforcement helper ─────────────────────────────────────────
// Returns a 429 NextResponse when over budget, or null when allowed.
// Callers do: const limited = await enforceRateLimit(...); if (limited) return limited;

export async function enforceRateLimit(
  name: PolicyName,
  key: string
): Promise<NextResponse | null> {
  const result = await limit(name, key);
  if (result.success) return null;
  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000)
  );
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

// ─── Client IP extraction ────────────────────────────────────────────
// NOTE: the correct header and which entry to trust depends entirely on
// the deployment platform's proxy. For example, some platforms append the
// real client IP as the *last* entry of x-forwarded-for rather than the
// first. Deployment is deferred, so this trusted-entry choice is an
// assumption to revisit once the platform is known. It is isolated here so
// it can be corrected in a single place.

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
