import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MFA_PENDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface CreateSessionOptions {
  durationMs?: number;
  mfaPending?: boolean;
}

/**
 * Creates a new session for a user. Returns the session ID (to be stored in cookie).
 *
 * Runs on the global `db` via the SECURITY DEFINER `create_session`: sessions
 * are created during pre-auth (login / register / MFA) before any per-user RLS
 * context exists.
 */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<string> {
  const expiresAt = new Date(
    Date.now() + (options.durationMs ?? SESSION_DURATION_MS)
  );

  const rows = (await db.execute(
    sql`select create_session(${userId}, ${expiresAt}, ${options.mfaPending ?? false}) as id`
  )) as unknown as { id: string }[];

  return rows[0].id;
}

/**
 * Deletes a session by ID (logout). Runs on the global `db` via the SECURITY
 * DEFINER `delete_session`.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.execute(sql`select delete_session(${sessionId})`);
}
