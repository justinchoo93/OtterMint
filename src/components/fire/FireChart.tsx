"use client";

import { useMemo } from "react";
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
import { formatCompactCurrency, formatWholeCurrency } from "@/lib/format";
import { ageText, yearOf, type FireParams, type FireSimulation } from "@/lib/fire-model";

const LINE_COLOR = "var(--accent-mint)";
const STEPS = [100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000];

interface Datum {
  age: number;
  value: number;
  m: number;
}

/** "$1M" rather than "$1.00M" for whole millions; otherwise the app's compact form. */
function axisMoney(value: number): string {
  return value >= 1_000_000 && value % 1_000_000 === 0 ? `$${value / 1_000_000}M` : formatCompactCurrency(value);
}

/** A zero-based axis with at most five round gridlines. */
function projectionScale(peak: number): { max: number; ticks: number[] } {
  const top = Math.max(1, peak);
  const step = STEPS.find((s) => top / s <= 4) ?? STEPS[STEPS.length - 1];
  const max = Math.ceil((top * 1.04) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

interface FireChartProps {
  params: FireParams;
  sim: FireSimulation;
}

/** Invested money from today to the plan age: one line, the retirement ages marked, and where it runs out. */
export function FireChart({ params, sim }: FireChartProps) {
  const data = useMemo<Datum[]>(() => {
    const points: Datum[] = [];
    for (let m = 0; m <= sim.horizon; m += 3) points.push({ age: params.yourAge + m / 12, value: sim.path[m], m });
    if (points[points.length - 1].m !== sim.horizon) {
      points.push({ age: params.yourAge + sim.horizon / 12, value: sim.path[sim.horizon], m: sim.horizon });
    }
    return points;
  }, [params.yourAge, sim]);
  const { max, ticks } = projectionScale(Math.max(...sim.path));
  const ageTicks: number[] = [];
  for (let age = Math.ceil((params.yourAge + 1) / 10) * 10; age <= params.planAge; age += 10) ageTicks.push(age);
  const firstTick = ageTicks[0];
  const together = sim.yM === sim.pM;
  const yourRetireAge = params.yourAge + sim.yM / 12;
  const partnerRetireAge = params.yourAge + sim.pM / 12;
  const outAge = sim.outM === null ? null : params.yourAge + sim.outM / 12;

  return (
    <div className="mt-8 h-[240px] sm:h-[280px]" data-testid="fire-chart">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 280 }}>
        <ComposedChart
          data={data}
          margin={{ top: 40, right: 16, bottom: 0, left: 0 }}
          title="Invested money by your age"
          desc="Use the left and right arrow keys to read the projected total by age."
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="age"
            type="number"
            domain={[params.yourAge, params.planAge]}
            ticks={ageTicks}
            interval={0}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(age: number) => (age === firstTick ? `Age ${age}` : String(age))}
          />
          <YAxis
            domain={[0, max]}
            ticks={ticks}
            interval={0}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={axisMoney}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-muted-line)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const datum = payload[0].payload as Datum;
              return (
                <div className="flex flex-col gap-0.5 rounded-md bg-surface-active px-2.5 py-1.5 shadow-popover">
                  <span className="text-micro text-ink-secondary">
                    Age {Math.floor(datum.age)} · {yearOf(params.asOfMonth, datum.m)}
                  </span>
                  <span className="font-mono text-caption font-semibold text-ink">{formatWholeCurrency(datum.value)}</span>
                </div>
              );
            }}
          />
          <ReferenceLine
            x={yourRetireAge}
            stroke="var(--chart-muted-line)"
            label={{
              value: `${together ? "Retire" : "You retire"} · ${ageText(yourRetireAge)}`,
              position: "top",
              offset: 6,
              fill: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          {!together && (
            <ReferenceLine
              x={partnerRetireAge}
              stroke="var(--chart-muted-line)"
              label={{
                value: `Partner retires · ${ageText(params.partnerAge + sim.pM / 12)}`,
                position: "top",
                offset: 22,
                fill: "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          )}
          <Area type="linear" dataKey="value" stroke="none" fill={LINE_COLOR} fillOpacity={0.1} baseValue={0} isAnimationActive={false} activeDot={false} tooltipType="none" />
          <Line
            type="linear"
            dataKey="value"
            name="Invested"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--bg-secondary)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {outAge !== null && (
            <ReferenceDot
              x={outAge}
              y={0}
              r={5}
              fill="var(--delta-down)"
              stroke="var(--bg-secondary)"
              strokeWidth={2}
              label={{ value: `Runs out at ${Math.floor(outAge)}`, position: "top", offset: 10, fill: "var(--delta-down)", fontSize: 12, fontWeight: 600 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
