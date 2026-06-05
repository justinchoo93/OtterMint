export const FIELD_LIMITS = {
  NAME: 200,
  LABEL: 200,
  NOTES: 1000,
  EMAIL: 320,
  DISPLAY_NAME: 200,
  SUBTYPE: 100,
  INSTITUTION_ID: 100,
  INSTITUTION_NAME: 200,
} as const;

export type ValidationResult =
  | { success: true }
  | { success: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number
): ValidationResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { success: false, error: `${fieldName} is required` };
  }
  if (value.length > maxLength) {
    return {
      success: false,
      error: `${fieldName} must be ${maxLength} characters or fewer`,
    };
  }
  return { success: true };
}

export function validateOptionalBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number
): ValidationResult {
  if (value === undefined || value === null) {
    return { success: true };
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return { success: true };
  }
  return validateBoundedString(value, fieldName, maxLength);
}

export function validateEmail(
  value: unknown,
  maxLength: number = FIELD_LIMITS.EMAIL
): ValidationResult {
  if (typeof value !== "string" || value.length === 0) {
    return { success: false, error: "email is required" };
  }
  if (value.length > maxLength) {
    return {
      success: false,
      error: `email must be ${maxLength} characters or fewer`,
    };
  }
  if (!EMAIL_RE.test(value)) {
    return { success: false, error: "email is invalid" };
  }
  return { success: true };
}

export function validateBoundedInteger(
  value: unknown,
  fieldName: string,
  min: number,
  max: number
): ValidationResult {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { success: false, error: `${fieldName} must be an integer` };
  }
  if (value < min || value > max) {
    return {
      success: false,
      error: `${fieldName} must be between ${min} and ${max}`,
    };
  }
  return { success: true };
}
