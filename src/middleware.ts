import { NextRequest, NextResponse } from "next/server";

// Paths that don't require authentication
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/privacy",
  "/auth/mfa-verify",
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/mfa/verify",
  "/api/plaid/webhook",
];

const PUBLIC_PREFIXES = ["/invite/", "/shared/", "/api/shared/", "/api/invite/"];

// Mutating /api routes that are intentionally callable without a browser
// same-origin guarantee: the unauthenticated auth flows, and the Plaid webhook
// (server-to-server, signature-verified, carries no Origin header). Keep this
// list narrow; everything else under /api enforces same-origin on mutations.
const ORIGIN_CHECK_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/mfa/verify",
  "/api/plaid/webhook",
];
const ORIGIN_CHECK_EXEMPT_PREFIXES = ["/api/shared/", "/api/invite/"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isOriginCheckExempt(pathname: string): boolean {
  if (ORIGIN_CHECK_EXEMPT_PATHS.includes(pathname)) return true;
  return ORIGIN_CHECK_EXEMPT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}

/**
 * Defense-in-depth CSRF guard layered on top of SameSite=Lax. Returns true
 * when a mutating /api request carries an Origin or Referer pointing at a
 * different site. Composes with future middleware additions (e.g. an IP rate
 * limiter): it only inspects headers and never short-circuits safe requests.
 */
function isCrossOriginMutation(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  if (SAFE_METHODS.has(request.method)) return false;
  if (!isApiRoute(pathname)) return false;
  if (isOriginCheckExempt(pathname)) return false;

  const host = request.headers.get("host");
  if (!host) return true; // can't establish identity → fail closed

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const expectedOrigin = `${proto}://${host}`;

  const origin = request.headers.get("origin");
  if (origin) {
    return origin !== expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin !== expectedOrigin;
    } catch {
      return true; // unparseable Referer → fail closed
    }
  }

  // Neither Origin nor Referer present: absence is not proof of cross-origin.
  return false;
}

/**
 * Lightweight middleware that checks for session cookie presence.
 * Actual session validation happens in getUserId() (route handler level)
 * because postgres.js doesn't work in Edge runtime.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF defense-in-depth: reject cross-origin mutations before the cookie gate
  // so a stolen-looking cookie cannot be replayed from another site.
  if (isCrossOriginMutation(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked" },
      { status: 403 }
    );
  }

  // Allow public paths through without auth
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check if session cookie exists and has valid UUID format
  const sessionId = request.cookies.get("session_id")?.value;
  const mfaPending = request.cookies.get("mfa_pending")?.value;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // If MFA is pending, redirect to MFA verify page (unless already there)
  if (mfaPending && uuidRegex.test(mfaPending)) {
    if (pathname !== "/auth/mfa-verify") {
      if (isApiRoute(pathname)) {
        return NextResponse.json(
          { error: "MFA verification required" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/auth/mfa-verify", request.url));
    }
  }

  if (!sessionId || !uuidRegex.test(sessionId)) {
    // API routes get 401, page routes get redirected to login
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cookie exists — pass through. Full validation happens in route handlers.
  // Forward the session_id as a header for route handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
