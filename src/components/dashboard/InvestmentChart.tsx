"use client";

import { useEffect, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  useActiveTooltipDataPoints,
} from "recharts";
import { netWorthScale } from "@/lib/analytics-model";
import { formatCompactCurrency } from "@/lib/format";
import { formatShortDate, investmentAxisTicks, type SeriesPoint } from "@/lib/investments-model";

const LINE_COLOR = "var(--accent-mint)";

interface Datum {
  timestamp: number;
  value: number;
  date: string;
  segment: number;
}

function dateTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * Lives inside the chart so it sees the point under the mouse and under
 * keyboard navigation alike, and hands it to the hero.
 */
function ActivePointReporter({ onChange }: { onChange: (point: SeriesPoint | null) => void }) {
  const active = useActiveTooltipDataPoints() as ReadonlyArray<Datum> | undefined;
  const first = active && active.length > 0 ? active[0] : null;
  const date = first?.date ?? null;
  const value = first?.value ?? null;
  const segment = first?.segment ?? null;
  useEffect(() => {
    onChange(date !== null && value !== null && segment !== null ? { date, value, segment } : null);
  }, [date, value, segment, onChange]);
  return null;
}

interface InvestmentChartProps {
  points: SeriesPoint[];
  onActivePoint: (point: SeriesPoint | null) => void;
}

/** One solid line of reported values with a 10% area, an end label and a date pill on hover. */
export function InvestmentChart({ points, onActivePoint }: InvestmentChartProps) {
  const data = useMemo<Datum[]>(
    () => points.map((p) => ({ timestamp: dateTimestamp(p.date), value: p.value, date: p.date, segment: p.segment })),
    [points]
  );
  const { domain, ticks: yTicks } = netWorthScale(data.map((d) => d.value));
  const timestamps = data.map((d) => d.timestamp);
  const axis = timestamps.length > 1 ? investmentAxisTicks(Math.min(...timestamps), Math.max(...timestamps)) : null;
  const last = data.at(-1);

  return (
    <div className="flex min-w-0 flex-col">
      {data.length < 2 && (
        <p className="mb-3 text-xs text-ink-muted">Not enough history in this range. Try a longer range.</p>
      )}
      <div className="h-[176px] sm:h-[232px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 232 }}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
            title="Investments over time"
            desc="Use the left and right arrow keys to read values by date."
          >
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={axis ? [axis.start, "dataMax"] : ["dataMin", "dataMax"]}
              ticks={axis?.ticks}
              interval={axis ? 0 : "preserveStartEnd"}
              tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(ts: number) => (axis ? axis.label(ts) : formatShortDate(new Date(ts).toISOString().slice(0, 10)))}
            />
            <YAxis
              domain={domain}
              ticks={yTicks}
              interval={0}
              tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCompactCurrency(value)}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-muted-line)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const datum = payload[0].payload as Datum;
                return (
                  <div className="rounded-md bg-surface-active px-1.5 py-px font-mono text-micro text-ink">
                    {formatShortDate(datum.date)}
                  </div>
                );
              }}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="none"
              fill={LINE_COLOR}
              fillOpacity={0.1}
              baseValue={domain[0]}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
            />
            <Line
              type="linear"
              dataKey="value"
              name="Value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={data.length === 1 ? { r: 3, fill: LINE_COLOR, strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--bg-secondary)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {last && (
              <ReferenceDot
                x={last.timestamp}
                y={last.value}
                r={4}
                fill={LINE_COLOR}
                stroke="var(--bg-secondary)"
                strokeWidth={2}
                label={{
                  value: formatCompactCurrency(last.value),
                  position: "right",
                  offset: 8,
                  fill: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
            <ActivePointReporter onChange={onActivePoint} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
