import { sql } from "drizzle-orm";
import { getDb } from "./index";

/**
 * Runs `fn` inside a single transaction with the Postgres session variable
 * `app.current_user_id` set to `userId`. Every Row-Level Security policy keys
 * on that variable (a transaction-scoped GUC — Grand Unified Configuration
 * variable), so all queries issued via the provided transaction handle `tx`
 * are automatically scoped to `userId`.
 *
 * Why a transaction: `set_config(name, value, is_local=true)` is the function
 * form of `SET LOCAL`, so the value lives and dies with this transaction. That
 * (a) prevents the value leaking to the next request on a pooled connection,
 * and (b) keeps all statements on one backend connection under pgBouncer
 * transaction-mode pooling.
 *
 * Why `set_config` rather than literal `SET LOCAL app.current_user_id = '...'`:
 * `SET LOCAL` does not accept bound parameters, so building it would require
 * string-concatenating the uuid into SQL. `set_config(...)` takes a real bound
 * parameter (here via drizzle's `sql` tag), eliminating any injection risk.
 */
export async function withUser<T>(
  userId: string,
  fn: (
    tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]
  ) => Promise<T>
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${userId}, true)`
    );
    return fn(tx);
  });
}
