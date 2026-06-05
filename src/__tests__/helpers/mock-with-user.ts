import { vi } from "vitest";

/**
 * Test helpers for routes that now run their DB work inside
 * `withUser(userId, tx => ...)` and call SECURITY DEFINER functions via
 * `db.execute(sql\`...\`)`.
 *
 * `mockWithUser(getTx)` returns a `withUser` mock that invokes the callback
 * with the tx object produced by `getTx()` (called fresh each invocation so a
 * test can mutate the tx between calls). The callback's return value is passed
 * straight through, mirroring the real helper.
 */
export function mockWithUser(getTx: () => unknown) {
  return vi.fn(async (_userId: string, fn: (tx: unknown) => unknown) =>
    fn(getTx())
  );
}
