import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, defaultPlan } from "@/lib/fire-model";
import { validateFirePlan } from "@/lib/validate-fire-plan";

function typed(overrides: Record<string, unknown> = {}) {
  return { id: "river", name: " River ", owner: "you", kind: "crypto", balance: 15000, contributionYearly: 0, ...overrides };
}

describe("validateFirePlan", () => {
  it("accepts the default plan", () => {
    expect(validateFirePlan(defaultPlan())).toEqual({ success: true, plan: defaultPlan() });
  });

  it("fills missing assumptions with defaults, drops unknown keys and trims names", () => {
    const result = validateFirePlan({
      version: 1,
      assumptions: { yourAge: 41, spendingMonthly: null, surprise: 1 },
      appAccounts: { "plaid:Abc_123": { kind: "excluded", owner: "partner", contributionYearly: 24500, extra: true } },
      typedAccounts: [typed()],
      extra: "dropped",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.plan.assumptions).toEqual({ ...DEFAULT_ASSUMPTIONS, yourAge: 41 });
    expect(result.plan.appAccounts).toEqual({ "plaid:Abc_123": { kind: "excluded", owner: "partner", contributionYearly: 24500 } });
    expect(result.plan.typedAccounts[0].name).toBe("River");
    expect(Object.keys(result.plan)).toEqual(["version", "assumptions", "appAccounts", "typedAccounts"]);
  });

  it("rejects out-of-range and malformed numbers", () => {
    expect(validateFirePlan({ version: 1, assumptions: { ssYouClaimAge: 61 } })).toEqual({
      success: false,
      error: "ssYouClaimAge must be a number from 62 to 70",
    });
    expect(validateFirePlan({ version: 1, assumptions: { yourAge: "41" } }).success).toBe(false);
    expect(validateFirePlan({ version: 1, assumptions: { healthMonthly: null } }).success).toBe(false);
    expect(validateFirePlan({ version: 1, assumptions: { yourAge: 60, planAge: 60 } })).toEqual({
      success: false,
      error: "planAge must be above yourAge",
    });
  });

  it("rejects a bad version, owners, kinds and keys", () => {
    expect(validateFirePlan({ version: 2 }).success).toBe(false);
    expect(validateFirePlan(null).success).toBe(false);
    expect(validateFirePlan({ version: 1, assumptions: { pensionOwner: "neighbor" } }).success).toBe(false);
    expect(validateFirePlan({ version: 1, appAccounts: { "evil:1": {} } }).success).toBe(false);
    expect(validateFirePlan({ version: 1, appAccounts: { "manual:1": { kind: "house" } } }).success).toBe(false);
    expect(validateFirePlan({ version: 1, typedAccounts: [typed({ kind: "excluded" })] }).success).toBe(false);
    expect(validateFirePlan({ version: 1, typedAccounts: [typed({ owner: "kid" })] }).success).toBe(false);
    expect(validateFirePlan({ version: 1, typedAccounts: [typed({ name: "   " })] }).success).toBe(false);
    expect(validateFirePlan({ version: 1, typedAccounts: [typed({ balance: -1 })] }).success).toBe(false);
    expect(validateFirePlan({ version: 1, typedAccounts: [typed({ id: "Has Spaces" })] }).success).toBe(false);
  });

  it("rejects duplicate ids and too many accounts", () => {
    expect(validateFirePlan({ version: 1, typedAccounts: [typed(), typed()] })).toEqual({
      success: false,
      error: "each typed account needs a unique id",
    });
    const many = Array.from({ length: 31 }, (_, i) => typed({ id: `a${i}` }));
    expect(validateFirePlan({ version: 1, typedAccounts: many }).success).toBe(false);
  });

  it("allows a negative cash saving, for a household that spends more than it earns", () => {
    expect(validateFirePlan({ version: 1, assumptions: { cashSavedYearly: -5000 } }).success).toBe(true);
  });
});
