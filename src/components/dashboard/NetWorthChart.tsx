"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type {
  CoverageAnnotation,
  NetWorthSnapshotRow,
} from "@/lib/net-worth-history";

interface NetWorthChartProps {
  refreshKey?: number;
  groupId?: string;
}

interface HistoryPayload {
  snapshots: NetWorthSnapshotRow[];
  coverageEvents: CoverageAnnotation[];
  periodChange: {
    reported: string;
    normalized: string | null;
  } | null;
}

type ChartMode = "normalized" | "reported";
type MetricName = "Net Worth" | "Assets" | "Liabilities";

interface MetricConfig {
  name: MetricName;
  color: string;
  width: number;
  raw: (point: NetWorthSnapshotRow) => string;
  adjusted: (point: NetWorthSnapshotRow) => string | null;
}

interface LineSeries {
  id: string;
  name: MetricName;
  color: string;
  width: number;
  estimated: boolean;
  points: Array<{ date: string; value: number }>;
}

interface ChartDatum {
  date: string;
  timestamp: number;
  [key: string]: string | number | null;
}

const METRICS: MetricConfig[] = [
  {
    name: "Net Worth",
    color: "var(--accent-blue)",
    width: 2,
    raw: (point) => point.netWorth,
    adjusted: (point) => point.adjustedNetWorth,
  },
  {
    name: "Assets",
    color: "var(--accent-green)",
    width: 1,
    raw: (point) => point.totalAssets,
    adjusted: (point) => point.adjustedTotalAssets,
  },
  {
    name: "Liabilities",
    color: "var(--accent-red)",
    width: 1,
    raw: (point) => point.totalLiabilities,
    adjusted: (point) => point.adjustedTotalLiabilities,
  },
];

function dateTimestamp(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00Z`);
}

function formatTimestampLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDateLabel(dateStr: string): string {
  return formatTimestampLabel(dateTimestamp(dateStr));
}

function metricKey(metric: MetricConfig): string {
  return metric.name.toLowerCase().replaceAll(" ", "_");
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

function buildLineSeries(
  snapshots: NetWorthSnapshotRow[],
  mode: ChartMode
): LineSeries[] {
  const series: LineSeries[] = [];

  for (const metric of METRICS) {
    if (mode === "reported") {
      groupBySegment(snapshots, "coverageSegment").forEach((segment, index) => {
        series.push({
          id: `${metricKey(metric)}_reported_${index}`,
          name: metric.name,
          color: metric.color,
          width: metric.width,
          estimated: false,
          points: segment.map((point) => ({
            date: point.date,
            value: Number.parseFloat(metric.raw(point)),
          })),
        });
      });
      continue;
    }

    groupBySegment(snapshots, "comparisonSegment").forEach(
      (segment, segmentIndex) => {
        let current: LineSeries | null = null;

        for (const point of segment) {
          const value = metric.adjusted(point);
          if (value === null) {
            current = null;
            continue;
          }
          const estimated = point.quality === "flat_normalized";
          const linePoint = {
            date: point.date,
            value: Number.parseFloat(value),
          };

          if (!current || current.estimated !== estimated) {
            if (current && current.points.length > 0) {
              // Share the transition point so dashed and solid portions meet.
              current.points.push(linePoint);
            }
            current = {
              id: `${metricKey(metric)}_normalized_${segmentIndex}_${series.length}`,
              name: metric.name,
              color: metric.color,
              width: metric.width,
              estimated,
              points: [linePoint],
            };
            series.push(current);
          } else {
            current.points.push(linePoint);
          }
        }
      }
    );
  }

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
  if (mode === "reported") return "Reported observation";
  if (point.quality === "flat_normalized") {
    return "Flat normalization from first known balance";
  }
  if (point.quality === "unknown_coverage") return "Unknown coverage";
  return "Observed";
}

export function NetWorthChart({ refreshKey, groupId }: NetWorthChartProps) {
  const [history, setHistory] = useState<HistoryPayload>({
    snapshots: [],
    coverageEvents: [],
    periodChange: null,
  });
  const [mode, setMode] = useState<ChartMode>("normalized");
  const [loading, setLoading] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const url = groupId
        ? `/api/groups/${groupId}/net-worth?days=90`
        : "/api/net-worth?days=90";
      const response = await fetch(url);
      if (!response.ok) throw new Error(`History request failed: ${response.status}`);
      const data = (await response.json()) as Partial<HistoryPayload>;
      setHistory({
        snapshots: data.snapshots ?? [],
        coverageEvents: data.coverageEvents ?? [],
        periodChange: data.periodChange ?? null,
      });
    } catch (error) {
      console.error("Failed to fetch net worth history:", error);
      setHistory({ snapshots: [], coverageEvents: [], periodChange: null });
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots, refreshKey]);

  const normalizedAvailable =
    !groupId &&
    history.snapshots.some(
      (point) =>
        point.quality === "flat_normalized" && point.adjustedNetWorth !== null
    );
  const activeMode: ChartMode = normalizedAvailable ? mode : "reported";
  const chartModel = useMemo(
    () => buildChartModel(history.snapshots, activeMode),
    [activeMode, history.snapshots]
  );
  const hasUnknownCoverage = history.coverageEvents.some(
    (event) => event.kind !== "captured_addition"
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-40 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 h-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  if (history.snapshots.length < 2) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Net Worth Over Time
          </span>
          {activeMode === "normalized" && history.periodChange?.normalized !== null && (
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              Change excluding coverage: {formatCurrency(history.periodChange?.normalized)}
            </div>
          )}
        </div>
        {normalizedAvailable && (
          <div
            className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-0.5"
            aria-label="Net worth history mode"
          >
            {(["normalized", "reported"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={activeMode === option}
                onClick={() => setMode(option)}
                className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                  activeMode === option
                    ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 h-56">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 400, height: 224 }}
        >
          <LineChart data={chartModel.data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval="preserveStartEnd"
              tickFormatter={formatTimestampLabel}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                Math.abs(value) >= 1000
                  ? `$${(value / 1000).toFixed(0)}k`
                  : `$${value}`
              }
              width={55}
            />
            <Tooltip
              content={({ active, label }) => {
                if (!active || !label) return null;
                const chartPoint = chartModel.data.find(
                  (candidate) => candidate.timestamp === Number(label)
                );
                const point = history.snapshots.find(
                  (snapshot) => snapshot.date === chartPoint?.date
                );
                if (!point) return null;
                const useAdjusted = activeMode === "normalized";
                return (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-primary)] shadow-lg">
                    <div className="font-medium">{formatDateLabel(point.date)}</div>
                    <div className="mt-1 text-[var(--text-muted)]">
                      {qualityLabel(point, activeMode)}
                    </div>
                    <div className="mt-2 space-y-1 font-mono tabular-nums">
                      <div>
                        Net Worth: {formatCurrency(
                          useAdjusted ? point.adjustedNetWorth : point.netWorth
                        )}
                      </div>
                      <div>
                        Assets: {formatCurrency(
                          useAdjusted ? point.adjustedTotalAssets : point.totalAssets
                        )}
                      </div>
                      <div>
                        Liabilities: {formatCurrency(
                          useAdjusted
                            ? point.adjustedTotalLiabilities
                            : point.totalLiabilities
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            {history.coverageEvents.map((event, index) => (
              <ReferenceLine
                key={`${event.kind}-${event.date}-${index}`}
                x={dateTimestamp(event.date)}
                stroke="var(--accent-amber)"
                strokeDasharray="3 3"
                strokeOpacity={0.65}
              />
            ))}
            {chartModel.series.map((series) => (
              <Line
                key={series.id}
                type="monotone"
                dataKey={series.id}
                name={series.name}
                stroke={series.color}
                strokeWidth={series.width}
                strokeDasharray={
                  series.estimated
                    ? "6 4"
                    : series.name === "Net Worth"
                      ? undefined
                      : "4 4"
                }
                dot={
                  series.points.length === 1
                    ? { r: series.name === "Net Worth" ? 3 : 2 }
                    : false
                }
                activeDot={{ r: series.name === "Net Worth" ? 4 : 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {(normalizedAvailable || hasUnknownCoverage) && (
        <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
          {normalizedAvailable && activeMode === "normalized" && (
            <p>
              Earlier values use first known balances for comparison; they are not
              reconstructed account history.
            </p>
          )}
          {hasUnknownCoverage && (
            <p>
              The line is split where OtterMint cannot compare the same set of
              accounts.
            </p>
          )}
          {history.coverageEvents.map((event, index) => (
            <p key={`description-${event.kind}-${event.date}-${index}`}>
              {formatDateLabel(event.date)} · {event.label}
              {event.kind === "captured_addition" &&
                event.netWorthAdjustment !== null && (
                  <>
                    : {formatCurrency(event.netWorthAdjustment)} first-known balance
                    normalized out of change.
                  </>
                )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
