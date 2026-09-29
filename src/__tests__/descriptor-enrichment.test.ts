import { describe, expect, it } from "vitest";
import { enrichDescriptors, isUncategorized, type EnrichableRow } from "@/lib/descriptor-enrichment";

function row(name: string, merchantName: string | null, category: string | null, categoryDetailed: string | null): EnrichableRow {
  return { name, merchantName, category, categoryDetailed };
}

const NETFLIX = row("Netflix", "Netflix", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES");
const TRADER_JOES = row("TRADER JOE'S", "Trader Joe's", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
const UBER = row("UBER", "Uber", "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES");
const UBER_EATS = row("UBER EATS", "Uber Eats", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT");
const APPLE = row("APPLE.COM/BILL", "Apple", "ENTERTAINMENT", "ENTERTAINMENT_OTHER_ENTERTAINMENT");

describe("isUncategorized", () => {
  it("treats null and the backfill placeholder as missing, and a detailed category as present", () => {
    expect(isUncategorized({ category: null, categoryDetailed: null })).toBe(true);
    expect(isUncategorized({ category: "UNCATEGORIZED", categoryDetailed: null })).toBe(true);
    expect(isUncategorized({ category: "FOOD_AND_DRINK", categoryDetailed: null })).toBe(false);
    expect(isUncategorized({ category: "UNCATEGORIZED", categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })).toBe(false);
  });
});

describe("enrichDescriptors", () => {
  it("joins a descriptor to its merchant and fills the placeholder category", () => {
    const descriptor = row("NETFLIX.COM 866-579-7172 CA", null, "UNCATEGORIZED", null);
    const [, enriched] = enrichDescriptors([NETFLIX, descriptor]);
    expect(enriched).toEqual(row("NETFLIX.COM 866-579-7172 CA", "Netflix", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"));
  });

  it("keeps a category the row already has", () => {
    const descriptor = row("TRADER JOE S #273 00SEATTLE WA", null, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
    const [, enriched] = enrichDescriptors([row("TJ", "Trader Joe's", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES"), descriptor]);
    expect(enriched.merchantName).toBe("Trader Joe's");
    expect(enriched.categoryDetailed).toBe("FOOD_AND_DRINK_GROCERIES");
  });

  it("prefers the longest matching merchant", () => {
    const descriptor = row("UBER EATS help.uber.com CA", null, "UNCATEGORIZED", null);
    const trip = row("UBER TRIP HTTPS://HELP.UBER.CO", null, "UNCATEGORIZED", null);
    const [, , eats, ride] = enrichDescriptors([UBER, UBER_EATS, descriptor, trip]);
    expect(eats.merchantName).toBe("Uber Eats");
    expect(eats.categoryDetailed).toBe("FOOD_AND_DRINK_RESTAURANT");
    expect(ride.merchantName).toBe("Uber");
  });

  it("matches whole tokens only, and drops processor prefixes before matching", () => {
    const applebees = row("APPLEBEES 123 SEATTLE WA", null, "UNCATEGORIZED", null);
    const bill = row("APPLE.COM/BILL 866-712-7753 CA", null, "UNCATEGORIZED", null);
    const paid = row("AplPay TRADER JOE S SEATTLE WA", null, "UNCATEGORIZED", null);
    const [, , a, b, c] = enrichDescriptors([APPLE, TRADER_JOES, applebees, bill, paid]);
    expect(a.merchantName).toBeNull();
    expect(b.merchantName).toBe("Apple");
    expect(c.merchantName).toBe("Trader Joe's");
    expect(c.categoryDetailed).toBe("FOOD_AND_DRINK_GROCERIES");
  });

  it("ignores merchants with fewer than four letters and rows that already have a merchant", () => {
    const sq = row("SQ", "SQ", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE");
    const descriptor = row("SQ *SOMETHING", null, "UNCATEGORIZED", null);
    const named = row("NETFLIX.COM", "Netflix Inc", null, null);
    const out = enrichDescriptors([sq, NETFLIX, descriptor, named]);
    expect(out[2].merchantName).toBeNull();
    expect(out[3]).toBe(named);
  });

  it("uses the merchant's most common category pair", () => {
    const rows = [
      row("AMAZON", "Amazon", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"),
      row("AMAZON", "Amazon", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"),
      row("AMAZON", "Amazon", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"),
      row("AMAZON", "Amazon", "UNCATEGORIZED", null),
      row("AMAZON.COM*AB12CD SEATTLE WA", null, null, null),
    ];
    const enriched = enrichDescriptors(rows)[4];
    expect(enriched.merchantName).toBe("Amazon");
    expect(enriched.categoryDetailed).toBe("GENERAL_MERCHANDISE_ONLINE_MARKETPLACES");
  });

  it("returns the same array when no row has a merchant name", () => {
    const rows = [row("NETFLIX.COM", null, "UNCATEGORIZED", null)];
    expect(enrichDescriptors(rows)).toBe(rows);
  });
});
