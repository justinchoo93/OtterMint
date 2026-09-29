// Joins backfilled bank descriptors (rows with no Plaid merchant name) to the
// Plaid merchant they belong to, and fills a missing category from that
// merchant's usual one. Pure and read-time: the database is never written.
// Rationale and evidence: docs/plans/descriptor-enrichment.md.

import { merchantTokens } from "@/lib/merchant";

export interface EnrichableRow {
  /** The bank's descriptor. */
  name: string;
  /** Plaid's clean merchant name, or null for a backfilled row. */
  merchantName: string | null;
  category: string | null;
  categoryDetailed: string | null;
}

/** A merchant's tokens must hold this many letters to be a join target. */
const MIN_KEY_LETTERS = 4;
/** How many leading descriptor tokens are tried, longest first. */
const MAX_PREFIX_TOKENS = 5;

/** No category at all, or the backfill's placeholder. */
export function isUncategorized(row: Pick<EnrichableRow, "category" | "categoryDetailed">): boolean {
  return row.categoryDetailed === null && (row.category === null || row.category === "UNCATEGORIZED");
}

interface CategoryCount {
  category: string | null;
  categoryDetailed: string | null;
  count: number;
}

interface MerchantEntry {
  merchantName: string;
  categories: Map<string, CategoryCount>;
}

/**
 * Return the rows with each descriptor-only row joined to the Plaid merchant
 * whose tokens are a prefix of the descriptor's tokens (longest merchant
 * first). A joined row gains the merchant's name, and its categories when it
 * had none. Rows that already carry a merchant name are returned as they are,
 * and so is the whole array when no row has one.
 */
export function enrichDescriptors<T extends EnrichableRow>(rows: T[]): T[] {
  const index = new Map<string, MerchantEntry>();
  for (const row of rows) {
    const merchantName = row.merchantName?.trim();
    if (!merchantName) continue;
    const tokens = merchantTokens(merchantName);
    if (tokens.join("").length < MIN_KEY_LETTERS) continue;
    const key = tokens.join(" ");
    let entry = index.get(key);
    if (!entry) {
      entry = { merchantName, categories: new Map() };
      index.set(key, entry);
    }
    if (!isUncategorized(row)) {
      const pair = `${row.category ?? ""}|${row.categoryDetailed ?? ""}`;
      const count = entry.categories.get(pair) ?? {
        category: row.category,
        categoryDetailed: row.categoryDetailed,
        count: 0,
      };
      count.count++;
      entry.categories.set(pair, count);
    }
  }
  if (index.size === 0) return rows;

  return rows.map((row) => {
    if (row.merchantName?.trim()) return row;
    const tokens = merchantTokens(row.name);
    for (let n = Math.min(tokens.length, MAX_PREFIX_TOKENS); n >= 1; n--) {
      const entry = index.get(tokens.slice(0, n).join(" "));
      if (!entry) continue;
      const enriched: T = { ...row, merchantName: entry.merchantName };
      if (isUncategorized(row)) {
        let best: CategoryCount | null = null;
        for (const candidate of entry.categories.values()) {
          if (!best || candidate.count > best.count) best = candidate;
        }
        if (best) {
          enriched.category = best.category;
          enriched.categoryDetailed = best.categoryDetailed;
        }
      }
      return enriched;
    }
    return row;
  });
}
