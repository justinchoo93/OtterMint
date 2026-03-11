export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export const MAX_MFA_ATTEMPTS = 5;
export const MFA_LOCKOUT_MS = 10 * 60 * 1000;

interface LockoutStateInput {
  failedAttempts: number;
  maxAttempts: number;
  lockoutMs: number;
  now?: Date;
}

interface LockoutStateResult {
  failedAttempts: number;
  lockedUntil: Date | null;
  isLocked: boolean;
}

export function isCurrentlyLocked(
  lockedUntil: Date | null | undefined,
  now = new Date()
): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function getLockoutState({
  failedAttempts,
  maxAttempts,
  lockoutMs,
  now = new Date(),
}: LockoutStateInput): LockoutStateResult {
  const nextFailedAttempts = failedAttempts + 1;
  if (nextFailedAttempts < maxAttempts) {
    return {
      failedAttempts: nextFailedAttempts,
      lockedUntil: null,
      isLocked: false,
    };
  }

  return {
    failedAttempts: 0,
    lockedUntil: new Date(now.getTime() + lockoutMs),
    isLocked: true,
  };
}

export function formatLockoutMessage(
  lockedUntil: Date,
  prefix: string,
  now = new Date()
): string {
  const remainingMs = Math.max(lockedUntil.getTime() - now.getTime(), 0);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return `${prefix} Try again in ${remainingMinutes} minute${
    remainingMinutes === 1 ? "" : "s"
  }.`;
}
