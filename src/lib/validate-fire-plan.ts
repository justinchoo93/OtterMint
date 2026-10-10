import {
  DEFAULT_ASSUMPTIONS,
  FIRE_KINDS,
  type FireAccountKind,
  type FireAppAccountChoice,
  type FireAssumptions,
  type FireKind,
  type FireOwner,
  type FirePlan,
  type FireTypedAccount,
} from "@/lib/fire-model";
import { FIELD_LIMITS } from "@/lib/validate-request";

export type FirePlanValidation = { success: true; plan: FirePlan } | { success: false; error: string };

const MAX_TYPED_ACCOUNTS = 30;
const MAX_APP_ACCOUNTS = 200;
const TYPED_ID = /^[a-z0-9-]{1,40}$/;
const APP_KEY = /^(plaid|manual):[A-Za-z0-9_-]{1,200}$/;
const OWNERS: readonly FireOwner[] = ["you", "partner"];
const ACCOUNT_KINDS: readonly FireAccountKind[] = [...FIRE_KINDS, "excluded"];

type Bounds = readonly [min: number, max: number];
const MONTHLY: Bounds = [0, 1_000_000];
const YEARLY: Bounds = [0, 100_000_000];

// Every numeric assumption and its allowed range. Nullable fields fall back to
// OtterMint's own figures (see FireAssumptions).
const NUMBER_FIELDS: Record<Exclude<keyof FireAssumptions, "pensionOwner">, { bounds: Bounds; nullable?: boolean }> = {
  yourAge: { bounds: [18, 100] },
  partnerAge: { bounds: [18, 100] },
  planAge: { bounds: [50, 110] },
  partnerOffsetYears: { bounds: [-30, 30] },
  partnerTakeHomeMonthly: { bounds: MONTHLY, nullable: true },
  spendingMonthly: { bounds: MONTHLY, nullable: true },
  cashSavedYearly: { bounds: [-YEARLY[1], YEARLY[1]], nullable: true },
  healthMonthly: { bounds: MONTHLY },
  taxRatePct: { bounds: [0, 60] },
  change1Age: { bounds: [18, 110] },
  change1Monthly: { bounds: [-1_000_000, 1_000_000] },
  change2Age: { bounds: [18, 110] },
  change2Monthly: { bounds: [-1_000_000, 1_000_000] },
  returnBeforePct: { bounds: [-10, 20] },
  returnAfterPct: { bounds: [-10, 20] },
  returnCryptoPct: { bounds: [-10, 20] },
  inflationPct: { bounds: [0, 15] },
  pensionSalaryYearly: { bounds: YEARLY },
  pensionServiceYears: { bounds: [0, 60] },
  pensionStartAge: { bounds: [55, 65] },
  ssYouMonthly: { bounds: MONTHLY },
  ssYouClaimAge: { bounds: [62, 70] },
  ssPartnerMonthly: { bounds: MONTHLY },
  ssPartnerClaimAge: { bounds: [62, 70] },
  rothBasisYou: { bounds: YEARLY },
  rothBasisPartner: { bounds: YEARLY },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inBounds(value: unknown, [min, max]: Bounds): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function fail(error: string): FirePlanValidation {
  return { success: false, error };
}

/**
 * Accept only a well-formed version-1 FIRE plan. Unknown keys are dropped,
 * missing assumptions take their defaults, names are trimmed.
 */
export function validateFirePlan(input: unknown): FirePlanValidation {
  if (!isRecord(input) || input.version !== 1) return fail("plan must be a version 1 FIRE plan");

  const rawAssumptions = isRecord(input.assumptions) ? input.assumptions : {};
  const assumptions: FireAssumptions = { ...DEFAULT_ASSUMPTIONS };
  for (const [key, rule] of Object.entries(NUMBER_FIELDS) as [keyof typeof NUMBER_FIELDS, (typeof NUMBER_FIELDS)[keyof typeof NUMBER_FIELDS]][]) {
    if (!(key in rawAssumptions)) continue;
    const value = rawAssumptions[key];
    if (value === null && rule.nullable) {
      (assumptions as unknown as Record<string, number | null>)[key] = null;
      continue;
    }
    if (!inBounds(value, rule.bounds)) return fail(`${key} must be a number from ${rule.bounds[0]} to ${rule.bounds[1]}`);
    (assumptions as unknown as Record<string, number | null>)[key] = value;
  }
  if ("pensionOwner" in rawAssumptions) {
    const owner = rawAssumptions.pensionOwner;
    if (owner !== "none" && !OWNERS.includes(owner as FireOwner)) return fail("pensionOwner must be you, partner or none");
    assumptions.pensionOwner = owner as FireAssumptions["pensionOwner"];
  }
  if (assumptions.planAge <= assumptions.yourAge) return fail("planAge must be above yourAge");

  const rawApp = input.appAccounts ?? {};
  if (!isRecord(rawApp)) return fail("appAccounts must be an object");
  const appKeys = Object.keys(rawApp);
  if (appKeys.length > MAX_APP_ACCOUNTS) return fail(`appAccounts may hold at most ${MAX_APP_ACCOUNTS} accounts`);
  const appAccounts: Record<string, FireAppAccountChoice> = {};
  for (const key of appKeys) {
    if (!APP_KEY.test(key)) return fail("appAccounts has an invalid account key");
    const raw = rawApp[key];
    if (!isRecord(raw)) return fail(`appAccounts.${key} must be an object`);
    const choice: FireAppAccountChoice = {};
    if (raw.kind !== undefined) {
      if (!ACCOUNT_KINDS.includes(raw.kind as FireAccountKind)) return fail(`appAccounts.${key}.kind is not a known kind`);
      choice.kind = raw.kind as FireAccountKind;
    }
    if (raw.owner !== undefined) {
      if (!OWNERS.includes(raw.owner as FireOwner)) return fail(`appAccounts.${key}.owner must be you or partner`);
      choice.owner = raw.owner as FireOwner;
    }
    if (raw.contributionYearly !== undefined) {
      if (!inBounds(raw.contributionYearly, YEARLY)) return fail(`appAccounts.${key}.contributionYearly is out of range`);
      choice.contributionYearly = raw.contributionYearly;
    }
    appAccounts[key] = choice;
  }

  const rawTyped = input.typedAccounts ?? [];
  if (!Array.isArray(rawTyped)) return fail("typedAccounts must be a list");
  if (rawTyped.length > MAX_TYPED_ACCOUNTS) return fail(`typedAccounts may hold at most ${MAX_TYPED_ACCOUNTS} accounts`);
  const typedAccounts: FireTypedAccount[] = [];
  const ids = new Set<string>();
  for (const raw of rawTyped) {
    if (!isRecord(raw)) return fail("each typed account must be an object");
    if (typeof raw.id !== "string" || !TYPED_ID.test(raw.id) || ids.has(raw.id)) return fail("each typed account needs a unique id");
    ids.add(raw.id);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name.length === 0 || name.length > FIELD_LIMITS.NAME) return fail(`typed account names must be 1 to ${FIELD_LIMITS.NAME} characters`);
    if (!OWNERS.includes(raw.owner as FireOwner)) return fail("typed account owner must be you or partner");
    if (!FIRE_KINDS.includes(raw.kind as FireKind)) return fail("typed account kind is not a known kind");
    if (!inBounds(raw.balance, YEARLY)) return fail("typed account balance is out of range");
    if (!inBounds(raw.contributionYearly, YEARLY)) return fail("typed account contributionYearly is out of range");
    typedAccounts.push({
      id: raw.id,
      name,
      owner: raw.owner as FireOwner,
      kind: raw.kind as FireKind,
      balance: raw.balance,
      contributionYearly: raw.contributionYearly,
    });
  }

  return { success: true, plan: { version: 1, assumptions, appAccounts, typedAccounts } };
}
