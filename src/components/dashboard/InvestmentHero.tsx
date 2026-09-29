"use client";

import { Card, DeltaIndicator, SegmentedControl } from "@/components/ui";
import { InvestmentChart } from "@/components/dashboard/InvestmentChart";
import { formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";
import {
  INVESTMENT_RANGES,
  formatLongDate,
  formatShortDate,
  type InvestmentRange,
  type SeriesPoint,
  type Stretch,
} from "@/lib/investments-model";

const RANGE_OPTIONS = INVESTMENT_RANGES.map((r) => ({ value: r.id, label: r.label }));

export interface InvestmentHeroProps {
  label: string;
  /** The live value for the scope. */
  value: number;
  stretch: Stretch | null;
  /** "since Jul 1 · earliest history"; shown when nothing is hovered. */
  caption: string;
  hovered: SeriesPoint | null;
  points: SeriesPoint[];
  range: InvestmentRange;
  onRangeChange: (range: InvestmentRange) => void;
  onActivePoint: (point: SeriesPoint | null) => void;
  /** First date with a known set of covered accounts (All scope only). */
  firstTrustedDate: string | null;
  /** Dates on which the set of covered accounts changed inside the window. */
  boundaries: string[];
}

function deltaFor(amount: number, pct: number | null) {
  const text = formatSignedWholeCurrency(amount) + (pct !== null ? ` (${formatSignedPercent(pct)})` : "");
  const direction = amount > 0 ? "up" : amount < 0 ? "down" : "flat";
  const tone = amount > 0 ? "positive" : amount < 0 ? "negative" : "neutral";
  return { text, direction, tone } as const;
}

/** The value, its change over the comparable stretch, the chart and the range control. */
export function InvestmentHero({
  label,
  value,
  stretch,
  caption,
  hovered,
  points,
  range,
  onRangeChange,
  onActivePoint,
  firstTrustedDate,
  boundaries,
}: InvestmentHeroProps) {
  const last = points.at(-1);
  const hoveredComparable =
    hovered !== null && stretch !== null && last !== undefined && hovered.segment === last.segment && hovered.date >= stretch.fromDate;
  const shownValue = hovered ? hovered.value : value;
  const delta = hovered
    ? hoveredComparable
      ? deltaFor(hovered.value - stretch!.startValue, stretch!.startValue !== 0 ? ((hovered.value - stretch!.startValue) / Math.abs(stretch!.startValue)) * 100 : null)
      : null
    : stretch
      ? deltaFor(stretch.amount, stretch.pct)
      : null;
  const shownCaption = hovered ? formatLongDate(hovered.date) : caption;

  return (
    <Card padding="lg" aria-label="Investments over time">
      <div className="flex flex-col items-start">
        <span className="text-caption font-medium text-ink-secondary">{label}</span>
        <span className="mt-2 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.025em] text-ink sm:text-hero">
          {formatWholeCurrency(shownValue)}
        </span>
        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {delta && (
            <DeltaIndicator size="md" direction={delta.direction} tone={delta.tone}>
              {delta.text}
            </DeltaIndicator>
          )}
          {shownCaption && <span className="text-ink-secondary">{shownCaption}</span>}
        </div>
      </div>

      <div className="mt-5 min-w-0">
        <InvestmentChart points={points} onActivePoint={onActivePoint} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          ariaLabel="Time range"
          options={RANGE_OPTIONS}
          value={range}
          onChange={onRangeChange}
          fullWidth
          className="sm:inline-flex sm:w-auto"
        />
        <details className="group text-xs text-ink-muted sm:max-w-[620px]">
          <summary className="cursor-pointer list-none py-3.5 select-none hover:text-ink-secondary sm:py-0 [&::-webkit-details-marker]:hidden">
            <span className="text-accent underline decoration-accent/40 underline-offset-2">About this chart</span>
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            <p>
              Balances are what each brokerage reported at the last refresh of the day. Deposits and withdrawals move
              the line; the tiles below separate them from market gain.
              {firstTrustedDate &&
                ` Before ${formatLongDate(firstTrustedDate)} the set of accounts covered is unknown, so change figures are measured across trusted history only.`}
            </p>
            {boundaries.map((date) => (
              <p key={date}>{formatShortDate(date)} · account set changed</p>
            ))}
          </div>
        </details>
      </div>
    </Card>
  );
}
