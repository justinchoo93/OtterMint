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

import {
  formatCompactCurrency,
  formatSignedPercent,
  formatSignedPoints,
  formatSignedWholeCurrency,
  formatWholeCurrency,
} from "@/lib/format";

describe("formatWholeCurrency", () => {
  it("rounds to whole dollars", () => {
    expect(formatWholeCurrency(396515.6)).toBe("$396,516");
    expect(formatWholeCurrency("1234.49")).toBe("$1,234");
  });
  it("formats negatives and bad input", () => {
    expect(formatWholeCurrency(-1200)).toBe("-$1,200");
    expect(formatWholeCurrency(null)).toBe("$0");
    expect(formatWholeCurrency("abc")).toBe("$0");
  });
});

describe("formatSignedWholeCurrency", () => {
  it("signs gains and losses, and leaves zero unsigned", () => {
    expect(formatSignedWholeCurrency(27555.2)).toBe("+$27,555");
    expect(formatSignedWholeCurrency(-1200)).toBe("-$1,200");
    expect(formatSignedWholeCurrency(0.4)).toBe("$0");
  });
});

describe("formatCompactCurrency", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatCompactCurrency(950)).toBe("$950");
    expect(formatCompactCurrency(5000)).toBe("$5k");
    expect(formatCompactCurrency(7500)).toBe("$7.5k");
    expect(formatCompactCurrency(396516)).toBe("$397k");
    expect(formatCompactCurrency(1_240_000)).toBe("$1.24M");
    expect(formatCompactCurrency(999_700)).toBe("$1.00M");
    expect(formatCompactCurrency(-10000)).toBe("-$10k");
    expect(formatCompactCurrency(0)).toBe("$0");
  });
});

describe("formatSignedPercent", () => {
  it("signs and rounds", () => {
    expect(formatSignedPercent(7.46)).toBe("+7.5%");
    expect(formatSignedPercent(-8.24)).toBe("-8.2%");
    expect(formatSignedPercent(0.04)).toBe("0.0%");
    expect(formatSignedPercent(13.6, 0)).toBe("+14%");
  });
});

describe("formatSignedPoints", () => {
  it("signs a change in percentage points", () => {
    expect(formatSignedPoints(4.46)).toBe("+4.5 pts");
    expect(formatSignedPoints(-0.84)).toBe("-0.8 pts");
    expect(formatSignedPoints(0.04)).toBe("0.0 pts");
    expect(formatSignedPoints(3.6, 0)).toBe("+4 pts");
  });
});
