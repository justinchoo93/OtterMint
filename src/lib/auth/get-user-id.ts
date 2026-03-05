import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Gets the authenticated user's ID by validating the session cookie against the DB.
 * Called from API route handlers (Node.js runtime, so postgres.js works).
 * Throws if no valid session exists.
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

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (rows.length === 0) {
    throw new AuthError("Session not found");
  }

  const session = rows[0];
  if (session.expiresAt < new Date()) {
    throw new AuthError("Session expired");
  }

  // Sliding expiry: refresh on each request
  const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
  await db
    .update(sessions)
    .set({ expiresAt: newExpiry })
    .where(eq(sessions.id, sessionId));

  return session.userId;
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
