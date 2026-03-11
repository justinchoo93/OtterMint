import { describe, expect, it } from "vitest";
import {
  formatLockoutMessage,
  getLockoutState,
  isCurrentlyLocked,
  LOGIN_LOCKOUT_MS,
  MAX_LOGIN_ATTEMPTS,
  MAX_MFA_ATTEMPTS,
  MFA_LOCKOUT_MS,
} from "@/lib/auth/login-lockout";

describe("login lockout helpers", () => {
  it("increments failed attempts before lockout", () => {
    const state = getLockoutState({
      failedAttempts: 2,
      maxAttempts: MAX_LOGIN_ATTEMPTS,
      lockoutMs: LOGIN_LOCKOUT_MS,
      now: new Date("2026-03-11T00:00:00.000Z"),
    });

    expect(state).toEqual({
      failedAttempts: 3,
      lockedUntil: null,
      isLocked: false,
    });
  });

  it("locks once max attempts are reached", () => {
    const now = new Date("2026-03-11T00:00:00.000Z");
    const state = getLockoutState({
      failedAttempts: MAX_MFA_ATTEMPTS - 1,
      maxAttempts: MAX_MFA_ATTEMPTS,
      lockoutMs: MFA_LOCKOUT_MS,
      now,
    });

    expect(state.failedAttempts).toBe(0);
    expect(state.isLocked).toBe(true);
    expect(state.lockedUntil?.toISOString()).toBe("2026-03-11T00:10:00.000Z");
  });

  it("detects active lockouts", () => {
    expect(
      isCurrentlyLocked(
        new Date("2026-03-11T00:10:00.000Z"),
        new Date("2026-03-11T00:05:00.000Z")
      )
    ).toBe(true);

    expect(
      isCurrentlyLocked(
        new Date("2026-03-11T00:10:00.000Z"),
        new Date("2026-03-11T00:10:00.000Z")
      )
    ).toBe(false);
  });

  it("formats user-facing lockout messages", () => {
    const message = formatLockoutMessage(
      new Date("2026-03-11T00:02:00.000Z"),
      "Too many attempts.",
      new Date("2026-03-11T00:00:30.000Z")
    );

    expect(message).toBe("Too many attempts. Try again in 2 minutes.");
  });
});
