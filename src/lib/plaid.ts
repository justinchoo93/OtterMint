import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const VALID_ENVS = ["sandbox", "production"] as const;

/**
 * Resolve the Plaid environment, failing loud in production.
 *
 * In production, PLAID_ENV must be exactly "sandbox" or "production"; a missing
 * or misspelled value throws so a deploy never silently hits sandbox. Outside
 * production, an unset value defaults to "sandbox".
 *
 * Pure (args injectable) so it can be unit-tested without mutating the
 * read-only NODE_ENV under the test runner.
 */
export function resolvePlaidEnv(
  value = process.env.PLAID_ENV,
  nodeEnv = process.env.NODE_ENV
): keyof typeof PlaidEnvironments {
  if (nodeEnv === "production") {
    if (!value || !VALID_ENVS.includes(value as (typeof VALID_ENVS)[number])) {
      throw new Error(
        "PLAID_ENV must be set to 'sandbox' or 'production' in production"
      );
    }
    return value as keyof typeof PlaidEnvironments;
  }
  return (value as keyof typeof PlaidEnvironments) || "sandbox";
}

const plaidEnv = resolvePlaidEnv();

const configuration = new Configuration({
  basePath: PlaidEnvironments[plaidEnv] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
