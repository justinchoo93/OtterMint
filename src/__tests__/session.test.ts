import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockDelete } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    delete: mockDelete,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  sessions: { id: "id", userId: "user_id", expiresAt: "expires_at" },
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
    it("inserts a session row and returns session id", async () => {
      const mockReturning = vi.fn().mockResolvedValue([
        { id: "new-session-id", userId: "user-1", expiresAt: new Date() },
      ]);
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      });

      const sessionId = await createSession("user-1");
      expect(sessionId).toBe("new-session-id");
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("deleteSession", () => {
    it("deletes the session row", async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      await deleteSession("sess-1");
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe("SESSION_DURATION_MS", () => {
    it("is 30 days", () => {
      expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
