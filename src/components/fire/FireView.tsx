"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Card, EmptyState, Skeleton, cx } from "@/components/ui";
import { formatCompactCurrency, formatWholeCurrency } from "@/lib/format";
import {
  ageText,
  buildTimeline,
  defaultPlan,
  describeStatus,
  earliestRetirement,
  leverDates,
  maxRetireMonth,
  monthLabel,
  resolveParams,
  savingsRate,
  simulate,
  spanText,
  yearOf,
  yearlySaving,
  type FireAppAccountChoice,
  type FireAssumptions as Assumptions,
  type FirePlan,
  type FireResponse,
  type FireTypedAccount,
} from "@/lib/fire-model";
import { FireAccounts } from "./FireAccounts";
import { FireAssumptions } from "./FireAssumptions";
import { FireChart } from "./FireChart";
import { FireTimeline } from "./FireTimeline";

const SAVE_DELAY_MS = 800;

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; data: FireResponse };
type SaveState = "idle" | "saving" | "saved" | "error";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function newTypedId(existing: FireTypedAccount[]): string {
  const base = `acct-${Date.now().toString(36)}`;
  let id = base;
  for (let i = 2; existing.some((a) => a.id === id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * The FIRE destination: the earliest month the household could retire, what
 * pays for which years, and every assumption behind it. The plan saves itself
 * to the owner's login; accounts typed here never touch real accounts.
 */
export function FireView({ refreshKey }: { refreshKey?: number }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [plan, setPlan] = useState<FirePlan>(defaultPlan);
  const [everSaved, setEverSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pickedAge, setPickedAge] = useState<number | null>(null);
  const planRef = useRef<FirePlan>(plan);
  const pending = useRef<FirePlan | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch("/api/fire", { signal: controller.signal });
        if (!response.ok) throw new Error(`FIRE request failed: ${response.status}`);
        const data = (await response.json()) as FireResponse;
        setLoad({ status: "ready", data });
        // A refresh must not throw away edits that are still waiting to save.
        if (!pending.current) {
          const loaded = data.plan ?? defaultPlan();
          planRef.current = loaded;
          setPlan(loaded);
          setEverSaved(data.plan !== null);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load the FIRE plan:", error);
        setLoad((current) => (current.status === "ready" ? current : { status: "error" }));
      }
    };
    run();
    return () => controller.abort();
  }, [refreshKey]);

  const flush = useCallback(async (keepalive = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const response = await fetch("/api/fire", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
        keepalive,
      });
      if (!response.ok) throw new Error(`FIRE save failed: ${response.status}`);
      setSaveState("saved");
      setEverSaved(true);
    } catch (error) {
      console.error("Failed to save the FIRE plan:", error);
      setSaveState("error");
    }
  }, []);

  // Save whatever is still waiting when the page goes away.
  useEffect(() => () => void flush(true), [flush]);

  const update = useCallback(
    (change: (current: FirePlan) => FirePlan) => {
      const next = change(planRef.current);
      planRef.current = next;
      pending.current = next;
      setPlan(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  const setAssumptions = useCallback(
    (patch: Partial<Assumptions>) => update((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } })),
    [update]
  );
  const setAppChoice = useCallback(
    (key: string, patch: FireAppAccountChoice) =>
      update((p) => ({ ...p, appAccounts: { ...p.appAccounts, [key]: { ...p.appAccounts[key], ...patch } } })),
    [update]
  );
  const setTyped = useCallback(
    (id: string, patch: Partial<FireTypedAccount>) =>
      update((p) => ({ ...p, typedAccounts: p.typedAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    [update]
  );
  const removeTyped = useCallback(
    (id: string) => update((p) => ({ ...p, typedAccounts: p.typedAccounts.filter((a) => a.id !== id) })),
    [update]
  );
  const addTyped = useCallback(
    () =>
      update((p) => ({
        ...p,
        typedAccounts: [
          ...p.typedAccounts,
          { id: newTypedId(p.typedAccounts), name: "New account", owner: "you", kind: "brokerage", balance: 0, contributionYearly: 0 },
        ],
      })),
    [update]
  );

  const data = load.status === "ready" ? load.data : null;
  const params = useMemo(() => (data ? resolveParams(data, plan) : null), [data, plan]);
  const base = useMemo(() => (params ? earliestRetirement(params) : null), [params]);
  const maxM = params ? maxRetireMonth(params) : 0;
  const pickedM = params && pickedAge !== null ? Math.round((pickedAge - params.yourAge) * 12) : null;
  const selM = clamp(pickedM ?? base ?? maxM, 0, maxM);
  const sim = useMemo(() => (params ? simulate(params, selM) : null), [params, selM]);
  const baseSim = useMemo(() => (params && base !== null ? simulate(params, base) : null), [params, base]);
  const timeline = useMemo(() => (params && sim ? buildTimeline(params, sim) : []), [params, sim]);
  const levers = useMemo(() => (params ? leverDates(params, base) : []), [params, base]);

  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-6" data-testid="fire-skeleton">
        <Skeleton radius="card" className="h-[460px]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} radius="tile" className="h-[104px]" />
          ))}
        </div>
        <Skeleton radius="card" className="h-[420px]" />
      </div>
    );
  }
  if (load.status === "error" || !params || !sim || !data) {
    return (
      <Card>
        <EmptyState>The FIRE plan couldn&apos;t load. Try Refresh.</EmptyState>
      </Card>
    );
  }

  const youAt = (m: number) => ageText(params.yourAge + m / 12);
  const partnerAt = (m: number) => ageText(params.partnerAge + m / 12);
  const investedNow = sim.path[0];

  let heroBig: string;
  let heroSub: string;
  let progressPct = 0;
  let progressText = formatCompactCurrency(investedNow);
  let progressCaption = "No retirement date works yet";
  if (base === null || !baseSim) {
    heroBig = "Not by 70";
    heroSub = "Even working to 70 the money runs short. Try lower spending or more saving below.";
  } else {
    const needed = baseSim.path[base];
    heroBig = base === 0 ? "Now" : monthLabel(params.asOfMonth, base);
    heroSub =
      `${base === 0 ? "You could stop today" : `In ${spanText(base)}`} · you ${youAt(base)}` +
      (baseSim.pM === base ? `, partner ${partnerAt(base)}` : ` · partner stops ${monthLabel(params.asOfMonth, baseSim.pM)} at ${partnerAt(baseSim.pM)}`);
    progressPct = needed > 0 ? clamp(Math.round((investedNow / needed) * 100), 0, 100) : 100;
    progressText = `${formatCompactCurrency(investedNow)} of ${formatCompactCurrency(needed)}`;
    progressCaption = `${progressPct}% of what you’d have invested on that date`;
  }

  const status = describeStatus(params, sim);
  const together = sim.pM === sim.yM;
  const sliderMin = Math.ceil(params.yourAge);
  const sliderMax = Math.max(sliderMin, Math.floor(params.yourAge + maxM / 12));
  const rate = savingsRate(params);
  const guaranteed = sim.pension.monthly + sim.ssYou + sim.ssPartner;
  const lastStart = Math.max(
    sim.pension.monthly > 0 ? sim.pension.startM : 0,
    sim.ssYou > 0 ? sim.ssYouM : 0,
    sim.ssPartner > 0 ? sim.ssPartnerM : 0,
    selM
  );
  const counted = params.accounts.filter((a) => !a.isNewSavings).length;
  const tiles = [
    { label: "Invested today", value: formatWholeCurrency(investedNow), sub: `${counted} accounts, ${plan.typedAccounts.length} entered by hand` },
    {
      label: "Saved per year",
      value: formatWholeCurrency(yearlySaving(params)),
      sub: rate === null ? "No pay recorded yet" : `${Math.round(rate * 100)}% of pay, counting payroll contributions`,
    },
    {
      label: "Spending in retirement",
      value: `${formatWholeCurrency(params.spendingMonthly)}/mo`,
      sub: `+ ${formatWholeCurrency(params.healthMonthly)}/mo health insurance until 65`,
    },
    {
      label: "Pension and Social Security",
      value: `${formatWholeCurrency(guaranteed)}/mo`,
      sub: guaranteed > 0 ? `In today’s dollars; full amount from ${yearOf(params.asOfMonth, lastStart)}` : "Nothing entered yet",
    },
  ];
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Couldn’t save. Your next change will try again."
        : everSaved
          ? "Saved"
          : "Not saved yet";

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption">
        {everSaved ? (
          <span />
        ) : (
          <p className="text-ink-secondary">Start with your ages and the accounts OtterMint can&apos;t see. Nothing here changes your real accounts.</p>
        )}
        <span role="status" className={saveState === "error" ? "text-negative" : "text-ink-muted"}>
          {saveLabel}
        </span>
      </div>

      <Card padding="lg" aria-label="Earliest retirement">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col">
            <span className="text-caption font-medium text-ink-secondary">Earliest you could retire</span>
            <span className="mt-2 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.025em] text-ink sm:text-hero" data-testid="fire-headline">
              {heroBig}
            </span>
            <span className="mt-3 text-sm text-ink-secondary">{heroSub}</span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-[340px]">
            <div className="flex justify-between gap-3 text-caption">
              <span className="text-ink-secondary">Invested today</span>
              <span className="font-mono font-semibold text-ink">{progressText}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progress toward what you need at retirement"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              className="h-2 overflow-hidden rounded-full bg-surface-active"
            >
              <div className="h-2 rounded-full bg-accent" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-micro text-ink-muted">{progressCaption}</span>
          </div>
        </div>

        <FireChart params={params} sim={sim} />

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label htmlFor="fire-retire-at" className="whitespace-nowrap text-caption font-medium text-ink-secondary">
            Try retiring at
          </label>
          <input
            id="fire-retire-at"
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={clamp(Math.round(params.yourAge + selM / 12), sliderMin, sliderMax)}
            onChange={(event) => setPickedAge(Number(event.target.value))}
            className="h-11 min-w-[200px] flex-1 accent-[var(--accent-mint)] sm:max-w-[360px]"
          />
          <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink">
            {monthLabel(params.asOfMonth, selM)}
            {together ? "" : ` · partner ${monthLabel(params.asOfMonth, sim.pM)}`}
          </span>
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium",
              status.ok ? "bg-accent-dim text-accent" : "bg-negative/[0.12] text-negative"
            )}
            data-testid="fire-status"
          >
            {status.ok ? <Check aria-hidden className="h-3.5 w-3.5" /> : <TriangleAlert aria-hidden className="h-3.5 w-3.5" />}
            {status.text}
          </span>
          {pickedAge !== null && base !== null && selM !== base && (
            <button
              type="button"
              onClick={() => setPickedAge(null)}
              className="min-h-11 text-caption text-accent underline decoration-accent/40 underline-offset-2 sm:min-h-0"
            >
              Back to earliest
            </button>
          )}
        </div>

        <details className="mt-4 max-w-3xl text-micro text-ink-muted">
          <summary className="inline-block cursor-pointer text-caption text-accent underline decoration-accent/40 underline-offset-2">
            About these numbers
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 leading-relaxed">
            <li>
              Everything is in today&apos;s dollars. Returns are after inflation and move in a straight line; there are no bad years, which is why the return
              after retiring is set lower. The lower return starts when the first of you stops working. Cash earns nothing.
            </li>
            <li>
              Until someone retires, saving stays flat: the cash you save goes into &ldquo;New savings&rdquo;, and each account gets its yearly amount from the
              table. No raises. While only one of you works, that person keeps contributing, their take-home pay covers spending first, and any surplus goes
              to New savings.
            </li>
            <li>
              Spending is flat apart from the changes you enter, which start once one of you stops working. Health insurance is free while either of you
              works, then half the amount for each of you until you each turn 65. There are no Medicare premiums and no one-off costs.
            </li>
            <li>
              One tax rate applies to every withdrawal, including Roth and brokerage money that would really be taxed less. The pension and Social Security
              are treated as tax-free.
            </li>
            <li>
              Withdrawals go cash, brokerage, crypto, 457(b), PERS 3 investment account, 401(k), traditional IRA, then Roth IRAs, taking only from what is
              open. A 401(k) or PERS 3 investment account opens if its owner stops working in or after the year they turn 55, otherwise at 59½; for PERS 3
              that follows the IRS rule, though DRS only says the penalty &ldquo;might&rdquo; apply. A 457(b) opens when its owner leaves. Roth
              contributions come out any time, growth at 59½. No Roth conversions, 72(t) payments or required minimum distributions.
            </li>
            <li>
              The PERS 3 pension is 1% of salary per year of service, using today&apos;s salary as the final average, reduced by DRS&apos;s factors when it
              starts before 65 (ages between DRS&apos;s published ones are interpolated). After leaving it only grows with 20 or more years of service, so
              inflation wears it down until it starts. Once it starts it keeps pace with inflation (DRS caps raises at 3% a year) and is paid as a single
              life benefit; a survivor option would lower it.
            </li>
            <li>
              Social Security follows SSA&apos;s rules: 30% less at 62, 24% more at 70. Retiring early also lowers the benefit itself, so use your ssa.gov
              estimate.
            </li>
            <li>
              Checking and savings start as not counted, and home equity isn&apos;t counted. A date works if the money lasts to the plan age with anything
              left. The search stops at 70.
            </li>
          </ul>
        </details>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1.5 rounded-tile border border-line bg-surface p-4 sm:p-5">
            <span className="text-caption font-medium text-ink-secondary">{tile.label}</span>
            <span className="font-mono text-[1.375rem] font-semibold tracking-[-0.01em] text-ink">{tile.value}</span>
            <span className="text-micro text-ink-muted">{tile.sub}</span>
          </div>
        ))}
      </div>

      <FireTimeline items={timeline} subtitle={`If you retire in ${monthLabel(params.asOfMonth, selM)}. Balances are what each account would hold on that date.`} />

      <FireAccounts
        accounts={data.accounts}
        plan={plan}
        cashSavedYearly={params.cashSavedYearly}
        onAppChoice={setAppChoice}
        onTypedChange={setTyped}
        onTypedRemove={removeTyped}
        onTypedAdd={addTyped}
      />

      <FireAssumptions
        assumptions={plan.assumptions}
        cashflow={data.cashflow}
        pensionMonthly={sim.pension.monthly > 0 ? sim.pension.monthly : null}
        onChange={setAssumptions}
      />

      <section aria-label="What moves the date" className="flex flex-col gap-3">
        <h2 className="font-serif text-[1.375rem] leading-[1.15] font-normal text-ink sm:text-title">What moves the date</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {levers.map((lever) => {
            const delta = lever.deltaMonths;
            const sub =
              lever.monthIndex === null
                ? "No date works"
                : base === null
                  ? "Makes retirement possible"
                  : delta === 0 || delta === null
                    ? "No change"
                    : `${spanText(Math.abs(delta))} ${delta < 0 ? "sooner" : "later"}`;
            const tone = lever.monthIndex === null || (delta ?? 0) > 0 ? "text-negative" : (delta ?? 0) < 0 || base === null ? "text-accent" : "text-ink-muted";
            return (
              <div key={lever.label} className="flex flex-col gap-1.5 rounded-tile border border-line bg-surface p-4 sm:p-5">
                <span className="text-caption font-medium text-ink-secondary">{lever.label}</span>
                <span className="font-mono text-[1.375rem] font-semibold text-ink">
                  {lever.monthIndex === null ? "Not by 70" : monthLabel(params.asOfMonth, lever.monthIndex)}
                </span>
                <span className={cx("text-caption font-medium", tone)}>{sub}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
