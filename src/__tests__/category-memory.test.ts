import { describe, expect, it } from "vitest";
import {
  applyUserCategories,
  categoryOptions,
  customCategory,
  defaultApplyToSimilar,
  findMemory,
  groupUncategorized,
  isValidCategoryPair,
  memoryKeyForRow,
  memoryKeyToSave,
  memoryMatches,
  rowMemoryKey,
  similarRows,
  type CategoryMemory,
} from "@/lib/category-memory";

function memory(matchKey: string, categoryDetailed = "FOOD_AND_DRINK_GROCERIES"): CategoryMemory {
  const category = categoryDetailed.startsWith("CUSTOM_")
    ? categoryDetailed.split("_").slice(0, 2).join("_")
    : categoryDetailed.split("_").slice(0, -1).join("_");
  return { matchKey, category, categoryDetailed };
}

let nextId = 1;
function row(
  name: string,
  overrides: Partial<{
    id: number;
    merchantName: string | null;
    storedMerchantName: string | null;
    amount: string;
    date: string;
    pending: boolean;
    category: string | null;
    categoryDetailed: string | null;
    userCategory: string | null;
    userCategoryDetailed: string | null;
  }> = {}
) {
  const merchantName = overrides.merchantName ?? null;
  return {
    id: nextId++,
    name,
    merchantName,
    storedMerchantName: merchantName,
    amount: "10.00",
    date: "2026-03-01",
    pending: false,
    category: "UNCATEGORIZED" as string | null,
    categoryDetailed: null as string | null,
    userCategory: null as string | null,
    userCategoryDetailed: null as string | null,
    ...overrides,
  };
}

describe("matching", () => {
  it("matches a Plaid merchant and its descriptor on one key", () => {
    const memories = [memory("trader joe s")];
    expect(findMemory({ name: "TRADER JOE'S", merchantName: "Trader Joe's" }, memories)).toBe(memories[0]);
    expect(findMemory({ name: "TRADER JOE S #273 00SEATTLE WA", merchantName: null }, memories)).toBe(memories[0]);
  });

  it("saves the enriched merchant's key for a joined descriptor, else its first four words", () => {
    expect(memoryKeyToSave({ name: "TRADER JOE S #273 00SEATTLE WA", merchantName: null }, "Trader Joe's")).toBe(
      "trader joe s"
    );
    expect(memoryKeyToSave({ name: "Structured Light PAYROLL PPD ID: 9P70305585", merchantName: null }, null)).toBe(
      "structured light payroll ppd"
    );
    expect(memoryKeyToSave({ name: "TRADER JOE'S", merchantName: "Trader Joe's" }, "Trader Joe's")).toBe(
      "trader joe s"
    );
  });

  it("lets a five-word merchant key match a descriptor that starts with those words", () => {
    const memories = [memory("ridgewood bottle and tap house")];
    expect(
      findMemory({ name: "RIDGEWOOD BOTTLE AND TAP HOUSE SEATTLE WA", merchantName: null }, memories)
    ).toBe(memories[0]);
  });

  it("matches brokerage debits but not the credits that look like them", () => {
    const memories = [memory("manual db bkrg", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS")];
    expect(findMemory({ name: "MANUAL DB-BKRG 08/14", merchantName: null }, memories)).toBe(memories[0]);
    expect(findMemory({ name: "Manual CR-Bkrg", merchantName: null }, memories)).toBeNull();
  });

  it("matches Plaid-named rows exactly and descriptors by prefix", () => {
    const memories = [memory("apple", "GENERAL_MERCHANDISE_ELECTRONICS")];
    expect(findMemory({ name: "Apple Cash Sent", merchantName: "Apple Cash" }, memories)).toBeNull();
    expect(findMemory({ name: "APPLE.COM/BILL 866-712-7753 CA", merchantName: null }, memories)).toBe(memories[0]);
  });

  it("matches a short merchant key exactly but never by descriptor prefix", () => {
    const memories = [memory("cvs", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS")];
    expect(findMemory({ name: "CVS", merchantName: "CVS" }, memories)).toBe(memories[0]);
    expect(findMemory({ name: "CVS PHARMACY #11679 SEATTLE", merchantName: null }, memories)).toBeNull();
    expect(memoryKeyToSave({ name: "CVS", merchantName: "CVS" }, "CVS")).toBe("cvs");
    expect(memoryKeyToSave({ name: "BP 1234", merchantName: null }, null)).toBe("");
  });

  it("lets the longest matching memory win", () => {
    const memories = [memory("uber", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES"), memory("uber eats", "FOOD_AND_DRINK_RESTAURANT")];
    expect(findMemory({ name: "UBER EATS help.uber.com CA", merchantName: null }, memories)?.matchKey).toBe("uber eats");
    expect(findMemory({ name: "UBER TRIP HTTPS://HELP.UBER.CO", merchantName: null }, memories)?.matchKey).toBe("uber");
  });

  it("starts unticked for payment apps, checks and cash", () => {
    for (const key of ["venmo payment web", "zelle payment to mom", "check", "non chase atm withdraw", "paypal transfer"]) {
      expect(defaultApplyToSimilar(key)).toBe(false);
    }
    expect(defaultApplyToSimilar("trader joe s")).toBe(true);
    expect(defaultApplyToSimilar("")).toBe(false);
  });
});

describe("applyUserCategories", () => {
  it("gives a descriptor row the same answer whether or not enrichment named it", () => {
    const stored = [row("TRADER JOE S #273 00SEATTLE WA")];
    const enriched = [{ ...stored[0], merchantName: "Trader Joe's" }];
    const memories = [memory("trader joe s")];
    expect(applyUserCategories(stored, enriched, memories)[0].categoryDetailed).toBe("FOOD_AND_DRINK_GROCERIES");
    expect(applyUserCategories(stored, stored, memories)[0].categoryDetailed).toBe("FOOD_AND_DRINK_GROCERIES");
  });

  it("puts the transaction's own choice over a memory, and a memory over the code rules", () => {
    const own = row("RIVER. RECUR BUY 123 WEB ID: 1", {
      userCategory: "CUSTOM_SAVINGS",
      userCategoryDetailed: "CUSTOM_SAVINGS_BITCOIN",
    });
    const plain = row("RIVER. RECUR BUY 456 WEB ID: 2");
    // As the code rules leave them: River buys are savings transfers.
    const processed = [own, plain].map((r) => ({ ...r, category: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_SAVINGS" }));
    const result = applyUserCategories([own, plain], processed, [memory("river recur buy", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS")]);
    expect(result[0].categoryDetailed).toBe("CUSTOM_SAVINGS_BITCOIN");
    expect(result[1].categoryDetailed).toBe("TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS");
  });

  it("returns untouched rows as the same objects and never mutates", () => {
    const stored = [row("NETFLIX.COM 866-579-7172 CA"), row("SOMETHING ELSE ENTIRELY")];
    const snapshot = JSON.stringify(stored);
    const result = applyUserCategories(stored, stored, [memory("netflix", "ENTERTAINMENT_TV_AND_MOVIES")]);
    expect(result[1]).toBe(stored[1]);
    expect(result[0]).not.toBe(stored[0]);
    expect(JSON.stringify(stored)).toBe(snapshot);
  });
});

describe("similarRows and memoryMatches", () => {
  it("counts the rows a new memory would decide, excluding the row itself and rows with their own choice", () => {
    const a = row("MONKEY GRIND SEATTLE WA 1");
    const b = row("MONKEY GRIND SEATTLE WA 2");
    const c = row("MONKEY GRIND SEATTLE WA 3", { userCategory: "FOOD_AND_DRINK", userCategoryDetailed: "FOOD_AND_DRINK_COFFEE" });
    const d = row("SOMEWHERE ELSE");
    const key = rowMemoryKey(a);
    expect(key).toBe("monkey grind seattle");
    expect(similarRows([a, b, c, d], key, a.id).map((r) => r.id)).toEqual([b.id]);
  });

  it("saves into the memory that already decides a row", () => {
    const coffee = row("MONKEY GRIND SEATTLE WA 7", { merchantName: "Monkey Grind", storedMerchantName: null });
    expect(rowMemoryKey(coffee)).toBe("monkey grind");
    expect(memoryKeyForRow(coffee, [])).toBe("monkey grind");
    expect(memoryKeyForRow(coffee, [memory("monkey grind seattle", "FOOD_AND_DRINK_COFFEE")])).toBe("monkey grind seattle");
  });

  it("leaves rows to an existing longer memory", () => {
    const eats = row("UBER EATS help.uber.com CA");
    const trip = row("UBER TRIP HTTPS://HELP.UBER.CO");
    const memories = [memory("uber eats", "FOOD_AND_DRINK_RESTAURANT")];
    expect(similarRows([eats, trip], "uber", -1, memories).map((r) => r.id)).toEqual([trip.id]);
    expect(memoryMatches([eats, trip], memories).get("uber eats")?.map((r) => r.id)).toEqual([eats.id]);
  });
});

describe("groupUncategorized", () => {
  it("groups by memory key, skips pending and categorized rows, and sorts by absolute total", () => {
    const rows = [
      row("NETFLIX.COM 866-579-7172 CA", { amount: "15.49", date: "2025-02-01" }),
      row("NETFLIX.COM 866-579-7172 CA", { amount: "15.49", date: "2025-03-01" }),
      row("ACME PAYROLL PPD 123", { amount: "-2000.00", date: "2025-03-15" }),
      row("ACME PAYROLL PPD 456", { amount: "-2000.00", date: "2025-03-31", pending: true }),
      row("COFFEE SHOP", { amount: "4.00", category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE" }),
      row("TRADER JOE S #273 00SEATTLE WA", { amount: "50.00", date: "2025-01-05", merchantName: "Trader Joe's", storedMerchantName: null }),
    ];
    const groups = groupUncategorized(rows);
    expect(groups.map((g) => g.key)).toEqual(["acme payroll ppd", "trader joe s", "netflix"]);
    expect(groups[0]).toMatchObject({ count: 1, total: "-2000.00", firstDate: "2025-03-15", lastDate: "2025-03-15", id: rows[2].id });
    expect(groups[1]).toMatchObject({ label: "Trader Joe's", count: 1, total: "50.00" });
    expect(groups[2]).toMatchObject({ count: 2, total: "30.98", firstDate: "2025-02-01", lastDate: "2025-03-01", id: rows[1].id });
  });

  it("keeps a row that cannot be memorized as its own group", () => {
    const lone = row("BP 1234", { amount: "40.00" });
    expect(groupUncategorized([lone])).toEqual([
      expect.objectContaining({ key: `id:${lone.id}`, label: "BP 1234", count: 1 }),
    ]);
  });
});

describe("created categories", () => {
  it("encodes the flow and the name in the keys", () => {
    expect(customCategory("Kids activities", "spending")).toEqual({
      category: "CUSTOM_SPENDING",
      categoryDetailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES",
    });
    expect(customCategory("  Side   gig ", "income")?.categoryDetailed).toBe("CUSTOM_INCOME_SIDE_GIG");
    expect(customCategory("Kids' stuff", "spending")).toBeNull();
    expect(customCategory("   ", "spending")).toBeNull();
    expect(customCategory("x".repeat(31), "savings")).toBeNull();
  });

  it("validates stored pairs", () => {
    expect(isValidCategoryPair({ category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })).toBe(true);
    expect(isValidCategoryPair({ category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_KIDS" })).toBe(true);
    expect(isValidCategoryPair({ category: "CUSTOM_INCOME", categoryDetailed: "CUSTOM_SPENDING_KIDS" })).toBe(false);
    expect(isValidCategoryPair({ category: "CUSTOM_OTHER", categoryDetailed: "CUSTOM_OTHER_KIDS" })).toBe(false);
    expect(isValidCategoryPair({ category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_" })).toBe(false);
    expect(isValidCategoryPair({ category: "UNCATEGORIZED", categoryDetailed: "UNCATEGORIZED" })).toBe(false);
    expect(isValidCategoryPair({ category: "food", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })).toBe(false);
    expect(isValidCategoryPair({ category: "FOOD_AND_DRINK", categoryDetailed: 3 })).toBe(false);
  });

  it("offers each pair in the rows or the memories once, the fixed pairs, and never the placeholder", () => {
    const options = categoryOptions(
      [
        { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE" },
        { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE" },
        { category: "UNCATEGORIZED", categoryDetailed: null },
        { category: "TRANSFER_IN", categoryDetailed: null },
      ],
      [{ category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES" }]
    );
    const keys = options.map((o) => o.categoryDetailed);
    expect(keys.filter((k) => k === "FOOD_AND_DRINK_COFFEE")).toHaveLength(1);
    expect(keys).toContain("CUSTOM_SPENDING_KIDS_ACTIVITIES");
    expect(keys).toContain("INCOME_SALARY");
    expect(keys).toContain("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
    expect(keys.some((k) => k.includes("UNCATEGORIZED"))).toBe(false);
    expect(options.find((o) => o.categoryDetailed === "CUSTOM_SPENDING_KIDS_ACTIVITIES")).toMatchObject({
      label: "Kids Activities",
      groupLabel: "Custom Spending",
    });
  });
});
