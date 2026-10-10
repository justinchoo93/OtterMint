"use client";

import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";
import { formatWholeCurrency } from "@/lib/format";
import type { FireAssumptions as Assumptions, FireCashflowSummary, FireOwner } from "@/lib/fire-model";
import { NumberField } from "./NumberField";

type NullableKey = "partnerTakeHomeMonthly" | "spendingMonthly" | "cashSavedYearly";

interface FireAssumptionsProps {
  assumptions: Assumptions;
  cashflow: FireCashflowSummary;
  /** The pension the projection uses, in today's dollars a month; null when none. */
  pensionMonthly: number | null;
  onChange: (patch: Partial<Assumptions>) => void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-3 p-0 text-caption font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Every assumption the projection uses, grouped; anything not here is listed under "About these numbers". */
export function FireAssumptions({ assumptions: a, cashflow, pensionMonthly, onChange }: FireAssumptionsProps) {
  const set = <K extends keyof Assumptions>(key: K) => (value: Assumptions[K]) => onChange({ [key]: value } as Partial<Assumptions>);
  const fromOtterMint = (key: NullableKey, label: string) =>
    a[key] === null ? (
      label
    ) : (
      <>
        {label} ·{" "}
        <button type="button" className="text-accent underline decoration-accent/40 underline-offset-2" onClick={() => onChange({ [key]: null })}>
          Use it
        </button>
      </>
    );
  const halfTakeHome = Math.round(cashflow.takeHomeMonthly / 2);
  const partnerTakeHome = a.partnerTakeHomeMonthly ?? halfTakeHome;
  const noPension = a.pensionOwner === "none";

  return (
    <Card aria-label="Assumptions">
      <CardHeader
        title="Assumptions"
        subtitle="Spending and cash saved start at what OtterMint saw over the last 12 months. Change anything and the date above moves."
      />
      <div className="mt-6 grid grid-cols-1 gap-x-7 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <Group title="You two">
          <NumberField label="Your age" value={a.yourAge} min={18} max={100} onChange={set("yourAge")} />
          <NumberField label="Partner’s age" value={a.partnerAge} min={18} max={100} onChange={set("partnerAge")} />
          <NumberField label="Plan until your age" value={a.planAge} min={Math.max(50, a.yourAge + 1)} max={110} onChange={set("planAge")} />
        </Group>
        <Group title="Who stops working when">
          <NumberField
            label="Partner retires"
            suffix="years after you"
            value={a.partnerOffsetYears}
            min={-30}
            max={30}
            hint="Use a minus sign if they stop first"
            onChange={set("partnerOffsetYears")}
          />
          <NumberField
            label="Partner’s take-home pay"
            prefix="$"
            suffix="/mo"
            value={partnerTakeHome}
            min={0}
            max={Math.max(0, cashflow.takeHomeMonthly)}
            hint={fromOtterMint(
              "partnerTakeHomeMonthly",
              `Yours is the rest of OtterMint’s ${formatWholeCurrency(cashflow.takeHomeMonthly)}/mo: ${formatWholeCurrency(cashflow.takeHomeMonthly - partnerTakeHome)}`
            )}
            onChange={set("partnerTakeHomeMonthly")}
          />
        </Group>
        <Group title="Spending in retirement">
          <NumberField
            label="Monthly spending"
            prefix="$"
            value={a.spendingMonthly ?? cashflow.spendingMonthly}
            min={0}
            max={1_000_000}
            hint={fromOtterMint("spendingMonthly", `Last 12 months in OtterMint: ${formatWholeCurrency(cashflow.spendingMonthly)}/mo`)}
            onChange={set("spendingMonthly")}
          />
          <NumberField
            label="Health insurance until 65"
            prefix="$"
            suffix="/mo"
            value={a.healthMonthly}
            min={0}
            max={1_000_000}
            hint="For both of you, once neither has a job"
            onChange={set("healthMonthly")}
          />
          <NumberField label="Tax on withdrawals" suffix="%" value={a.taxRatePct} min={0} max={60} onChange={set("taxRatePct")} />
        </Group>
        <Group title="Saving">
          <NumberField
            label="Cash saved per year"
            prefix="$"
            value={a.cashSavedYearly ?? cashflow.cashSavedYearly}
            min={-100_000_000}
            max={100_000_000}
            hint={fromOtterMint("cashSavedYearly", `Pay minus spending, last 12 months: ${formatWholeCurrency(cashflow.cashSavedYearly)}`)}
            onChange={set("cashSavedYearly")}
          />
          <NumberField
            label="Your Roth contributions so far"
            prefix="$"
            value={a.rothBasisYou}
            min={0}
            max={100_000_000}
            hint="Can come out any time; growth waits for 59½"
            onChange={set("rothBasisYou")}
          />
          <NumberField label="Partner’s Roth contributions so far" prefix="$" value={a.rothBasisPartner} min={0} max={100_000_000} onChange={set("rothBasisPartner")} />
        </Group>
        <Group title="Spending changes">
          <NumberField label="From your age" value={a.change1Age} min={18} max={110} onChange={set("change1Age")} />
          <NumberField
            label="Spending changes by"
            prefix="$"
            suffix="/mo"
            value={a.change1Monthly}
            min={-1_000_000}
            max={1_000_000}
            hint="Minus for less, e.g. a paid-off mortgage"
            onChange={set("change1Monthly")}
          />
          <NumberField label="Then from your age" value={a.change2Age} min={18} max={110} onChange={set("change2Age")} />
          <NumberField label="Spending changes by" prefix="$" suffix="/mo" value={a.change2Monthly} min={-1_000_000} max={1_000_000} onChange={set("change2Monthly")} />
        </Group>
        <Group title="Returns after inflation">
          <NumberField label="Before retiring" suffix="%" value={a.returnBeforePct} min={-10} max={20} onChange={set("returnBeforePct")} />
          <NumberField
            label="After retiring"
            suffix="%"
            value={a.returnAfterPct}
            min={-10}
            max={20}
            hint="Lower, to leave room for bad years"
            onChange={set("returnAfterPct")}
          />
          <NumberField label="Crypto" suffix="%" value={a.returnCryptoPct} min={-10} max={20} hint="Used before and after retiring" onChange={set("returnCryptoPct")} />
          <NumberField label="Inflation" suffix="%" value={a.inflationPct} min={0} max={15} hint="Only used to wear down the pension" onChange={set("inflationPct")} />
        </Group>
        <Group title="PERS 3 pension">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fire-pension-owner" className="text-caption text-ink-secondary">
              Whose pension
            </label>
            <select
              id="fire-pension-owner"
              className="h-11 rounded-control border border-line bg-surface-raised px-2 text-sm text-ink outline-none focus:border-chart-muted sm:h-10"
              value={a.pensionOwner}
              onChange={(e) => onChange({ pensionOwner: e.target.value as FireOwner | "none" })}
            >
              <option value="none">Nobody</option>
              <option value="you">Yours</option>
              <option value="partner">Partner’s</option>
            </select>
          </div>
          <NumberField label="Salary" prefix="$" suffix="/yr" value={a.pensionSalaryYearly} min={0} max={100_000_000} disabled={noPension} onChange={set("pensionSalaryYearly")} />
          <NumberField label="Years of service so far" value={a.pensionServiceYears} min={0} max={60} disabled={noPension} onChange={set("pensionServiceYears")} />
          <NumberField
            label="Start the pension at"
            value={a.pensionStartAge}
            min={55}
            max={65}
            disabled={noPension}
            hint={noPension ? "55 at the earliest; full amount at 65" : pensionMonthly ? `About ${formatWholeCurrency(pensionMonthly)}/mo in today’s dollars` : "Not vested by the time they leave"}
            onChange={set("pensionStartAge")}
          />
        </Group>
        <Group title="Social Security">
          <NumberField label="Yours at 67" prefix="$" suffix="/mo" value={a.ssYouMonthly} min={0} max={1_000_000} onChange={set("ssYouMonthly")} />
          <NumberField label="You claim at" value={a.ssYouClaimAge} min={62} max={70} hint="62 to 70" onChange={set("ssYouClaimAge")} />
          <NumberField label="Partner’s at 67" prefix="$" suffix="/mo" value={a.ssPartnerMonthly} min={0} max={1_000_000} onChange={set("ssPartnerMonthly")} />
          <NumberField label="Partner claims at" value={a.ssPartnerClaimAge} min={62} max={70} hint="62 to 70" onChange={set("ssPartnerClaimAge")} />
        </Group>
      </div>
      <p className="mt-6 text-micro text-ink-muted">
        Social Security estimates are at{" "}
        <a className="text-accent underline decoration-accent/40 underline-offset-2" href="https://www.ssa.gov/myaccount/" target="_blank" rel="noopener noreferrer">
          ssa.gov/myaccount
        </a>
        ; a PERS 3 pension estimate is in the DRS online account.
      </p>
    </Card>
  );
}
