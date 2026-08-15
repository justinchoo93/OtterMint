// User-owned category corrections for transactions Plaid mislabels. Pure
// module, no server-only imports: applied by the analytics query helper
// (src/lib/db/classified-transactions.ts) and mapped over rows in the two
// display routes. Raw Plaid categories stay untouched in the database — sync
// rewrites them on every refresh, so corrections live here, at read time.
// Rationale and evidence: docs/plans/category-correction-rules.md.

export interface CategoryRule {
  /** Case-insensitive test against the transaction's `name`. */
  pattern: RegExp;
  /** Replacement Plaid primary category. */
  category: string;
  /** Replacement Plaid detailed category. */
  categoryDetailed: string;
  /** Why this rule exists — for maintainers, never shown to users. */
  reason: string;
}

// Ordered: the first rule whose pattern matches wins.
export const CATEGORY_RULES: CategoryRule[] = [
  {
    pattern: /\bCR-BKRG\b/i,
    category: "TRANSFER_IN",
    categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
    reason:
      "Chase manual brokerage credits ('Manual CR-Bkrg') are money returning from a brokerage; Plaid tags them INCOME_CONTRACTOR.",
  },
];

/**
 * Return the row with its categories corrected by the first matching rule,
 * or the row itself (same object) when no rule matches. Never mutates.
 */
export function applyCategoryRules<
  T extends {
    name: string;
    category: string | null;
    categoryDetailed: string | null;
  },
>(row: T): T {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(row.name)) {
      return {
        ...row,
        category: rule.category,
        categoryDetailed: rule.categoryDetailed,
      };
    }
  }
  return row;
}
