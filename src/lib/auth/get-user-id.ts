import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionLookupRow {
  user_id: string;
  expires_at: Date;
  mfa_pending: boolean;
  mfa_failed_attempts: number;
  mfa_locked_until: Date | null;
}

/**
 * Gets the authenticated user's ID by validating the session cookie against the DB.
 * Called from API route handlers (Node.js runtime, so postgres.js works).
 * Throws if no valid session exists.
 *
 * Runs on the global (un-scoped) `db` connection: the session row must be
 * findable BEFORE we know whose it is, so it cannot be read under a per-user
 * RLS context (chicken-and-egg). Reads/slides go through the SECURITY DEFINER
 * functions `lookup_session` / `slide_session`, which is the only way the
 * non-superuser app_user role may touch `sessions` outside its own RLS scope.
 */
export async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (!sessionId) {
    throw new AuthError("No session cookie");
  }

  // Validate UUID format to avoid DB cast errors
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    throw new AuthError("Invalid session cookie");
  }

  const rows = (await db.execute(
    sql`select * from lookup_session(${sessionId})`
  )) as unknown as SessionLookupRow[];

  if (rows.length === 0) {
    throw new AuthError("Session not found");
  }

  const session = rows[0];
  if (new Date(session.expires_at) < new Date()) {
    throw new AuthError("Session expired");
  }

  if (session.mfa_pending) {
    throw new AuthError("MFA verification required");
  }

  // Sliding expiry: refresh on each request
  const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
  await db.execute(sql`select slide_session(${sessionId}, ${newExpiry})`);

  return session.user_id;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Returns true if the error is an AuthError (invalid/expired session). */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
