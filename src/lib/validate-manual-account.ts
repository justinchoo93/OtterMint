export interface ManualAccountInput {
  name: string;
  type: "asset" | "liability";
  subtype?: string;
  balance: string;
  owner?: string;
  notes?: string;
}

type ValidationResult =
  | { success: true }
  | { success: false; error: string };

const VALID_TYPES = new Set(["asset", "liability"]);

export function validateManualAccount(input: ManualAccountInput): ValidationResult {
  if (!input.name || input.name.trim().length === 0) {
    return { success: false, error: "name is required" };
  }

  if (!VALID_TYPES.has(input.type)) {
    return { success: false, error: "type must be 'asset' or 'liability'" };
  }

  if (input.balance === undefined || input.balance === null || input.balance === "") {
    return { success: false, error: "balance is required" };
  }

  if (isNaN(parseFloat(input.balance))) {
    return { success: false, error: "balance must be a valid number" };
  }

  return { success: true };
}
