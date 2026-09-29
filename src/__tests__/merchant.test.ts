import { describe, expect, it } from "vitest";
import { merchantKey, merchantTokens } from "@/lib/merchant";

describe("merchantTokens", () => {
  it("strips domains, phone numbers and trailing state codes from a descriptor", () => {
    expect(merchantTokens("NETFLIX.COM 866-579-7172 CA")).toEqual(["netflix"]);
    expect(merchantTokens("HLU*HULUPLUS HULU.COM/BILL CA")).toEqual(["hlu", "huluplus", "hulu", "bill"]);
    expect(merchantTokens("UBER TRIP HTTPS://HELP.UBER.CO")).toEqual(["uber", "trip", "help", "uber"]);
  });

  it("makes a merchant name and its bank descriptor agree", () => {
    expect(merchantTokens("Trader Joe's")).toEqual(["trader", "joe", "s"]);
    expect(merchantTokens("TRADER JOE S #273 00SEATTLE WA")).toEqual(["trader", "joe", "s", "seattle"]);
    expect(merchantTokens("City Light & Power")).toEqual(["city", "light", "power"]);
  });

  it("drops a leading payment-processor phrase", () => {
    expect(merchantTokens("AplPay TRADER JOE S SEATTLE WA")).toEqual(["trader", "joe", "s", "seattle"]);
    expect(merchantTokens("Recurring Card Purchase 03/08 SPOTIFY")).toEqual(["spotify"]);
    expect(merchantTokens("SQ *BLUE BOTTLE COFFEE")).toEqual(["blue", "bottle", "coffee"]);
    // A processor's own name is not a prefix of nothing.
    expect(merchantTokens("PayPal")).toEqual(["paypal"]);
  });

  it("never drops the last token", () => {
    expect(merchantTokens("CA")).toEqual(["ca"]);
    expect(merchantTokens("Costco WA")).toEqual(["costco"]);
  });
});

describe("merchantKey", () => {
  it("prefers the merchant name and falls back to the descriptor", () => {
    expect(merchantKey({ merchantName: "Netflix", name: "NETFLIX.COM 866-579-7172 CA" })).toBe("netflix");
    expect(merchantKey({ merchantName: null, name: "NETFLIX.COM 866-579-7172 CA" })).toBe("netflix");
    expect(merchantKey({ merchantName: "  ", name: "MEDIUM MONTHLY MEDIUM.COM CA" })).toBe("medium monthly medium");
  });
});
