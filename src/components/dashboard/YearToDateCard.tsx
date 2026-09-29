"use client";

import { Card, CardHeader, DeltaIndicator, EmptyState } from "@/components/ui";
import { monthLongLabel, spanLabel, type Delta, type YearToDate } from "@/lib/analytics-model";
import { formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";

interface YearToDateCardProps {
  data: YearToDate | null;
}

const LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function Tile({
  label,
  value,
  delta,
  comparedWith,
  caption,
}: {
  label: string;
  value: string;
  delta: Delta | null;
  comparedWith: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-tile bg-surface-raised p-3.5 sm:p-4">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <span className="text-[1.375rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-figure">{value}</span>
      {delta && (
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted">
          <DeltaIndicator
            direction={delta.direction}
            tone={delta.direction === "flat" ? "neutral" : delta.good ? "positive" : "negative"}
          >
            {formatSignedPercent(delta.pct, 0)}
          </DeltaIndicator>
          <span>vs {comparedWith}</span>
        </span>
      )}
      <span className="text-xs text-ink-muted">{caption}</span>
    </div>
  );
}

/** This year, January through the current month, against the same months last year. */
export function YearToDateCard({ data }: YearToDateCardProps) {
  if (!data) {
    return (
      <Card aria-label="Year to date" className="flex flex-col">
        <CardHeader title="This year so far" />
        <EmptyState className="mt-4">No transactions this year yet.</EmptyState>
      </Card>
    );
  }

  const year = data.thisYear[0].month.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const count = data.thisYear.length;
  const { totals, deltas } = data;
  const savedShare = totals.income > 0 ? Math.round((totals.savings / totals.income) * 100) : null;
  const keptShare = totals.income > 0 ? Math.round((totals.netCashFlow / totals.income) * 100) : null;
  const current = data.thisYear[count - 1];
  const stripMax = Math.max(0, ...data.strip.map((v) => v ?? 0));

  return (
    <Card aria-label="Year to date" className="flex flex-col">
      <CardHeader
        title={`${year} so far`}
        subtitle={data.lastYear ? `${data.label} compared with ${spanLabel(data.lastYear)}` : data.label}
      />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile
          label="Income"
          value={formatWholeCurrency(totals.income)}
          delta={deltas.income}
          comparedWith={lastYear}
          caption={`${formatWholeCurrency(totals.income / count)} a month`}
        />
        <Tile
          label="Spending"
          value={formatWholeCurrency(totals.spending)}
          delta={deltas.spending}
          comparedWith={lastYear}
          caption={`${formatWholeCurrency(totals.spending / count)} a month`}
        />
        <Tile
          label="Saved"
          value={formatWholeCurrency(totals.savings)}
          delta={deltas.savings}
          comparedWith={lastYear}
          caption={savedShare === null ? "no income yet" : `${savedShare}% of income`}
        />
        <Tile
          label="Net cash flow"
          value={formatSignedWholeCurrency(totals.netCashFlow)}
          delta={deltas.netCashFlow}
          comparedWith={lastYear}
          caption={keptShare === null ? "no income yet" : `${keptShare}% of income kept`}
        />
      </div>

      {(data.highest || data.lowest) && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line-subtle pt-3.5 text-[13px]">
          {data.highest && (
            <div className="flex justify-between gap-3">
              <span className="text-ink-secondary">Highest spending month</span>
              <span className="font-semibold whitespace-nowrap text-ink">
                {monthLongLabel(data.highest.month)} · {formatWholeCurrency(data.highest.total)}
              </span>
            </div>
          )}
          {data.lowest && (
            <div className="flex justify-between gap-3">
              <span className="text-ink-secondary">Lowest spending month</span>
              <span className="font-semibold whitespace-nowrap text-ink">
                {monthLongLabel(data.lowest.month)} · {formatWholeCurrency(data.lowest.total)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs text-ink-secondary">Spending by month</span>
        <div aria-hidden className="flex h-11 items-end gap-1 sm:h-14">
          {data.strip.map((value, index) => (
            <span
              key={index}
              className={value === null ? "min-w-0 flex-1" : "min-h-[2px] min-w-0 flex-1 rounded-t-sm bg-series-spending"}
              style={
                value === null
                  ? undefined
                  : {
                      height: stripMax > 0 ? `${(Math.max(value, 0) / stripMax) * 100}%` : "2px",
                      opacity: current.partial && index === count - 1 ? 0.55 : 1,
                    }
              }
            />
          ))}
        </div>
        <div aria-hidden className="flex gap-1 font-mono text-[10px]">
          {LETTERS.map((letter, index) => (
            <span
              key={index}
              className={`min-w-0 flex-1 text-center ${data.strip[index] === null ? "text-chart-muted" : "text-ink-muted"}`}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      {data.note && <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-muted">{data.note}</p>}
    </Card>
  );
}
