// The owner's own categories: one transaction at a time, or remembered for
// every similar transaction ("memories"). Pure module, no server-only imports:
// the read helper (src/lib/db/classified-transactions.ts) and the two display
// routes apply the choices, the category routes match, count and validate
// with it, and the picker uses its option types. Plaid's own columns are never
// rewritten; choices win at read time. Rationale and production evidence:
// docs/plans/smart-categorization.md.

import { CUSTOM_PRIMARY_FLOWS, labelForCategoryKey } from "@/lib/cashflow";
import { isUncategorized } from "@/lib/descriptor-enrichment";
import { merchantTokens } from "@/lib/merchant";

export interface CategoryPair {
  category: string;
  categoryDetailed: string;
}

export interface CategoryMemory extends CategoryPair {
  matchKey: string;
}

/** A transaction's names as stored, before descriptor enrichment. */
export interface StoredNames {
  /** The bank's descriptor. */
  name: string;
  /** Plaid's merchant name as stored, or null for a backfilled row. */
  merchantName: string | null;
}

/** The owner's choice for one transaction, stored on the row. */
export interface OwnChoice {
  userCategory?: string | null;
  userCategoryDetailed?: string | null;
}

/**
 * A row as the read helper returns it: `merchantName` may come from descriptor
 * enrichment, `storedMerchantName` is the column as stored.
 */
export interface ReadRow extends OwnChoice {
  id: number;
  name: string;
  merchantName: string | null;
  storedMerchantName: string | null;
}

export type CustomFlow = "income" | "spending" | "savings";

/** Words in the key saved from a descriptor that no Plaid merchant claims. */
const SAVE_TOKENS = 4;
/** Leading descriptor words tried when matching, longest first. A Plaid
    merchant's key is saved whole, and enrichment joins up to five words. */
const MATCH_TOKENS = 5;
/** A descriptor never prefix-matches a key with fewer letters than this. */
const MIN_PREFIX_LETTERS = 4;

function letterCount(key: string): number {
  return key.replace(/ /g, "").length;
}

function keyOf(text: string): string {
  return merchantTokens(text).join(" ");
}

/**
 * The key a memory saved from this row gets: the stored Plaid merchant's key;
 * else the key of the merchant descriptor enrichment joined the row to (by
 * construction a leading run of the descriptor's words); else the
 * descriptor's first four words. Empty when the row cannot be memorized.
 */
export function memoryKeyToSave(stored: StoredNames, enrichedMerchantName: string | null): string {
  const merchant = stored.merchantName?.trim();
  if (merchant) return keyOf(merchant);
  const enriched = enrichedMerchantName?.trim();
  if (enriched) {
    const key = keyOf(enriched);
    if (letterCount(key) >= MIN_PREFIX_LETTERS) return key;
  }
  const key = merchantTokens(stored.name).slice(0, SAVE_TOKENS).join(" ");
  return letterCount(key) >= MIN_PREFIX_LETTERS ? key : "";
}

/** memoryKeyToSave for a row from the read helper. */
export function rowMemoryKey(row: ReadRow): string {
  return memoryKeyToSave({ name: row.name, merchantName: row.storedMerchantName }, row.merchantName);
}

function indexOf<M extends CategoryMemory>(memories: M[]): Map<string, M> {
  return new Map(memories.map((memory) => [memory.matchKey, memory]));
}

function lookup<M extends CategoryMemory>(stored: StoredNames, index: Map<string, M>): M | null {
  if (index.size === 0) return null;
  const merchant = stored.merchantName?.trim();
  if (merchant) return index.get(keyOf(merchant)) ?? null;
  const tokens = merchantTokens(stored.name);
  for (let n = Math.min(tokens.length, MATCH_TOKENS); n >= 1; n--) {
    const key = tokens.slice(0, n).join(" ");
    if (letterCount(key) < MIN_PREFIX_LETTERS) break;
    const memory = index.get(key);
    if (memory) return memory;
  }
  return null;
}

/**
 * The memory that applies to a stored row: for a row with a Plaid merchant
 * name, the memory with exactly its key; for a descriptor-only row, the
 * memory whose key is the longest leading run of its words. Matching reads
 * stored columns only, so the answer never depends on enrichment.
 */
export function findMemory<M extends CategoryMemory>(stored: StoredNames, memories: M[]): M | null {
  return lookup(stored, indexOf(memories));
}

/**
 * The key a save from this row writes: the memory that already decides the
 * row when there is one (so the change reaches the row even when that key is
 * longer than the one the row would save), else rowMemoryKey.
 */
export function memoryKeyForRow(row: ReadRow, memories: CategoryMemory[]): string {
  return findMemory({ name: row.name, merchantName: row.storedMerchantName }, memories)?.matchKey ?? rowMemoryKey(row);
}

function hasOwnChoice(row: OwnChoice): row is { userCategory: string; userCategoryDetailed: string } {
  return Boolean(row.userCategory && row.userCategoryDetailed);
}

/**
 * `processed[i]` (the row after enrichment and the code rules) with the
 * owner's choice for `stored[i]` applied: the transaction's own choice, else
 * a memory, else unchanged (the same object). The arrays are index-aligned.
 * Never mutates.
 */
export function applyUserCategories<
  S extends StoredNames & OwnChoice,
  T extends { category: string | null; categoryDetailed: string | null },
>(stored: S[], processed: T[], memories: CategoryMemory[]): T[] {
  const index = indexOf(memories);
  return processed.map((row, i) => {
    const source = stored[i];
    if (hasOwnChoice(source)) {
      return { ...row, category: source.userCategory, categoryDetailed: source.userCategoryDetailed };
    }
    const memory = lookup(source, index);
    if (memory) return { ...row, category: memory.category, categoryDetailed: memory.categoryDetailed };
    return row;
  });
}

function storedOf(row: ReadRow): StoredNames {
  return { name: row.name, merchantName: row.storedMerchantName };
}

/**
 * The rows each memory decides, by key: rows without their own choice whose
 * winning memory it is. Memories that decide no row are absent.
 */
export function memoryMatches<T extends ReadRow>(rows: T[], memories: CategoryMemory[]): Map<string, T[]> {
  const index = indexOf(memories);
  const matches = new Map<string, T[]>();
  for (const row of rows) {
    if (hasOwnChoice(row)) continue;
    const memory = lookup(storedOf(row), index);
    if (!memory) continue;
    const list = matches.get(memory.matchKey) ?? [];
    list.push(row);
    matches.set(memory.matchKey, list);
  }
  return matches;
}

/**
 * The rows a memory with this key would decide if saved now, alongside the
 * existing memories (a longer key keeps its rows), excluding the given
 * transaction and rows that carry their own choice.
 */
export function similarRows<T extends ReadRow>(
  rows: T[],
  key: string,
  exceptId: number,
  memories: CategoryMemory[] = []
): T[] {
  if (!key) return [];
  const candidate: CategoryMemory = { matchKey: key, category: "", categoryDetailed: "" };
  const withCandidate = [...memories.filter((m) => m.matchKey !== key), candidate];
  return (memoryMatches(rows, withCandidate).get(key) ?? []).filter((row) => row.id !== exceptId);
}

// Channels rather than payees: similar-looking descriptors are different
// people (production check, docs/plans/smart-categorization.md).
const CHANNEL_FIRST_WORDS = new Set(["venmo", "zelle", "paypal", "check"]);

/** False for payment-app, check and cash keys, where similar descriptors are different payees. */
export function defaultApplyToSimilar(key: string): boolean {
  if (!key) return false;
  const words = key.split(" ");
  return !CHANNEL_FIRST_WORDS.has(words[0]) && !words.includes("atm");
}

export interface UncategorizedGroup {
  /** The memory key the group's transactions share ("id:<n>" for a row that cannot be memorized). */
  key: string;
  /** Merchant name or descriptor of the newest transaction. */
  label: string;
  count: number;
  /** Signed sum in Plaid's convention: positive is money out. */
  total: string;
  firstDate: string;
  lastDate: string;
  /** transactions.id of the newest transaction, for opening the picker. */
  id: number;
}

function toCents(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * Posted transactions that still have no category, grouped by the key a
 * memory saved from them would get; largest absolute total first.
 */
export function groupUncategorized<
  T extends ReadRow & {
    amount: string;
    date: string;
    pending: boolean;
    category: string | null;
    categoryDetailed: string | null;
  },
>(rows: T[]): UncategorizedGroup[] {
  const groups = new Map<string, { cents: number; rows: T[] }>();
  for (const row of rows) {
    if (row.pending || !isUncategorized(row)) continue;
    const key = rowMemoryKey(row) || `id:${row.id}`;
    const group = groups.get(key) ?? { cents: 0, rows: [] };
    group.cents += toCents(row.amount);
    group.rows.push(row);
    groups.set(key, group);
  }
  const newestFirst = (a: T, b: T) => b.date.localeCompare(a.date) || b.id - a.id;
  const result: Array<{ cents: number; group: UncategorizedGroup }> = [];
  for (const [key, group] of groups) {
    const sorted = [...group.rows].sort(newestFirst);
    const newest = sorted[0];
    result.push({
      cents: group.cents,
      group: {
        key,
        label: newest.merchantName?.trim() || newest.name,
        count: sorted.length,
        total: (group.cents / 100).toFixed(2),
        firstDate: sorted[sorted.length - 1].date,
        lastDate: newest.date,
        id: newest.id,
      },
    });
  }
  return result
    .sort(
      (a, b) =>
        Math.abs(b.cents) - Math.abs(a.cents) ||
        b.group.count - a.group.count ||
        a.group.label.localeCompare(b.group.label)
    )
    .map((entry) => entry.group);
}

const CUSTOM_PRIMARY_OF: Record<CustomFlow, string> = {
  income: "CUSTOM_INCOME",
  spending: "CUSTOM_SPENDING",
  savings: "CUSTOM_SAVINGS",
};

/**
 * The category pair for a category the owner creates: "Kids activities" as
 * spending is CUSTOM_SPENDING / CUSTOM_SPENDING_KIDS_ACTIVITIES. Null unless
 * the name is 1 to 30 letters, digits and spaces.
 */
export function customCategory(name: string, flow: CustomFlow): CategoryPair | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9 ]{1,30}$/.test(trimmed)) return null;
  const primary = CUSTOM_PRIMARY_OF[flow];
  return { category: primary, categoryDetailed: `${primary}_${trimmed.toUpperCase().replace(/ /g, "_")}` };
}

const KEY_PATTERN = /^[A-Z0-9_]{1,80}$/;

/**
 * A pair the owner may store: upper-case keys, not the placeholder, and a
 * created category's detailed key under one of the three created primaries.
 */
export function isValidCategoryPair(pair: { category: unknown; categoryDetailed: unknown }): pair is CategoryPair {
  const { category, categoryDetailed } = pair;
  if (typeof category !== "string" || typeof categoryDetailed !== "string") return false;
  if (!KEY_PATTERN.test(category) || !KEY_PATTERN.test(categoryDetailed)) return false;
  if (category === "UNCATEGORIZED" || categoryDetailed === "UNCATEGORIZED") return false;
  if (category.startsWith("CUSTOM_") || categoryDetailed.startsWith("CUSTOM_")) {
    return (
      Object.hasOwn(CUSTOM_PRIMARY_FLOWS, category) &&
      categoryDetailed.startsWith(`${category}_`) &&
      categoryDetailed.length > category.length + 1
    );
  }
  return true;
}

export interface CategoryOption extends CategoryPair {
  label: string;
  groupLabel: string;
}

// Offered even before any row carries them: the pairs that change how money
// is counted, and two everyday needs. See the plan's Artifacts and Notes.
const FIXED_PAIRS: CategoryPair[] = [
  { category: "INCOME", categoryDetailed: "INCOME_SALARY" },
  { category: "INCOME", categoryDetailed: "INCOME_INTEREST_EARNED" },
  { category: "INCOME", categoryDetailed: "INCOME_DIVIDENDS" },
  { category: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_SAVINGS" },
  { category: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS" },
  { category: "TRANSFER_IN", categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS" },
  { category: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" },
  { category: "TRANSFER_IN", categoryDetailed: "TRANSFER_IN_ACCOUNT_TRANSFER" },
  { category: "LOAN_PAYMENTS", categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" },
  { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" },
  { category: "RENT_AND_UTILITIES", categoryDetailed: "RENT_AND_UTILITIES_RENT" },
];

/**
 * The picker's list: every pair in the rows or held by a memory, plus the
 * fixed pairs, once each, sorted by group then label.
 */
export function categoryOptions(
  rows: Array<{ category: string | null; categoryDetailed: string | null }>,
  memories: CategoryPair[]
): CategoryOption[] {
  const options = new Map<string, CategoryOption>();
  const add = (category: string | null, categoryDetailed: string | null) => {
    if (!category || !categoryDetailed) return;
    if (!isValidCategoryPair({ category, categoryDetailed })) return;
    const id = `${category}|${categoryDetailed}`;
    if (options.has(id)) return;
    options.set(id, {
      category,
      categoryDetailed,
      label: labelForCategoryKey(categoryDetailed),
      groupLabel: labelForCategoryKey(category),
    });
  };
  for (const pair of FIXED_PAIRS) add(pair.category, pair.categoryDetailed);
  for (const memory of memories) add(memory.category, memory.categoryDetailed);
  for (const row of rows) add(row.category, row.categoryDetailed);
  return [...options.values()].sort(
    (a, b) => a.groupLabel.localeCompare(b.groupLabel) || a.label.localeCompare(b.label)
  );
}
