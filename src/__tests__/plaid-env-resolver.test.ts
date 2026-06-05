import { describe, it, expect } from "vitest";
import { resolvePlaidEnv } from "@/lib/plaid";

describe("resolvePlaidEnv", () => {
  it("throws in production when PLAID_ENV is unset", () => {
    expect(() => resolvePlaidEnv(undefined, "production")).toThrow(/PLAID_ENV/);
  });

  it("throws in production when PLAID_ENV is an invalid value", () => {
    expect(() => resolvePlaidEnv("prod", "production")).toThrow(/PLAID_ENV/);
  });

  it("returns the value in production when it is a valid env", () => {
    expect(resolvePlaidEnv("sandbox", "production")).toBe("sandbox");
  });

  it("defaults to sandbox outside production when PLAID_ENV is unset", () => {
    expect(resolvePlaidEnv(undefined, "development")).toBe("sandbox");
  });
});
