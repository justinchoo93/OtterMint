import {
  FIELD_LIMITS,
  validateBoundedString,
  validateOptionalBoundedString,
  type ValidationResult,
} from "@/lib/validate-request";

export interface ManualAccountInput {
  name: string;
  type: "asset" | "liability";
  subtype?: string;
  balance: string;
  owner?: string;
  notes?: string;
}

const VALID_TYPES = new Set(["asset", "liability"]);

export function validateManualAccount(input: ManualAccountInput): ValidationResult {
  const nameResult = validateBoundedString(input.name, "name", FIELD_LIMITS.NAME);
  if (!nameResult.success) return nameResult;

  if (!VALID_TYPES.has(input.type)) {
    return { success: false, error: "type must be 'asset' or 'liability'" };
  }

  if (input.balance === undefined || input.balance === null || input.balance === "") {
    return { success: false, error: "balance is required" };
  }

  if (isNaN(parseFloat(input.balance))) {
    return { success: false, error: "balance must be a valid number" };
  }

  const subtypeResult = validateOptionalBoundedString(
    input.subtype,
    "subtype",
    FIELD_LIMITS.SUBTYPE
  );
  if (!subtypeResult.success) return subtypeResult;

  const notesResult = validateOptionalBoundedString(
    input.notes,
    "notes",
    FIELD_LIMITS.NOTES
  );
  if (!notesResult.success) return notesResult;

  return { success: true };
}
