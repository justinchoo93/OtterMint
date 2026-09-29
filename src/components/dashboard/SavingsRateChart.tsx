"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthAxisLabel, monthLongLabel, monthRate, monthShortLabel, rateScale } from "@/lib/analytics-model";
import type { CashflowMonth } from "@/lib/cashflow";

interface SavingsRateChartProps {
  /** The window's months, oldest first. */
  months: CashflowMonth[];
}

interface Datum {
  month: string;
  rate: number | null;
  partial: boolean;
}

const LINE_COLOR = "var(--accent-mint)";
const TICK = { fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" };

/** One line: the share of income kept each month. Months without income leave a gap. */
export function SavingsRateChart({ months }: SavingsRateChartProps) {
  const data: Datum[] = months.map((m) => ({ month: m.month, rate: monthRate(m), partial: m.partial }));
  const rates = data.map((d) => d.rate).filter((r): r is number => r !== null);
  const { domain, ticks } = rateScale(rates);
  const dense = months.length > 12;
  const last = [...data].reverse().find((d) => d.rate !== null);

  return (
    <div className="h-[176px] sm:h-[232px]">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 232 }}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 44, bottom: 0, left: 0 }}
          title="Share of income kept each month"
          desc="Use the left and right arrow keys to read values by month."
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="month"
            interval={dense ? 2 : 0}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(month: string) => (dense ? monthAxisLabel(month) : monthShortLabel(month))}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            interval={0}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}%`}
            width={44}
          />
          <ReferenceLine y={0} stroke="var(--chart-baseline)" />
          <Tooltip
            cursor={{ stroke: "var(--chart-muted-line)", strokeWidth: 1 }}
            content={({ active, label }) => {
              if (!active || label === undefined) return null;
              const datum = data.find((d) => d.month === label);
              if (!datum || datum.rate === null) return null;
              return (
                <div className="rounded-control border border-line bg-surface-raised px-3 py-2 text-xs text-ink shadow-popover">
                  <div className="text-ink-secondary">
                    {monthLongLabel(datum.month)}
                    {datum.partial ? " · to date" : ""}
                  </div>
                  <div className="mt-0.5 text-[15px] font-semibold">{Math.round(datum.rate)}% kept</div>
                </div>
              );
            }}
          />
          <Area
            type="linear"
            dataKey="rate"
            stroke="none"
            fill={LINE_COLOR}
            fillOpacity={0.1}
            baseValue={0}
            isAnimationActive={false}
            activeDot={false}
            tooltipType="none"
            connectNulls={false}
          />
          <Line
            type="linear"
            dataKey="rate"
            name="Savings rate"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={rates.length === 1 ? { r: 3, fill: LINE_COLOR, strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--bg-secondary)", strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          {last && last.rate !== null && (
            <ReferenceDot
              x={last.month}
              y={last.rate}
              r={4}
              fill={LINE_COLOR}
              stroke="var(--bg-secondary)"
              strokeWidth={2}
              label={{
                value: `${Math.round(last.rate)}%`,
                position: "right",
                offset: 8,
                fill: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
