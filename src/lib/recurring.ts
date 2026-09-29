// Recurring-charge detection for the Analytics tab. Pure: no server or React
// imports, so the route runs it and the client shares its types. The rules
// are recorded in docs/plans/analytics-tab.md (Decision Log, Milestone 3).

import { classifyTransaction, type CashflowRow } from "@/lib/cashflow";
import { merchantKey } from "@/lib/merchant";

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringCharge {
  /** Normalized merchant key the charges were grouped by. */
  key: string;
  /** Display name: the latest charge's merchant name, else its transaction name. */
  merchant: string;
  cadence: Cadence;
  /** The latest charge, two decimals. */
  amount: string;
  /** What the charge costs per month at its cadence, two decimals. */
  monthlyEquivalent: string;
  firstDate: string;
  lastDate: string;
  /** lastDate plus one cadence, "YYYY-MM-DD". */
  nextExpected: string;
  count: number;
  /** Set for bills whose amount changes month to month. */
  varies: { min: string; max: string } | null;
  /** Set when the latest amount differs from the earlier charges' typical amount. */
  priceChange: { from: string; to: string; since: string } | null;
  /** First seen within the last 100 days (never for yearly charges). */
  isNew: boolean;
  categoryKey: string;
  accountName: string;
}

export interface RecurringSummary {
  charges: RecurringCharge[];
  monthlyTotal: string;
  yearlyTotal: string;
  /** Monthly total as a whole percent of average monthly spending; null without an average. */
  shareOfSpending: number | null;
  /** The date the detection ran, "YYYY-MM-DD". */
  asOf: string;
}

interface CadenceSpec {
  id: Cadence;
  /** Days between charges, inclusive band. */
  min: number;
  max: number;
  /** A charge is still active when its last date is within this many days of today. */
  activeWithin: number;
  /** Charges per month, for the monthly equivalent. */
  perMonth: number;
}

const CADENCES: CadenceSpec[] = [
  { id: "weekly", min: 6, max: 8, activeWithin: 12, perMonth: 52 / 12 },
  { id: "biweekly", min: 13, max: 15, activeWithin: 21, perMonth: 26 / 12 },
  { id: "monthly", min: 26, max: 35, activeWithin: 50, perMonth: 1 },
  { id: "quarterly", min: 85, max: 97, activeWithin: 140, perMonth: 1 / 3 },
  { id: "yearly", min: 350, max: 380, activeWithin: 550, perMonth: 1 / 12 },
];

// Bills whose amount may vary month to month and still count.
const BILL_PREFIXES = ["RENT_AND_UTILITIES", "LOAN_PAYMENTS"];
const BILL_KEYS = new Set(["GENERAL_SERVICES_INSURANCE"]);

const NEW_WITHIN_DAYS = 100;
/** Share of gaps that must fall in the cadence band, and of amounts that must be near the typical amount. */
const AGREEMENT = 0.7;

interface Charge {
  date: string;
  cents: number;
  row: CashflowRow;
}

function toCents(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Whole days since the epoch for a "YYYY-MM-DD" date. */
function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Amounts within the larger of $1.00 and 5% of the reference count as the same. */
function tolerance(referenceCents: number): number {
  return Math.max(100, Math.round(Math.abs(referenceCents) * 0.05));
}

/** One cadence after a date; calendar months clamp the day to the target month's length. */
export function addCadence(date: string, cadence: Cadence): string {
  const [y, m, d] = date.split("-").map(Number);
  if (cadence === "weekly" || cadence === "biweekly") {
    const t = Date.UTC(y, m - 1, d) + (cadence === "weekly" ? 7 : 14) * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, daysInTarget))}`;
}

function pickCadence(gaps: number[]): { spec: CadenceSpec; inBand: number } {
  let best: { spec: CadenceSpec; inBand: number } | null = null;
  for (const spec of CADENCES) {
    const inBand = gaps.filter((g) => g >= spec.min && g <= spec.max).length;
    if (!best || inBand > best.inBand) best = { spec, inBand };
  }
  return best as { spec: CadenceSpec; inBand: number };
}

function categoryKeyOf(row: CashflowRow): string {
  return row.categoryDetailed ?? row.category ?? "UNCATEGORIZED";
}

function isBill(categoryKey: string): boolean {
  return BILL_PREFIXES.some((prefix) => categoryKey.startsWith(prefix)) || BILL_KEYS.has(categoryKey);
}

/**
 * Amounts are steady when most of them sit near the typical (median) amount,
 * or when they change at most once along the series (a price change), so a
 * subscription that went up mid-year still counts.
 */
function isSteady(amounts: number[]): boolean {
  const typical = median(amounts);
  const nearTypical = amounts.filter((a) => Math.abs(a - typical) <= tolerance(typical)).length;
  if (nearTypical >= Math.ceil(amounts.length * AGREEMENT)) return true;
  let steps = 0;
  for (let i = 1; i < amounts.length; i++) {
    if (Math.abs(amounts[i] - amounts[i - 1]) > tolerance(amounts[i - 1])) steps++;
  }
  return steps <= 1;
}

const byDate = (a: Charge, b: Charge) => a.date.localeCompare(b.date);

/**
 * One merchant can carry several subscriptions (Apple bills iCloud and Music
 * separately under "Apple"). Cluster the charges by amount, then merge
 * clusters that follow one another in time, which is a price change, and keep
 * apart the ones that interleave, which are separate subscriptions.
 */
function splitByAmount(list: Charge[]): Charge[][] {
  const clusters: Charge[][] = [];
  for (const charge of [...list].sort((a, b) => a.cents - b.cents)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(charge.cents - last[0].cents) <= tolerance(last[0].cents)) last.push(charge);
    else clusters.push([charge]);
  }
  for (const cluster of clusters) cluster.sort(byDate);
  clusters.sort((a, b) => byDate(a[0], b[0]));
  const series: Charge[][] = [];
  for (const cluster of clusters) {
    const current = series[series.length - 1];
    if (current && cluster[0].date > current[current.length - 1].date) current.push(...cluster);
    else series.push([...cluster]);
  }
  return series;
}

function priceChangeOf(list: Charge[]): RecurringCharge["priceChange"] {
  if (list.length < 2) return null;
  const latest = list[list.length - 1];
  const earlierTypical = median(list.slice(0, -1).map((c) => c.cents));
  if (Math.abs(latest.cents - earlierTypical) <= tolerance(earlierTypical)) return null;
  let since = list.length - 1;
  while (since > 0 && Math.abs(list[since - 1].cents - latest.cents) <= tolerance(latest.cents)) since--;
  return { from: fromCents(earlierTypical), to: fromCents(latest.cents), since: list[since].date };
}

/**
 * Find the merchants that charge on a steady schedule among the rows (spending
 * only; pending rows, refunds, transfers and card payments are ignored),
 * largest monthly cost first.
 */
export function detectRecurringCharges(
  rows: CashflowRow[],
  options: { today: string; averageMonthlySpending: number | null }
): RecurringSummary {
  const today = dayNumber(options.today);

  const groups = new Map<string, Charge[]>();
  for (const row of rows) {
    if (row.pending) continue;
    if (classifyTransaction(row) !== "spending") continue;
    const cents = toCents(row.amount);
    if (cents <= 0) continue;
    const key = merchantKey(row);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ date: row.date, cents, row });
    groups.set(key, list);
  }

  const charges: RecurringCharge[] = [];
  for (const [key, group] of groups) {
    group.sort(byDate);
    if (group.length < 2) continue;
    // A bill's amount varies by design, so it stays one series.
    const bill = isBill(categoryKeyOf(group[group.length - 1].row));
    const found: RecurringCharge[] = [];

    for (const list of bill ? [group] : splitByAmount(group)) {
      if (list.length < 2) continue;
      const gaps: number[] = [];
      for (let i = 1; i < list.length; i++) gaps.push(dayNumber(list[i].date) - dayNumber(list[i - 1].date));
      const { spec, inBand } = pickCadence(gaps);
      const latest = list[list.length - 1];
      const amounts = list.map((c) => c.cents);
      const categoryKey = categoryKeyOf(latest.row);
      // Two charges a year apart are only a yearly charge when the amount is
      // the same to within 1% (or ten cents) and it is not food or drink: a
      // restaurant visited twice a year apart is not a membership.
      const qualifies =
        spec.id === "yearly"
          ? inBand >= 1 &&
            !categoryKey.startsWith("FOOD_AND_DRINK") &&
            Math.abs(amounts[amounts.length - 1] - amounts[0]) <= Math.max(10, Math.round(median(amounts) * 0.01))
          : list.length >= 3 && inBand >= 2 && inBand >= Math.ceil(gaps.length * AGREEMENT);
      if (!qualifies) continue;

      if (today - dayNumber(latest.date) > spec.activeWithin) continue;

      const steady = isSteady(amounts);
      if (!steady && !(bill && spec.id === "monthly")) continue;

      const first = list[0];
      found.push({
        key,
        merchant: latest.row.merchantName?.trim() || latest.row.name,
        cadence: spec.id,
        amount: fromCents(latest.cents),
        monthlyEquivalent: fromCents(Math.round(latest.cents * spec.perMonth)),
        firstDate: first.date,
        lastDate: latest.date,
        nextExpected: addCadence(latest.date, spec.id),
        count: list.length,
        varies: steady ? null : { min: fromCents(Math.min(...amounts)), max: fromCents(Math.max(...amounts)) },
        priceChange: steady ? priceChangeOf(list) : null,
        isNew: spec.id !== "yearly" && today - dayNumber(first.date) <= NEW_WITHIN_DAYS,
        categoryKey,
        accountName: latest.row.accountName,
      });
    }

    // Several subscriptions at one merchant get distinct keys.
    if (found.length > 1) for (const charge of found) charge.key = `${key} ${charge.amount}`;
    charges.push(...found);
  }

  charges.sort(
    (a, b) =>
      toCents(b.monthlyEquivalent) - toCents(a.monthlyEquivalent) || a.merchant.localeCompare(b.merchant)
  );

  const monthlyCents = charges.reduce((sum, c) => sum + toCents(c.monthlyEquivalent), 0);
  const average = options.averageMonthlySpending;
  return {
    charges,
    monthlyTotal: fromCents(monthlyCents),
    yearlyTotal: fromCents(monthlyCents * 12),
    shareOfSpending: average && average > 0 ? Math.round((monthlyCents / 100 / average) * 100) : null,
    asOf: options.today,
  };
}
