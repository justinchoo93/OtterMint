import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MFA_PENDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface CreateSessionOptions {
  durationMs?: number;
  mfaPending?: boolean;
}

/**
 * Creates a new session for a user. Returns the session ID (to be stored in cookie).
 */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<string> {
  const expiresAt = new Date(
    Date.now() + (options.durationMs ?? SESSION_DURATION_MS)
  );

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt,
      mfaPending: options.mfaPending ?? false,
    })
    .returning();

  return session.id;
}

/**
 * Deletes a session by ID.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
