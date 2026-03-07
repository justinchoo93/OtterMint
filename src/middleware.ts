import { NextRequest, NextResponse } from "next/server";

// Paths that don't require authentication
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/privacy",
  "/auth/mfa-verify",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/mfa/verify",
];

const PUBLIC_PREFIXES = ["/invite/", "/shared/", "/api/shared/", "/api/invite/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * Lightweight middleware that checks for session cookie presence.
 * Actual session validation happens in getUserId() (route handler level)
 * because postgres.js doesn't work in Edge runtime.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
