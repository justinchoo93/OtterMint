import { plaidClient } from "@/lib/plaid";
import { investmentTransactions } from "@/lib/db/schema";
import { inArray, max } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/with-user";

interface SyncInvestmentTransactionsResult {
  count: number;
}

const PAGE_SIZE = 500;
const FIRST_SYNC_MONTHS = 24;
const OVERLAP_DAYS = 7;

/**
 * Pull in-account brokerage activity (buys, sells, dividends, cash moves)
 * from Plaid's investments-transactions feed. Date-windowed with offset
 * pagination (not cursor-based): the first sync requests the trailing 24
 * months; later syncs re-request from the last stored date minus 7 days so
 * interrupted runs self-repair via the unique-id upsert.
 *
 * NOTE: the EXCLUDED_MERCHANT_KEYWORDS privacy filter intentionally does not
 * apply here — these rows carry security names, not merchants (see
 * docs/plans/investment-performance.md, Milestone 6).
 */
export async function syncInvestmentTransactions(
  accessToken: string,
  investmentAccountIds: string[],
  userId: string,
  executor: DbExecutor
): Promise<SyncInvestmentTransactionsResult> {
  if (investmentAccountIds.length === 0) return { count: 0 };

  const [latest] = await executor
    .select({ maxDate: max(investmentTransactions.date) })
    .from(investmentTransactions)
    .where(inArray(investmentTransactions.accountId, investmentAccountIds));

  const start = new Date();
  if (latest?.maxDate) {
    start.setTime(new Date(`${latest.maxDate}T00:00:00Z`).getTime());
    start.setUTCDate(start.getUTCDate() - OVERLAP_DAYS);
  } else {
    start.setUTCMonth(start.getUTCMonth() - FIRST_SYNC_MONTHS);
  }
  const startDate = start.toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  let offset = 0;
  let total = Infinity;
  let count = 0;

  while (offset < total) {
    const response = await plaidClient.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        account_ids: investmentAccountIds,
        count: PAGE_SIZE,
        offset,
      },
    });

    const page = response.data.investment_transactions;
    total = response.data.total_investment_transactions;
    offset += page.length;
    if (page.length === 0) break;

    for (const txn of page) {
      count += 1;
      await executor
        .insert(investmentTransactions)
        .values({
          userId,
          accountId: txn.account_id,
          investmentTransactionId: txn.investment_transaction_id,
          securityId: txn.security_id ?? null,
          date: txn.date,
          name: txn.name,
          amount: txn.amount.toString(),
          type: txn.type,
          subtype: txn.subtype ?? null,
          quantity: txn.quantity?.toString() ?? null,
          price: txn.price?.toString() ?? null,
          isoCurrencyCode: txn.iso_currency_code ?? "USD",
        })
        .onConflictDoUpdate({
          target: investmentTransactions.investmentTransactionId,
          set: {
            amount: txn.amount.toString(),
            date: txn.date,
            name: txn.name,
            type: txn.type,
            subtype: txn.subtype ?? null,
            quantity: txn.quantity?.toString() ?? null,
            price: txn.price?.toString() ?? null,
          },
        });
    }
  }

  return { count };
}
