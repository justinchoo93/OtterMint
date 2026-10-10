// The FIRE projection: when the household could stop working, account by
// account. Pure: no React, server or database imports, so the API route, the
// view and the tests share it. Everything is in real (today's) dollars, so
// returns are after inflation. The rules and their sources are in
// docs/plans/fire-calculator.md; the approved mock is docs/design/fire-calculator/.

import { firstDataMonthIndex } from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";
import { formatCompactCurrency, formatWholeCurrency } from "@/lib/format";

export type FireOwner = "you" | "partner";
export type FireKind = "cash" | "brokerage" | "crypto" | "k457" | "pers3" | "k401" | "ira" | "roth";
export type FireAccountKind = FireKind | "excluded";

export interface FireAssumptions {
  yourAge: number;
  partnerAge: number;
  /** Your age when the projection ends. */
  planAge: number;
  /** Your partner stops working this many years after you (negative: before). */
  partnerOffsetYears: number;
  /** null: half of OtterMint's take-home pay. */
  partnerTakeHomeMonthly: number | null;
  /** Retirement spending; null: OtterMint's last-twelve-month average. */
  spendingMonthly: number | null;
  /** Cash left over from pay each year while you both work; null: OtterMint's figure. */
  cashSavedYearly: number | null;
  /** Health insurance for both of you once neither works, until each turns 65. */
  healthMonthly: number;
  taxRatePct: number;
  change1Age: number;
  change1Monthly: number;
  change2Age: number;
  change2Monthly: number;
  returnBeforePct: number;
  returnAfterPct: number;
  returnCryptoPct: number;
  inflationPct: number;
  pensionOwner: FireOwner | "none";
  pensionSalaryYearly: number;
  pensionServiceYears: number;
  pensionStartAge: number;
  ssYouMonthly: number;
  ssYouClaimAge: number;
  ssPartnerMonthly: number;
  ssPartnerClaimAge: number;
  rothBasisYou: number;
  rothBasisPartner: number;
}

/** The owner's choices for an account OtterMint already tracks. */
export interface FireAppAccountChoice {
  kind?: FireAccountKind;
  owner?: FireOwner;
  contributionYearly?: number;
}

/** An account typed on the FIRE page. It lives only in the plan, never in real accounts. */
export interface FireTypedAccount {
  id: string;
  name: string;
  owner: FireOwner;
  kind: FireKind;
  balance: number;
  contributionYearly: number;
}

export interface FirePlan {
  version: 1;
  assumptions: FireAssumptions;
  /** Keyed by "plaid:<account_id>" or "manual:<id>". */
  appAccounts: Record<string, FireAppAccountChoice>;
  typedAccounts: FireTypedAccount[];
}

export interface FireCashflowSummary {
  takeHomeMonthly: number;
  spendingMonthly: number;
  /** Take-home minus spending over the counted months, scaled to a year. */
  cashSavedYearly: number;
  monthsCounted: number;
  /** "YYYY-MM" of the first and last counted month. */
  firstMonth: string | null;
  lastMonth: string | null;
}

export interface FireAppAccount {
  key: string;
  name: string;
  /** Institution and mask, or "Manual account". */
  detail: string;
  source: "plaid" | "manual";
  balance: number;
  suggestedKind: FireAccountKind;
}

export interface FireResponse {
  /** Today, "YYYY-MM-DD"; month index 0 is this month. */
  asOf: string;
  cashflow: FireCashflowSummary;
  accounts: FireAppAccount[];
  plan: FirePlan | null;
  savedAt: string | null;
}

export const FIRE_KINDS: readonly FireKind[] = ["cash", "brokerage", "crypto", "k457", "pers3", "k401", "ira", "roth"];

export const KIND_LABELS: Record<FireAccountKind, string> = {
  cash: "Cash",
  brokerage: "Brokerage",
  crypto: "Crypto",
  k457: "457(b)",
  pers3: "PERS 3 investment account",
  k401: "401(k) or 403(b)",
  ira: "Traditional IRA",
  roth: "Roth IRA",
  excluded: "Not counted",
};

/** When each kind of account can be used without the early-withdrawal penalty. */
export const KIND_OPENS: Record<FireKind, string> = {
  cash: "Any time",
  brokerage: "Any time",
  crypto: "Any time",
  k457: "On leaving the job",
  pers3: "59½, or on leaving at 55+",
  k401: "59½, or on leaving at 55+",
  ira: "59½",
  roth: "Contributions any time, growth at 59½",
};

// Withdrawal order: spend cash first, tax-free Roth money last.
const WITHDRAWAL_ORDER: Record<FireKind, number> = {
  cash: 0,
  brokerage: 1,
  crypto: 2,
  k457: 3,
  pers3: 4,
  k401: 5,
  ira: 6,
  roth: 7,
};

const PRE_TAX_PAYROLL: ReadonlySet<FireKind> = new Set(["k401", "k457", "pers3"]);

export const DEFAULT_ASSUMPTIONS: FireAssumptions = {
  yourAge: 35,
  partnerAge: 35,
  planAge: 95,
  partnerOffsetYears: 0,
  partnerTakeHomeMonthly: null,
  spendingMonthly: null,
  cashSavedYearly: null,
  healthMonthly: 1200,
  taxRatePct: 10,
  change1Age: 55,
  change1Monthly: 0,
  change2Age: 75,
  change2Monthly: 0,
  returnBeforePct: 5,
  returnAfterPct: 3.5,
  returnCryptoPct: 5,
  inflationPct: 2.5,
  pensionOwner: "none",
  pensionSalaryYearly: 0,
  pensionServiceYears: 0,
  pensionStartAge: 65,
  ssYouMonthly: 0,
  ssYouClaimAge: 67,
  ssPartnerMonthly: 0,
  ssPartnerClaimAge: 67,
  rothBasisYou: 0,
  rothBasisPartner: 0,
};

export function defaultPlan(): FirePlan {
  return { version: 1, assumptions: { ...DEFAULT_ASSUMPTIONS }, appAccounts: {}, typedAccounts: [] };
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Take-home pay, spending and cash saved over the last twelve complete months
 * of `aggregateCashflow` output. The current (partial) month and any month
 * before the first month with data are skipped, so a short history averages
 * over the months it has.
 */
export function summarizeCashflow(months: CashflowMonth[]): FireCashflowSummary {
  const complete = months.filter((m) => !m.partial).slice(-12);
  const first = firstDataMonthIndex(complete);
  const counted = first === null ? [] : complete.slice(first);
  if (counted.length === 0) {
    return { takeHomeMonthly: 0, spendingMonthly: 0, cashSavedYearly: 0, monthsCounted: 0, firstMonth: null, lastMonth: null };
  }
  const income = counted.reduce((s, m) => s + toNumber(m.income), 0);
  const spending = counted.reduce((s, m) => s + toNumber(m.spending), 0);
  const n = counted.length;
  return {
    takeHomeMonthly: Math.round(income / n),
    spendingMonthly: Math.round(spending / n),
    cashSavedYearly: Math.round(((income - spending) / n) * 12),
    monthsCounted: n,
    firstMonth: counted[0].month,
    lastMonth: counted[n - 1].month,
  };
}

/**
 * A first guess at an OtterMint account's kind. Plaid subtypes vary by
 * institution and a manual account's subtype is free text, so the owner can
 * change every guess; cash and anything unrecognized start as not counted.
 */
export function suggestKind(source: "plaid" | "manual", type: string, subtype: string | null, name: string): FireAccountKind {
  const sub = (subtype ?? "").toLowerCase();
  const text = `${sub} ${name.toLowerCase()}`;
  if (source === "plaid") {
    if (type === "depository") return "excluded";
    if (type !== "investment") return "excluded";
    if (sub.includes("roth")) return "roth";
    if (/457/.test(sub)) return "k457";
    if (/401|403|tsp|thrift/.test(sub)) return "k401";
    if (/ira|sep|simple|keogh/.test(sub)) return "ira";
    if (/crypto/.test(sub)) return "crypto";
    return "brokerage";
  }
  if (type !== "asset") return "excluded";
  if (/roth/.test(text)) return "roth";
  if (/457/.test(text)) return "k457";
  if (/pers/.test(text)) return "pers3";
  if (/401|403|tsp/.test(text)) return "k401";
  if (/\bira\b/.test(text)) return "ira";
  if (/crypto|bitcoin|btc|coinbase|river/.test(text)) return "crypto";
  if (/brokerage|invest|stock|etf|fund/.test(text)) return "brokerage";
  return "excluded";
}

/** Social Security at `claimAge` as a share of the at-67 amount (SSA early and delayed rules). */
export function ssFactor(claimAge: number): number {
  const months = Math.round((claimAge - 67) * 12);
  if (months >= 0) return 1 + (Math.min(months, 36) * (2 / 3)) / 100;
  const early = -months;
  return 1 - (Math.min(early, 36) * (5 / 9) + Math.max(0, early - 36) * (5 / 12)) / 100;
}

// DRS PERS 3 early-retirement factors for 10-29 years of service; ages between are interpolated.
const PERS3_EARLY: ReadonlyArray<readonly [number, number]> = [
  [55, 0.4092],
  [58, 0.528],
  [60, 0.6292],
  [62, 0.7538],
  [64, 0.9085],
  [65, 1],
];

function pers3EarlyFactor(age: number): number {
  if (age >= 65) return 1;
  for (let i = 0; i < PERS3_EARLY.length - 1; i++) {
    const [a0, f0] = PERS3_EARLY[i];
    const [a1, f1] = PERS3_EARLY[i + 1];
    if (age >= a0 && age <= a1) return f0 + ((f1 - f0) * (age - a0)) / (a1 - a0);
  }
  return PERS3_EARLY[0][1];
}

export interface FireModelAccount {
  key: string;
  label: string;
  owner: FireOwner;
  kind: FireKind;
  balance: number;
  contributionYearly: number;
  /** For Roth IRAs: the part that can come out before 59½. */
  rothBasis: number;
  /** The synthetic account the household's cash saving and surpluses go into. */
  isNewSavings?: boolean;
}

export interface FireParams {
  /** "YYYY-MM" of month index 0. */
  asOfMonth: string;
  yourAge: number;
  partnerAge: number;
  planAge: number;
  partnerOffsetYears: number;
  yourTakeHomeMonthly: number;
  partnerTakeHomeMonthly: number;
  spendingMonthly: number;
  cashSavedYearly: number;
  healthMonthly: number;
  /** Fractions, not percents. */
  taxRate: number;
  returnBefore: number;
  returnAfter: number;
  returnCrypto: number;
  inflation: number;
  changes: { age: number; monthly: number }[];
  pension: { owner: FireOwner | "none"; salaryYearly: number; serviceYears: number; startAge: number };
  ssYou: { monthly: number; claimAge: number };
  ssPartner: { monthly: number; claimAge: number };
  accounts: FireModelAccount[];
}

export const NEW_SAVINGS_KEY = "new-savings";

/** Merge OtterMint's figures with the saved plan into the model's numeric inputs. */
export function resolveParams(data: FireResponse, plan: FirePlan): FireParams {
  const a = plan.assumptions;
  const takeHome = Math.max(0, data.cashflow.takeHomeMonthly);
  const partnerTakeHome = Math.min(takeHome, Math.max(0, a.partnerTakeHomeMonthly ?? takeHome / 2));
  const accounts: FireModelAccount[] = [
    { key: NEW_SAVINGS_KEY, label: "New savings", owner: "you", kind: "brokerage", balance: 0, contributionYearly: 0, rothBasis: 0, isNewSavings: true },
  ];
  for (const account of data.accounts) {
    const choice = plan.appAccounts[account.key] ?? {};
    const kind = choice.kind ?? account.suggestedKind;
    if (kind === "excluded") continue;
    accounts.push({
      key: account.key,
      label: account.name,
      owner: choice.owner ?? "you",
      kind,
      balance: Math.max(0, account.balance),
      contributionYearly: choice.contributionYearly ?? 0,
      rothBasis: 0,
    });
  }
  for (const typed of plan.typedAccounts) {
    accounts.push({
      key: `typed:${typed.id}`,
      label: typed.name,
      owner: typed.owner,
      kind: typed.kind,
      balance: typed.balance,
      contributionYearly: typed.contributionYearly,
      rothBasis: 0,
    });
  }
  // Each person's Roth contributions, split across their Roth accounts by balance.
  for (const owner of ["you", "partner"] as const) {
    const basis = Math.max(0, owner === "you" ? a.rothBasisYou : a.rothBasisPartner);
    const roths = accounts.filter((acct) => acct.kind === "roth" && acct.owner === owner);
    const total = roths.reduce((s, acct) => s + acct.balance, 0);
    for (const acct of roths) acct.rothBasis = total > 0 ? Math.min(acct.balance, (basis * acct.balance) / total) : 0;
  }
  return {
    asOfMonth: data.asOf.slice(0, 7),
    yourAge: a.yourAge,
    partnerAge: a.partnerAge,
    planAge: a.planAge,
    partnerOffsetYears: a.partnerOffsetYears,
    yourTakeHomeMonthly: takeHome - partnerTakeHome,
    partnerTakeHomeMonthly: partnerTakeHome,
    spendingMonthly: a.spendingMonthly ?? data.cashflow.spendingMonthly,
    cashSavedYearly: a.cashSavedYearly ?? data.cashflow.cashSavedYearly,
    healthMonthly: a.healthMonthly,
    taxRate: Math.min(0.9, Math.max(0, a.taxRatePct / 100)),
    returnBefore: a.returnBeforePct / 100,
    returnAfter: a.returnAfterPct / 100,
    returnCrypto: a.returnCryptoPct / 100,
    inflation: a.inflationPct / 100,
    changes: [
      { age: a.change1Age, monthly: a.change1Monthly },
      { age: a.change2Age, monthly: a.change2Monthly },
    ],
    pension: { owner: a.pensionOwner, salaryYearly: a.pensionSalaryYearly, serviceYears: a.pensionServiceYears, startAge: a.pensionStartAge },
    ssYou: { monthly: a.ssYouMonthly, claimAge: a.ssYouClaimAge },
    ssPartner: { monthly: a.ssPartnerMonthly, claimAge: a.ssPartnerClaimAge },
    accounts,
  };
}

function ageNowOf(params: FireParams, owner: FireOwner): number {
  return owner === "you" ? params.yourAge : params.partnerAge;
}

export interface FirePension {
  /** Real dollars a month once it starts; 0 when not vested or no pension. */
  monthly: number;
  /** Month index it starts; Infinity when there is none. */
  startM: number;
  startAge: number | null;
  /** Years of service at separation. */
  service: number;
}

/**
 * The WA PERS Plan 3 defined benefit: 1% of salary per year of service,
 * reduced by DRS's factors before 65 (5% a year with 30+ years), grown 0.25%
 * a month between separation and the start (to 65 at most) only with 20+
 * years, and worn down by inflation over that wait. After it starts it is
 * treated as keeping pace with inflation.
 */
export function pensionFor(params: FireParams, ownerRetireM: number): FirePension {
  const { owner, salaryYearly, serviceYears, startAge: chosenStart } = params.pension;
  if (owner === "none") return { monthly: 0, startM: Infinity, startAge: null, service: 0 };
  const ageNow = ageNowOf(params, owner);
  const service = serviceYears + ownerRetireM / 12;
  const ageAtSeparation = ageNow + ownerRetireM / 12;
  const vested = service >= 10 || (service >= 5 && ageAtSeparation >= 45);
  if (!vested || salaryYearly <= 0) return { monthly: 0, startM: Infinity, startAge: null, service };
  const startAge = Math.max(chosenStart, ageAtSeparation, service >= 10 ? 55 : 65);
  const factor = startAge >= 65 ? 1 : service >= 30 ? 1 - 0.05 * (65 - startAge) : pers3EarlyFactor(startAge);
  const waited = Math.max(0, startAge - ageAtSeparation);
  const grownYears = service >= 20 ? Math.min(waited, Math.max(0, 65 - ageAtSeparation)) : 0;
  const real = Math.pow(1.0025, grownYears * 12) / Math.pow(1 + params.inflation, waited);
  const monthly = ((0.01 * service * salaryYearly) / 12) * factor * real;
  return { monthly, startM: Math.round((startAge - ageNow) * 12), startAge, service };
}

export interface FireSimAccount extends FireModelAccount {
  /** Month index from which the whole balance can be used. */
  openM: number;
  /** Balance at the start of each month, 0..horizon. */
  history: number[];
  basisHistory: number[];
}

export interface FireSimulation {
  /** Total invested at the start of each month, 0..horizon. */
  path: number[];
  horizon: number;
  yM: number;
  pM: number;
  /** First month open money ran short while locked money remained. */
  gapM: number | null;
  /** First month all money ran out. */
  outM: number | null;
  /** Lowest open money while something was still locked, and when. */
  low: number | null;
  lowM: number | null;
  accounts: FireSimAccount[];
  pension: FirePension;
  ssYouM: number;
  ssYou: number;
  ssPartnerM: number;
  ssPartner: number;
  ok: boolean;
}

function monthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Month index of an age for someone `ageNow` today, never before now. */
function monthAt(age: number, ageNow: number): number {
  return Math.max(0, Math.round((age - ageNow) * 12));
}

/** Project month by month, with you retiring at month index `yM`. */
export function simulate(params: FireParams, yM: number): FireSimulation {
  const pM = Math.max(0, yM + Math.round(params.partnerOffsetYears * 12));
  const firstRetireM = Math.min(yM, pM);
  const horizon = Math.max(1, Math.round((params.planAge - params.yourAge) * 12));
  const retireOf = (owner: FireOwner) => (owner === "you" ? yM : pM);
  const accounts: FireSimAccount[] = params.accounts.map((a) => {
    const ageNow = ageNowOf(params, a.owner);
    const own = retireOf(a.owner);
    const at59 = monthAt(59.5, ageNow);
    let openM = 0;
    if (a.kind === "k457") openM = own;
    if (a.kind === "k401" || a.kind === "pers3") openM = ageNow + own / 12 >= 55 ? own : Math.max(own, at59);
    if (a.kind === "ira" || a.kind === "roth") openM = at59;
    return { ...a, balance: a.balance, openM, history: [], basisHistory: [], rothBasis: Math.min(a.rothBasis, a.balance) };
  });
  const balances = accounts.map((a) => a.balance);
  const basis = accounts.map((a) => (a.kind === "roth" ? a.rothBasis : 0));
  const order = accounts.map((_, i) => i).sort((i, j) => WITHDRAWAL_ORDER[accounts[i].kind] - WITHDRAWAL_ORDER[accounts[j].kind]);
  const sink = Math.max(0, accounts.findIndex((a) => a.isNewSavings));
  const available = (i: number, m: number) => (m >= accounts[i].openM ? balances[i] : accounts[i].kind === "roth" ? Math.min(basis[i], balances[i]) : 0);
  const take = (i: number, amount: number) => {
    balances[i] -= amount;
    if (accounts[i].kind === "roth") basis[i] = Math.max(0, basis[i] - amount);
  };
  const pension = pensionFor(params, params.pension.owner === "partner" ? pM : yM);
  const ssYouM = Math.round((params.ssYou.claimAge - params.yourAge) * 12);
  const ssYou = params.ssYou.monthly * ssFactor(params.ssYou.claimAge);
  const ssPartnerM = Math.round((params.ssPartner.claimAge - params.partnerAge) * 12);
  const ssPartner = params.ssPartner.monthly * ssFactor(params.ssPartner.claimAge);
  const before = monthlyRate(params.returnBefore);
  const after = monthlyRate(params.returnAfter);
  const crypto = monthlyRate(params.returnCrypto);

  const path: number[] = [];
  let gapM: number | null = null;
  let outM: number | null = null;
  let low: number | null = null;
  let lowM: number | null = null;

  for (let m = 0; m <= horizon; m++) {
    accounts.forEach((a, i) => {
      a.history.push(balances[i]);
      a.basisHistory.push(basis[i]);
    });
    path.push(balances.reduce((s, b) => s + b, 0));
    if (m === horizon) break;

    const youWork = m < yM;
    const partnerWork = m < pM;
    const works = (owner: FireOwner) => (owner === "you" ? youWork : partnerWork);
    accounts.forEach((a, i) => {
      if (a.isNewSavings || !works(a.owner)) return;
      const add = a.contributionYearly / 12;
      balances[i] += add;
      if (a.kind === "roth") basis[i] += add;
    });

    let net: number;
    if (youWork && partnerWork) {
      net = params.cashSavedYearly / 12;
    } else {
      const yourAge = params.yourAge + m / 12;
      const partnerAge = params.partnerAge + m / 12;
      let spending = params.spendingMonthly;
      for (const change of params.changes) if (change.monthly !== 0 && yourAge >= change.age) spending += change.monthly;
      if (!youWork && !partnerWork) {
        spending += (yourAge < 65 ? params.healthMonthly / 2 : 0) + (partnerAge < 65 ? params.healthMonthly / 2 : 0);
      }
      const income =
        (youWork ? params.yourTakeHomeMonthly : 0) +
        (partnerWork ? params.partnerTakeHomeMonthly : 0) +
        (m >= pension.startM ? pension.monthly : 0) +
        (m >= ssYouM ? ssYou : 0) +
        (m >= ssPartnerM ? ssPartner : 0);
      net = income - Math.max(0, spending);
    }

    if (net >= 0) {
      balances[sink] += net;
    } else {
      let need = -net / (1 - params.taxRate);
      for (const i of order) {
        if (need <= 0) break;
        const t = Math.min(available(i, m), need);
        if (t > 0) {
          take(i, t);
          need -= t;
        }
      }
      if (need > 0.5) {
        // Open money is short. Note the gap, then draw locked accounts early
        // so the total stays honest about what is left.
        if (gapM === null && order.some((i) => balances[i] > 0.5)) gapM = m;
        for (const i of order) {
          if (need <= 0) break;
          const t = Math.min(balances[i], need);
          if (t > 0) {
            take(i, t);
            need -= t;
          }
        }
        if (need > 0.5 && outM === null) outM = m;
      }
    }

    if (gapM === null && m >= firstRetireM && accounts.some((a, i) => m < a.openM && balances[i] - available(i, m) > 0.5)) {
      const open = accounts.reduce((s, _, i) => s + available(i, m), 0);
      if (low === null || open < low) {
        low = open;
        lowM = m;
      }
    }

    accounts.forEach((a, i) => {
      const rate = a.kind === "cash" ? 0 : a.kind === "crypto" ? crypto : m < firstRetireM ? before : after;
      balances[i] *= 1 + rate;
    });
  }

  return {
    path,
    horizon,
    yM,
    pM,
    gapM,
    outM,
    low,
    lowM,
    accounts,
    pension,
    ssYouM,
    ssYou,
    ssPartnerM,
    ssPartner,
    ok: gapM === null && outM === null,
  };
}

/** Latest month index the search tries: you at 70. */
export function maxRetireMonth(params: FireParams): number {
  return Math.max(0, Math.round((70 - params.yourAge) * 12));
}

/**
 * The earliest month index you could retire, or null when even 70 does not
 * work. Binary search: working longer only adds money and shortens the wait
 * for locked accounts, so once a month works every later month does too.
 */
export function earliestRetirement(params: FireParams): number | null {
  const max = maxRetireMonth(params);
  if (simulate(params, 0).ok) return 0;
  if (!simulate(params, max).ok) return null;
  let lo = 0;
  let hi = max;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (simulate(params, mid).ok) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthParts(asOfMonth: string, m: number): { year: number; month: number } {
  const total = Number.parseInt(asOfMonth.slice(0, 4), 10) * 12 + Number.parseInt(asOfMonth.slice(5, 7), 10) - 1 + m;
  return { year: Math.floor(total / 12), month: total % 12 };
}

/** "Jul 2033" for month index `m`. */
export function monthLabel(asOfMonth: string, m: number): string {
  const { year, month } = monthParts(asOfMonth, m);
  return `${MONTHS[month]} ${year}`;
}

export function yearOf(asOfMonth: string, m: number): number {
  return monthParts(asOfMonth, m).year;
}

/** "41" or "41½". */
export function ageText(age: number): string {
  const whole = Math.floor(age + 1e-9);
  return age - whole >= 0.5 - 1e-9 ? `${whole}½` : String(whole);
}

/** "7 years 5 months". */
export function spanText(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);
  return parts.join(" ") || "no time";
}

export function yourAgeAt(params: FireParams, m: number): number {
  return params.yourAge + m / 12;
}

export function partnerAgeAt(params: FireParams, m: number): number {
  return params.partnerAge + m / 12;
}

export interface FireStatus {
  ok: boolean;
  text: string;
}

/** The chip beside the slider. */
export function describeStatus(params: FireParams, sim: FireSimulation): FireStatus {
  if (sim.gapM !== null) {
    return { ok: false, text: `Short at ${Math.floor(yourAgeAt(params, sim.gapM))}: open accounts run dry before the rest unlock` };
  }
  if (sim.outM !== null) return { ok: false, text: `Runs out at ${Math.floor(yourAgeAt(params, sim.outM))}` };
  return { ok: true, text: `Lasts to ${params.planAge} · ${formatCompactCurrency(sim.path[sim.horizon])} left` };
}

export interface FireTimelineItem {
  key: string;
  title: string;
  when: string;
  detail: string;
  amount: string;
  tone: "retire" | "event";
  check: FireStatus | null;
}

function phrase(a: FireModelAccount): string {
  if (a.isNewSavings) return "New savings";
  return `${a.owner === "you" ? "Your" : "Partner’s"} ${a.label}`;
}

function phraseList(list: FireModelAccount[]): string {
  const owner = list[0].owner;
  if (list.every((a) => !a.isNewSavings && a.owner === owner)) {
    return `${owner === "you" ? "Your" : "Partner’s"} ${list.map((a) => a.label).join(" and ")}`;
  }
  return list.map(phrase).join(" and ");
}

/** Retirements, accounts opening and income starting, in date order. */
export function buildTimeline(params: FireParams, sim: FireSimulation): FireTimelineItem[] {
  const { yM, pM, horizon } = sim;
  const together = yM === pM;
  const firstM = Math.min(yM, pM);
  const at = (a: FireSimAccount, m: number) => a.history[Math.min(Math.max(m, 0), horizon)];
  const basisAt = (a: FireSimAccount, m: number) => a.basisHistory[Math.min(Math.max(m, 0), horizon)];
  const youAt = (m: number) => ageText(yourAgeAt(params, m));
  const partnerAt = (m: number) => ageText(partnerAgeAt(params, m));
  const items: (FireTimelineItem & { m: number })[] = [];

  const retireMonths = together ? [yM] : [yM, pM].sort((x, y) => x - y);
  for (const m of retireMonths) {
    const isFirst = m === firstM;
    const parts = sim.accounts
      .filter((a) => (isFirst ? a.openM <= m || a.kind === "roth" : a.openM === m && a.kind !== "roth"))
      .map((a) => {
        const amount = a.openM <= m ? at(a, m) : Math.min(basisAt(a, m), at(a, m));
        return { a, amount, text: `${phrase(a)}${a.openM <= m ? "" : " contributions"} ${formatCompactCurrency(amount)}` };
      })
      .filter((x) => x.amount > 0.5 || (x.a.kind !== "roth" && !x.a.isNewSavings));
    const who = together ? "You both retire" : m === yM ? "You retire" : "Partner retires";
    const ages = together ? `you ${youAt(m)}, partner ${partnerAt(m)}` : m === yM ? `you ${youAt(m)}` : `partner ${partnerAt(m)}`;
    items.push({
      key: `retire-${m === yM ? "you" : "partner"}`,
      m,
      title: who,
      when: `${monthLabel(params.asOfMonth, m)} · ${ages}`,
      detail: parts.length
        ? `Open now: ${parts.map((x) => x.text).join(" · ")}`
        : `${m === yM ? "Your" : "Your partner’s"} paycheck stops; nothing new opens`,
      amount: parts.length ? formatCompactCurrency(parts.reduce((s, x) => s + x.amount, 0)) : "",
      tone: "retire",
      check: null,
    });
  }

  const groups = new Map<number, FireSimAccount[]>();
  for (const a of sim.accounts) {
    if (a.openM <= firstM || retireMonths.includes(a.openM)) continue;
    groups.set(a.openM, [...(groups.get(a.openM) ?? []), a]);
  }
  for (const [m, list] of groups) {
    const owner = list[0].owner;
    items.push({
      key: `open-${m}`,
      m,
      title: `${phraseList(list)} ${list.length > 1 ? "open" : "opens"}`,
      when: `${monthLabel(params.asOfMonth, m)} · ${owner === "you" ? `you ${youAt(m)}` : `partner ${partnerAt(m)}`}`,
      detail: list.map((a) => `${phrase(a)} ${formatCompactCurrency(at(a, m))}`).join(" · "),
      amount: formatCompactCurrency(list.reduce((s, a) => s + at(a, m), 0)),
      tone: "event",
      check: null,
    });
  }

  const pension = sim.pension;
  if (params.pension.owner !== "none") {
    const whose = params.pension.owner === "you" ? "Your" : "Partner’s";
    if (pension.monthly > 0 && pension.startAge !== null) {
      const m = Math.max(pension.startM, params.pension.owner === "you" ? yM : pM);
      items.push({
        key: "pension",
        m,
        title: `${whose} PERS 3 pension starts`,
        when: `${monthLabel(params.asOfMonth, m)} · ${params.pension.owner === "you" ? "you" : "partner"} ${ageText(pension.startAge)}`,
        detail: `${Math.floor(pension.service)} years of service${pension.startAge < 65 ? ", reduced for starting before 65" : ""}`,
        amount: `+${formatWholeCurrency(pension.monthly)}/mo`,
        tone: "event",
        check: null,
      });
    } else {
      items.push({
        key: "pension",
        m: Number.MAX_SAFE_INTEGER,
        title: `No ${whose.toLowerCase()} PERS 3 pension`,
        when: `Leaves with ${Math.floor(pension.service)} years of service`,
        detail: "The pension needs 10 years of service, or 5 if some came after age 44",
        amount: "$0/mo",
        tone: "event",
        check: null,
      });
    }
  }

  const social = (who: FireOwner, monthly: number, m: number, claimAge: number) => {
    if (monthly <= 0) return;
    items.push({
      key: `ss-${who}`,
      m,
      title: `${who === "you" ? "Your" : "Partner’s"} Social Security starts`,
      when: `${monthLabel(params.asOfMonth, Math.max(m, 0))} · ${who === "you" ? "you" : "partner"} ${ageText(claimAge)}`,
      detail: claimAge === 67 ? "Full amount, claimed at 67" : claimAge < 67 ? "Reduced for claiming before 67" : "Raised for waiting past 67",
      amount: `+${formatWholeCurrency(monthly)}/mo`,
      tone: "event",
      check: null,
    });
  };
  social("you", sim.ssYou, sim.ssYouM, params.ssYou.claimAge);
  social("partner", sim.ssPartner, sim.ssPartnerM, params.ssPartner.claimAge);

  items.sort((x, y) => x.m - y.m);

  const first = items.find((item) => item.tone === "retire");
  if (first) {
    if (sim.gapM !== null) {
      const nextOpen = Math.min(horizon, ...sim.accounts.filter((a) => a.openM > (sim.gapM ?? 0)).map((a) => a.openM));
      first.check = {
        ok: false,
        text: `Open money runs out at ${Math.floor(yourAgeAt(params, sim.gapM))}, ${spanText(Math.max(0, nextOpen - sim.gapM))} before the next account opens. Retire later, or move some saving from the 401(k) to the brokerage.`,
      };
    } else if (sim.low !== null && sim.lowM !== null) {
      first.check = {
        ok: true,
        text: `Open money never runs dry before the rest unlock. Lowest point: ${formatCompactCurrency(sim.low)} in ${monthLabel(params.asOfMonth, sim.lowM)}.`,
      };
    }
  }
  return items.map((item) => ({
    key: item.key,
    title: item.title,
    when: item.when,
    detail: item.detail,
    amount: item.amount,
    tone: item.tone,
    check: item.check,
  }));
}

export interface FireLever {
  label: string;
  /** Earliest month index with the change, or null when not by 70. */
  monthIndex: number | null;
  /** Months sooner (negative) or later (positive) than the base; null when either is missing. */
  deltaMonths: number | null;
}

/** "What moves the date": three changes and the earliest date each gives. */
export function leverDates(params: FireParams, base: number | null): FireLever[] {
  const run = (label: string, change: (p: FireParams) => FireParams): FireLever => {
    const e = earliestRetirement(change(params));
    return { label, monthIndex: e, deltaMonths: e === null || base === null ? null : e - base };
  };
  return [
    run("Spend $500/mo less", (p) => ({ ...p, spendingMonthly: p.spendingMonthly - 500 })),
    run("Save $1,000/mo more", (p) => ({ ...p, cashSavedYearly: p.cashSavedYearly + 12000 })),
    run("Returns 1 point lower", (p) => ({ ...p, returnBefore: p.returnBefore - 0.01, returnAfter: p.returnAfter - 0.01, returnCrypto: p.returnCrypto - 0.01 })),
  ];
}

/** Yearly saving: cash saved plus every account's contributions. */
export function yearlySaving(params: FireParams): number {
  return params.cashSavedYearly + params.accounts.reduce((s, a) => s + a.contributionYearly, 0);
}

/** Saving as a share of pay, counting pre-tax payroll contributions as pay. */
export function savingsRate(params: FireParams): number | null {
  const preTax = params.accounts.filter((a) => PRE_TAX_PAYROLL.has(a.kind)).reduce((s, a) => s + a.contributionYearly, 0);
  const pay = (params.yourTakeHomeMonthly + params.partnerTakeHomeMonthly) * 12 + preTax;
  return pay > 0 ? yearlySaving(params) / pay : null;
}
