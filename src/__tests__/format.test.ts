import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats a positive number", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats a negative number", () => {
    expect(formatCurrency(-500.1)).toBe("-$500.10");
  });

  it("formats a string number", () => {
    expect(formatCurrency("9999.99")).toBe("$9,999.99");
  });

  it("handles null", () => {
    expect(formatCurrency(null)).toBe("$0.00");
  });

  it("handles undefined", () => {
    expect(formatCurrency(undefined)).toBe("$0.00");
  });

  it("handles NaN string", () => {
    expect(formatCurrency("not-a-number")).toBe("$0.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatCurrency(10.999)).toBe("$11.00");
  });

  it("formats large numbers with commas", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });
});
