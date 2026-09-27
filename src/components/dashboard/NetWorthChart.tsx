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
import { LegendKey, SegmentedControl } from "@/components/ui";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { monthAxisLabel, monthShortLabel, netWorthScale } from "@/lib/analytics-model";
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

export type ChartMode = "normalized" | "reported";

interface NetWorthChartProps {
  history: NetWorthHistory;
  /** The mode actually shown (Reported whenever Normalized is unavailable). */
  mode: ChartMode;
  normalizedAvailable: boolean;
  onModeChange: (mode: ChartMode) => void;
  isHousehold?: boolean;
}

interface LineSeries {
  id: string;
  estimated: boolean;
  points: Array<{ date: string; value: number }>;
}

interface ChartDatum {
  date: string;
  timestamp: number;
  [key: string]: string | number | null;
}

const LINE_COLOR = "var(--accent-mint)";
const MODE_OPTIONS = [
  { value: "normalized", label: "Normalized" },
  { value: "reported", label: "Reported" },
] as const;

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

function formatDateLabel(dateStr: string): string {
  return formatTimestampLabel(dateTimestamp(dateStr));
}

function groupBySegment(
  snapshots: NetWorthSnapshotRow[],
  segmentKey: "coverageSegment" | "comparisonSegment"
): NetWorthSnapshotRow[][] {
  const groups = new Map<number, NetWorthSnapshotRow[]>();
  for (const snapshot of snapshots) {
    const points = groups.get(snapshot[segmentKey]) ?? [];
    points.push(snapshot);
    groups.set(snapshot[segmentKey], points);
  }
  return [...groups.values()];
}

/**
 * Net-worth line series: one per coverage segment in Reported mode; in
 * Normalized mode one per comparison segment, split again wherever points
 * switch between observed and estimated so estimates can be dashed.
 */
function buildLineSeries(snapshots: NetWorthSnapshotRow[], mode: ChartMode): LineSeries[] {
  const series: LineSeries[] = [];

  if (mode === "reported") {
    groupBySegment(snapshots, "coverageSegment").forEach((segment, index) => {
      series.push({
        id: `net_worth_reported_${index}`,
        estimated: segment.some((point) => point.quality === "reconstructed"),
        points: segment.map((point) => ({
          date: point.date,
          value: Number.parseFloat(point.netWorth),
        })),
      });
    });
    return series;
  }

  groupBySegment(snapshots, "comparisonSegment").forEach((segment, segmentIndex) => {
    let current: LineSeries | null = null;
    for (const point of segment) {
      if (point.adjustedNetWorth === null) {
        current = null;
        continue;
      }
      const estimated = point.quality === "flat_normalized" || point.quality === "reconstructed";
      const linePoint = { date: point.date, value: Number.parseFloat(point.adjustedNetWorth) };
      if (!current || current.estimated !== estimated) {
        if (current && current.points.length > 0) {
          // Share the transition point so dashed and solid portions meet.
          current.points.push(linePoint);
        }
        current = {
          id: `net_worth_normalized_${segmentIndex}_${series.length}`,
          estimated,
          points: [linePoint],
        };
        series.push(current);
      } else {
        current.points.push(linePoint);
      }
    }
  });
  return series;
}

function buildChartModel(
  snapshots: NetWorthSnapshotRow[],
  mode: ChartMode
): { data: ChartDatum[]; series: LineSeries[] } {
  const data = snapshots.map<ChartDatum>((point) => ({
    date: point.date,
    timestamp: dateTimestamp(point.date),
  }));
  const byDate = new Map(data.map((point) => [point.date, point]));
  const series = buildLineSeries(snapshots, mode);
  for (const line of series) {
    for (const point of line.points) {
      const row = byDate.get(point.date);
      if (row) row[line.id] = point.value;
    }
  }
  return { data, series };
}

function qualityLabel(point: NetWorthSnapshotRow, mode: ChartMode): string {
  if (point.quality === "reconstructed") return "Reconstructed estimate";
  if (mode === "reported") return "Reported observation";
  if (point.quality === "flat_normalized") return "Flat normalization from first known balance";
  if (point.quality === "unknown_coverage") return "Unknown coverage";
  return "Observed";
}

/** First-of-month ticks across the range; every third month on long ranges. */
function monthTicks(min: number, max: number): { ticks: number[]; dense: boolean } | null {
  const start = new Date(min);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + (start.getUTCDate() > 1 ? 1 : 0);
  const ticks: number[] = [];
  for (;;) {
    const t = Date.UTC(year, month, 1);
    if (t > max) break;
    ticks.push(t);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  if (ticks.length < 2) return null;
  const dense = ticks.length > 12;
  return { ticks: dense ? ticks.filter((_, i) => i % 3 === 0) : ticks, dense };
}

function monthKeyOf(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

export function NetWorthChart({
  history,
  mode,
  normalizedAvailable,
  onModeChange,
  isHousehold = false,
}: NetWorthChartProps) {
  const chartModel = useMemo(() => buildChartModel(history.snapshots, mode), [history.snapshots, mode]);

  const values = chartModel.series.flatMap((s) => s.points.map((p) => p.value));
  const { domain, ticks: yTicks } = netWorthScale(values);
  const latestEvent = history.coverageEvents.at(-1);
  const timestamps = chartModel.data.map((d) => d.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const axis = timestamps.length > 1 ? monthTicks(minTs, maxTs) : null;
  const hasEstimates = chartModel.series.some((s) => s.estimated);
  const hasEvents = history.coverageEvents.length > 0;
  const hasUnknownCoverage = history.coverageEvents.some((e) => e.kind !== "captured_addition");
  const reconstructedPoints = history.snapshots.filter((point) => point.reconstructionNotes);
  const lastSeries = chartModel.series.at(-1);
  const lastPoint = lastSeries?.points.at(-1);
  const eventTick = (domain[1] - domain[0]) * 0.12;

  const showNotes =
    reconstructedPoints.length > 0 || normalizedAvailable || hasUnknownCoverage || hasEvents;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendKey color={LINE_COLOR} shape="line">
            Observed
          </LegendKey>
          {hasEstimates && (
            <LegendKey color={LINE_COLOR} shape="dashed-line">
              Estimated
            </LegendKey>
          )}
          {hasEvents && (
            <LegendKey color="var(--text-muted)" shape="dot">
              Account change
            </LegendKey>
          )}
        </div>
        {normalizedAvailable && (
          <SegmentedControl
            ariaLabel="Net worth history mode"
            size="sm"
            options={MODE_OPTIONS}
            value={mode}
            onChange={onModeChange}
          />
        )}
      </div>

      {history.snapshots.length < 2 && (
        <p className="mt-3 text-xs text-ink-muted">
          Not enough history in this range. Try a longer range.
        </p>
      )}

      <div className="mt-3 h-[176px] sm:h-[232px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 232 }}>
          <ComposedChart data={chartModel.data} margin={{ top: 8, right: 52, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
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
                const chartPoint = chartModel.data.find((c) => c.timestamp === Number(label));
                const point = history.snapshots.find((s) => s.date === chartPoint?.date);
                if (!point) return null;
                const useAdjusted = mode === "normalized";
                return (
                  <div className="max-w-xs rounded-control border border-line bg-surface-raised px-3 py-2.5 text-xs text-ink shadow-popover">
                    <div className="text-ink-secondary">{formatDateLabel(point.date)}</div>
                    <div className="mt-0.5 text-[15px] font-semibold">
                      {formatCurrency(useAdjusted ? point.adjustedNetWorth : point.netWorth)}
                    </div>
                    <div className="mt-0.5 text-ink-muted">{qualityLabel(point, mode)}</div>
                    {point.reconstructionNotes && <p className="mt-1.5">{point.reconstructionNotes}</p>}
                    <div className="mt-2 space-y-0.5 font-mono tabular-nums text-ink-secondary">
                      <div>
                        Assets {formatCurrency(useAdjusted ? point.adjustedTotalAssets : point.totalAssets)}
                      </div>
                      <div>
                        Liabilities{" "}
                        {formatCurrency(useAdjusted ? point.adjustedTotalLiabilities : point.totalLiabilities)}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            {chartModel.series
              .filter((series) => !series.estimated)
              .map((series) => (
                <Area
                  key={`${series.id}-area`}
                  type="linear"
                  dataKey={series.id}
                  stroke="none"
                  fill={LINE_COLOR}
                  fillOpacity={0.1}
                  baseValue={domain[0]}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                  tooltipType="none"
                />
              ))}
            {history.coverageEvents.map((event, index) => (
              <ReferenceLine
                key={`${event.kind}-${event.date}-${index}`}
                segment={[
                  { x: dateTimestamp(event.date), y: domain[0] },
                  { x: dateTimestamp(event.date), y: domain[0] + eventTick },
                ]}
                stroke="var(--text-muted)"
                strokeOpacity={0.6}
              />
            ))}
            {history.coverageEvents.map((event, index) => (
              <ReferenceDot
                key={`${event.kind}-${event.date}-${index}-dot`}
                x={dateTimestamp(event.date)}
                y={domain[0]}
                r={3.5}
                fill="var(--text-muted)"
                stroke="var(--bg-secondary)"
                strokeWidth={2}
                label={
                  event === latestEvent
                    ? { value: event.label, position: "right", offset: 8, fill: "var(--text-muted)", fontSize: 11 }
                    : undefined
                }
              />
            ))}
            {chartModel.series.map((series) => (
              <Line
                key={series.id}
                type="linear"
                dataKey={series.id}
                name="Net Worth"
                stroke={LINE_COLOR}
                strokeWidth={2}
                strokeDasharray={series.estimated ? "6 4" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={series.points.length === 1 ? { r: 3, fill: LINE_COLOR, strokeWidth: 0 } : false}
                activeDot={{ r: 4, fill: LINE_COLOR, stroke: "var(--bg-secondary)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {lastPoint && (
              <ReferenceDot
                x={dateTimestamp(lastPoint.date)}
                y={lastPoint.value}
                r={4}
                fill={LINE_COLOR}
                stroke="var(--bg-secondary)"
                strokeWidth={2}
                label={{
                  value: formatCompactCurrency(lastPoint.value),
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
          <summary className="cursor-pointer list-none select-none hover:text-ink-secondary [&::-webkit-details-marker]:hidden">
            {reconstructedPoints.length > 0 ? "Dashed history is estimated from statements. " : ""}
            <span className="text-accent underline decoration-accent/40 underline-offset-2">About this chart</span>
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">
            {reconstructedPoints.length > 0 && (
              <p>Dashed historical values are reconstructed estimates. Sources and assumptions:</p>
            )}
            {reconstructedPoints.map((point) => (
              <p key={point.date}>
                {formatDateLabel(point.date)} · {point.reconstructionNotes}
              </p>
            ))}
            {normalizedAvailable && mode === "normalized" && (
              <p>
                Earlier values use first known balances for comparison; they are not
                reconstructed account history.
              </p>
            )}
            {hasUnknownCoverage && (
              <p>The line is split where OtterMint cannot compare the same set of accounts.</p>
            )}
            {history.coverageEvents.map((event, index) => (
              <p key={`description-${event.kind}-${event.date}-${index}`}>
                {formatDateLabel(event.date)} · {event.label}
                {!isHousehold && event.kind === "captured_addition" && event.netWorthAdjustment !== null && (
                  <>
                    : {formatCurrency(event.netWorthAdjustment)} first-known balance normalized out
                    of change.
                  </>
                )}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
