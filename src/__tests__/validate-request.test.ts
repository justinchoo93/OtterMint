import { describe, it, expect } from "vitest";
import {
  FIELD_LIMITS,
  validateBoundedString,
  validateOptionalBoundedString,
  validateEmail,
  validateBoundedInteger,
} from "@/lib/validate-request";

describe("validateBoundedString", () => {
  it("accepts a normal string", () => {
    expect(validateBoundedString("River", "name", 200)).toEqual({ success: true });
  });

  it("rejects non-strings", () => {
    const result = validateBoundedString(42, "name", 200);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("name");
  });

  it("rejects empty/whitespace-only", () => {
    const result = validateBoundedString("   ", "name", 200);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("name is required");
  });

  it("rejects a string longer than the cap (raw length)", () => {
    const result = validateBoundedString("a".repeat(201), "name", 200);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("name must be 200 characters or fewer");
  });

  it("rejects whitespace-padded strings whose raw length exceeds the cap", () => {
    const result = validateBoundedString(" " + "a".repeat(200), "name", 200);
    expect(result.success).toBe(false);
  });

  it("accepts a string exactly at the cap", () => {
    expect(validateBoundedString("a".repeat(200), "name", 200)).toEqual({ success: true });
  });
});

describe("validateOptionalBoundedString", () => {
  it("accepts undefined", () => {
    expect(validateOptionalBoundedString(undefined, "notes", 1000)).toEqual({ success: true });
  });

  it("accepts null", () => {
    expect(validateOptionalBoundedString(null, "notes", 1000)).toEqual({ success: true });
  });

  it("accepts trimmed-empty", () => {
    expect(validateOptionalBoundedString("   ", "notes", 1000)).toEqual({ success: true });
  });

  it("rejects an oversized string", () => {
    const result = validateOptionalBoundedString("a".repeat(1001), "notes", 1000);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("notes");
  });

  it("accepts an in-range string", () => {
    expect(validateOptionalBoundedString("a note", "notes", 1000)).toEqual({ success: true });
  });
});

describe("validateEmail", () => {
  it("accepts a@b.com", () => {
    expect(validateEmail("a@b.com")).toEqual({ success: true });
  });

  it("rejects notanemail", () => {
    expect(validateEmail("notanemail").success).toBe(false);
  });

  it("rejects a missing @", () => {
    expect(validateEmail("ab.com").success).toBe(false);
  });

  it("rejects a missing domain dot", () => {
    expect(validateEmail("a@b").success).toBe(false);
  });

  it("rejects an oversized address", () => {
    const long = "a".repeat(320) + "@b.com";
    expect(validateEmail(long).success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(validateEmail(42).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateEmail("").success).toBe(false);
  });
});

describe("validateBoundedInteger", () => {
  it("accepts an in-range integer", () => {
    expect(validateBoundedInteger(30, "expiresInDays", 1, 365)).toEqual({ success: true });
  });

  it("rejects non-numbers", () => {
    const result = validateBoundedInteger("30", "expiresInDays", 1, 365);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("expiresInDays");
  });

  it("rejects non-integers", () => {
    expect(validateBoundedInteger(1.5, "expiresInDays", 1, 365).success).toBe(false);
  });

  it("rejects below min", () => {
    expect(validateBoundedInteger(0, "expiresInDays", 1, 365).success).toBe(false);
  });

  it("rejects above max", () => {
    expect(validateBoundedInteger(366, "expiresInDays", 1, 365).success).toBe(false);
  });

  it("accepts min and max boundaries", () => {
    expect(validateBoundedInteger(1, "expiresInDays", 1, 365)).toEqual({ success: true });
    expect(validateBoundedInteger(365, "expiresInDays", 1, 365)).toEqual({ success: true });
  });
});

describe("FIELD_LIMITS", () => {
  it("exposes the documented caps", () => {
    expect(FIELD_LIMITS.NAME).toBe(200);
    expect(FIELD_LIMITS.NOTES).toBe(1000);
    expect(FIELD_LIMITS.EMAIL).toBe(320);
  });
});
