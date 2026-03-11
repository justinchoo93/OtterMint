const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_NAME = "session_id";
export const MFA_PENDING_COOKIE_NAME = "mfa_pending";

export function getSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function getExpiredCookieOptions() {
  return getSessionCookieOptions(0);
}
