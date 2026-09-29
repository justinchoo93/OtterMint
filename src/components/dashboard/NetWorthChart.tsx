"use client";

import { useMemo } from "react";
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
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { monthAxisLabel, monthKeyOf, monthShortLabel, monthTicks, netWorthScale } from "@/lib/analytics-model";
import type {
  CoverageAnnotation,
  NetWorthSnapshotRow,
} from "@/lib/net-worth-history";

export interface NetWorthHistory {
  snapshots: NetWorthSnapshotRow[];
  coverageEvents: CoverageAnnotation[];
  periodChange: {
    reported: string;
    normalized: string | null;
  } | null;
}

interface NetWorthChartProps {
  history: NetWorthHistory;
  isHousehold?: boolean;
}

interface ChartDatum {
  date: string;
  timestamp: number;
  netWorth: number;
}

const LINE_COLOR = "var(--accent-mint)";

function dateTimestamp(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`);
}

function formatTimestampLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDateLabel(dateStr: string, withYear = false): string {
  return new Date(dateTimestamp(dateStr)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Consecutive reconstructed points that share a note, as one dated range each. */
function groupReconstructionNotes(
  points: NetWorthSnapshotRow[]
): Array<{ from: string; to: string; note: string }> {
  const groups: Array<{ from: string; to: string; note: string }> = [];
  for (const point of points) {
    const note = point.reconstructionNotes ?? "";
    const last = groups.at(-1);
    if (last && last.note === note) last.to = point.date;
    else groups.push({ from: point.date, to: point.date, note });
  }
  return groups;
}

export function NetWorthChart({ history, isHousehold = false }: NetWorthChartProps) {
  const data = useMemo<ChartDatum[]>(
    () =>
      history.snapshots.map((point) => ({
        date: point.date,
        timestamp: dateTimestamp(point.date),
        netWorth: Number.parseFloat(point.netWorth),
      })),
    [history.snapshots]
  );

  const { domain, ticks: yTicks } = netWorthScale(data.map((d) => d.netWorth));
  const timestamps = data.map((d) => d.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const axis = timestamps.length > 1 ? monthTicks(minTs, maxTs) : null;
  const reconstructedPoints = history.snapshots.filter((point) => point.reconstructionNotes);
  const noteGroups = groupReconstructionNotes(reconstructedPoints);
  const firstDate = history.snapshots[0]?.date ?? "";
  const lastDate = history.snapshots.at(-1)?.date ?? "";
  const withYear = firstDate.slice(0, 4) !== lastDate.slice(0, 4);
  const lastPoint = data.at(-1);
  const showNotes = reconstructedPoints.length > 0 || history.coverageEvents.length > 0;

  return (
    <div className="flex min-w-0 flex-col">
      {history.snapshots.length < 2 && (
        <p className="mb-3 text-xs text-ink-muted">
          Not enough history in this range. Try a longer range.
        </p>
      )}

      <div className="h-[176px] sm:h-[232px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 232 }}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
            title={isHousehold ? "Household net worth over time" : "Net worth over time"}
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
              tickFormatter={(ts: number) =>
                axis ? (axis.dense ? monthAxisLabel(monthKeyOf(ts)) : monthShortLabel(monthKeyOf(ts))) : formatTimestampLabel(ts)
              }
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
              content={({ active, label }) => {
                if (!active || label === undefined) return null;
                const datum = data.find((d) => d.timestamp === Number(label));
                const point = history.snapshots.find((s) => s.date === datum?.date);
                if (!point) return null;
                return (
                  <div className="rounded-control border border-line bg-surface-raised px-3 py-2 text-xs text-ink shadow-popover">
                    <div className="text-ink-secondary">{formatDateLabel(point.date)}</div>
                    <div className="mt-0.5 text-[15px] font-semibold">{formatCurrency(point.netWorth)}</div>
                    {point.quality === "reconstructed" && <div className="mt-0.5 text-ink-muted">Estimate</div>}
                  </div>
                );
              }}
            />
            <Area
              type="linear"
              dataKey="netWorth"
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
              dataKey="netWorth"
              name="Net Worth"
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={data.length === 1 ? { r: 3, fill: LINE_COLOR, strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--bg-secondary)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {lastPoint && (
              <ReferenceDot
                x={lastPoint.timestamp}
                y={lastPoint.netWorth}
                r={4}
                fill={LINE_COLOR}
                stroke="var(--bg-secondary)"
                strokeWidth={2}
                label={{
                  value: formatCompactCurrency(lastPoint.netWorth),
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

      {showNotes && (
        <details className="group mt-3 text-xs text-ink-muted">
          <summary className="cursor-pointer list-none py-3.5 select-none hover:text-ink-secondary sm:py-0 [&::-webkit-details-marker]:hidden">
            <span className="text-accent underline decoration-accent/40 underline-offset-2">About this chart</span>
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            {reconstructedPoints.length > 0 && (
              <p>Estimated values and how they were reconstructed from statements:</p>
            )}
            {noteGroups.map((group) => (
              <p key={group.from}>
                {group.from === group.to
                  ? formatDateLabel(group.from, withYear)
                  : `${formatDateLabel(group.from, withYear)} – ${formatDateLabel(group.to, withYear)}`}{" "}
                · {group.note}
              </p>
            ))}
            {history.coverageEvents.map((event, index) => (
              <p key={`description-${event.kind}-${event.date}-${index}`}>
                {formatDateLabel(event.date, withYear)} · {event.label}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
