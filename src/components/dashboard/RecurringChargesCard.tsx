"use client";

import { Card, CardHeader, cx, EmptyState, Skeleton } from "@/components/ui";
import type { Cadence, RecurringCharge, RecurringSummary } from "@/lib/recurring";
import { formatCurrency, formatWholeCurrency } from "@/lib/format";

export interface RecurringState {
  status: "loading" | "ready" | "error";
  summary: RecurringSummary | null;
}

interface RecurringChargesCardProps {
  state: RecurringState;
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 22", or "Mar 14, 2027" when the year differs from the as-of date's. */
function shortDate(date: string, asOf: string): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  const day = Number(date.slice(8, 10));
  return date.slice(0, 4) === asOf.slice(0, 4) ? `${month} ${day}` : `${month} ${day}, ${date.slice(0, 4)}`;
}

function notes(charge: RecurringCharge, asOf: string): Array<{ tag: string; detail: string }> {
  const out: Array<{ tag: string; detail: string }> = [];
  if (charge.priceChange) {
    const up = Number.parseFloat(charge.priceChange.to) > Number.parseFloat(charge.priceChange.from);
    out.push({
      tag: up ? "Price up" : "Price down",
      detail: `was ${formatCurrency(charge.priceChange.from)} before ${shortDate(charge.priceChange.since, asOf)}`,
    });
  }
  if (charge.isNew) out.push({ tag: "New", detail: `first seen ${shortDate(charge.firstDate, asOf)}` });
  if (charge.varies) {
    out.push({ tag: "Varies", detail: `${formatCurrency(charge.varies.min)}–${formatCurrency(charge.varies.max)} over the year` });
  }
  return out;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-[1.25rem] leading-[1.1] font-semibold text-ink">{value}</span>
    </span>
  );
}

/** Every merchant that charges on a steady schedule, largest monthly cost first. Not scoped by the time range. */
export function RecurringChargesCard({ state }: RecurringChargesCardProps) {
  const summary = state.summary;
  const found = summary ? `${summary.charges.length} found` : null;
  return (
    <Card aria-label="Recurring charges" className="flex flex-col">
      <CardHeader
        title="Recurring charges"
        subtitle={`Charges that repeat on a steady schedule · as of today${found ? ` · ${found}` : ""}`}
        actions={
          summary && summary.charges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Stat label="Per month" value={formatWholeCurrency(summary.monthlyTotal)} />
              <Stat label="Per year" value={formatWholeCurrency(summary.yearlyTotal)} />
              {summary.shareOfSpending !== null && (
                <Stat label="Of monthly spending" value={`${summary.shareOfSpending}%`} />
              )}
            </div>
          ) : undefined
        }
      />

      {state.status === "loading" && !summary ? (
        <Skeleton radius="tile" className="mt-4 h-[320px]" />
      ) : state.status === "error" && !summary ? (
        <EmptyState className="mt-4">Recurring charges couldn&apos;t load. Try Refresh.</EmptyState>
      ) : !summary || summary.charges.length === 0 ? (
        <EmptyState className="mt-4">
          No recurring charges found yet. They appear after three charges at a steady interval.
        </EmptyState>
      ) : (
        <div className={cx("mt-4 transition-opacity", state.status === "loading" && "opacity-60")}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs font-medium text-ink-muted">
                <th className="py-2 pr-3 pl-2.5 font-medium">Merchant</th>
                <th className="hidden w-28 py-2 pr-3 font-medium md:table-cell">Cadence</th>
                <th className="w-24 py-2 pr-3 text-right font-medium">Amount</th>
                <th className="hidden w-28 py-2 pr-3 font-medium md:table-cell">Last charged</th>
                <th className="hidden w-32 py-2 pr-3 font-medium md:table-cell">Next expected</th>
                <th className="hidden py-2 pr-2.5 font-medium md:table-cell">Note</th>
              </tr>
            </thead>
            <tbody>
              {summary.charges.map((charge) => {
                const chips = notes(charge, summary.asOf);
                return (
                  <tr key={charge.key} className="border-t border-line-subtle">
                    <td className="py-2.5 pr-3 pl-2.5 align-top">
                      <span className="block truncate text-sm text-ink">{charge.merchant}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-muted md:hidden">
                        {CADENCE_LABEL[charge.cadence]} · next {shortDate(charge.nextExpected, summary.asOf)}
                        {chips.length > 0 ? ` · ${chips.map((c) => c.tag).join(" · ")}` : ""}
                      </span>
                    </td>
                    <td className="hidden py-2.5 pr-3 align-top text-ink-secondary md:table-cell">
                      {CADENCE_LABEL[charge.cadence]}
                    </td>
                    <td className="py-2.5 pr-3 text-right align-top font-mono text-ink tabular-nums">
                      {formatCurrency(charge.amount)}
                    </td>
                    <td className="hidden py-2.5 pr-3 align-top text-ink-secondary md:table-cell">
                      {shortDate(charge.lastDate, summary.asOf)}
                    </td>
                    <td className="hidden py-2.5 pr-3 align-top text-ink-secondary md:table-cell">
                      {shortDate(charge.nextExpected, summary.asOf)}
                    </td>
                    <td className="hidden py-2.5 pr-2.5 align-top md:table-cell">
                      {chips.length > 0 && (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {chips.map((chip) => (
                            <span key={chip.tag} className="flex items-center gap-2">
                              <span className="inline-flex h-5 items-center rounded-md bg-surface-hover px-2 text-[11px] font-semibold whitespace-nowrap text-ink">
                                {chip.tag}
                              </span>
                              <span className="text-xs text-ink-muted">{chip.detail}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-auto pt-3 text-xs text-ink-muted">
        <p>Detected from 12 months of transactions. A charge counts once it has repeated three times at a steady interval.</p>
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none py-3.5 select-none hover:text-ink-secondary sm:py-0 [&::-webkit-details-marker]:hidden">
            <span className="text-accent underline decoration-accent/40 underline-offset-2">How detection works</span>
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            <p>
              Spending is grouped by merchant, and a merchant counts when its charges land every week, two weeks,
              month, quarter or year, and the amount stays the same (a single price change is allowed). Yearly
              charges count after two.
            </p>
            <p>
              Rent, utilities, loan payments and insurance count even when the amount changes, and are marked
              Varies. A charge drops off once it is overdue by half a period.
            </p>
            <p>Per month spreads yearly, quarterly and weekly charges over a month; the share compares that with an average complete month&apos;s spending.</p>
          </div>
        </details>
      </div>
    </Card>
  );
}
