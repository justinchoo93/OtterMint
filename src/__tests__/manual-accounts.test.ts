import { describe, it, expect } from "vitest";
import {
  validateManualAccount,
  type ManualAccountInput,
} from "@/lib/validate-manual-account";

function validInput(overrides: Partial<ManualAccountInput> = {}): ManualAccountInput {
  return {
    name: "River Bitcoin",
    type: "asset",
    balance: "1500.00",
    ...overrides,
  };
}

describe("validateManualAccount", () => {
  it("accepts a valid asset account", () => {
    const result = validateManualAccount(validInput());
    expect(result.success).toBe(true);
  });

  it("accepts a valid liability account", () => {
    const result = validateManualAccount(validInput({ type: "liability" }));
    expect(result.success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = validateManualAccount(
      validInput({
        subtype: "crypto",
        notes: "BTC held in cold storage",
        owner: "partner",
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = validateManualAccount(validInput({ name: "" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("name");
  });

  it("rejects invalid type", () => {
    const result = validateManualAccount(validInput({ type: "checking" as "asset" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("type");
  });

  it("rejects non-numeric balance", () => {
    const result = validateManualAccount(validInput({ balance: "abc" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("balance");
  });

  it("rejects missing balance", () => {
    const result = validateManualAccount(validInput({ balance: "" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("balance");
  });

  it("accepts zero balance", () => {
    const result = validateManualAccount(validInput({ balance: "0" }));
    expect(result.success).toBe(true);
  });

  it("accepts negative balance", () => {
    const result = validateManualAccount(validInput({ balance: "-500.00" }));
    expect(result.success).toBe(true);
  });

  it("rejects a name longer than 200 characters", () => {
    const result = validateManualAccount(validInput({ name: "a".repeat(201) }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("name");
  });

  it("rejects notes longer than 1000 characters", () => {
    const result = validateManualAccount(validInput({ notes: "a".repeat(1001) }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("notes");
  });

  it("accepts a 200-character name and 1000-character notes", () => {
    const result = validateManualAccount(
      validInput({ name: "a".repeat(200), notes: "b".repeat(1000) })
    );
    expect(result.success).toBe(true);
  });
});
