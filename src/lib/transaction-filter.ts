import type { Transaction } from "plaid";

/**
 * Merchant/name keywords whose transactions should never be persisted.
 *
 * Configured via the EXCLUDED_MERCHANT_KEYWORDS env var (comma-separated,
 * case-insensitive substring match). Kept out of source so the sensitive
 * merchant names never land in git history.
 *
 * Example: EXCLUDED_MERCHANT_KEYWORDS="acme clinic,SQ *PRIVATE"
 */
function excludedKeywords(): string[] {
  return (process.env.EXCLUDED_MERCHANT_KEYWORDS ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * True if a transaction matches any exclusion keyword and should be dropped
 * before ever being written to the database.
 */
export function isExcludedTransaction(
  txn: Pick<Transaction, "name" | "merchant_name">
): boolean {
  const keywords = excludedKeywords();
  if (keywords.length === 0) return false;

  const haystack = `${txn.name ?? ""} ${txn.merchant_name ?? ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}
