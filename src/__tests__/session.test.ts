import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

// createSession/deleteSession now call SECURITY DEFINER functions via
// db.execute(sql`select create_session(...)` / `select delete_session(...)`).
vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
  },
}));

import {
  createSession,
  deleteSession,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";

describe("session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSession", () => {
    it("calls create_session and returns the new session id", async () => {
      mockExecute.mockResolvedValue([{ id: "new-session-id" }]);

      const sessionId = await createSession("user-1");
      expect(sessionId).toBe("new-session-id");
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteSession", () => {
    it("calls delete_session", async () => {
      mockExecute.mockResolvedValue([]);

      await deleteSession("sess-1");
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe("SESSION_DURATION_MS", () => {
    it("is 30 days", () => {
      expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
