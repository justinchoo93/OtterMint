"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { InvestmentsResponse } from "@/app/api/analytics/investments/route";

interface InvestmentPerformancePanelProps {
  refreshKey?: number;
}

const ACCOUNT_COLORS = [
  "var(--accent-green)",
  "var(--accent-amber)",
  "var(--accent-purple)",
  "var(--accent-red)",
];

// Color follows the security type (the entity), never its rank in the list.
const ALLOCATION_COLORS: Record<string, string> = {
  equity: "var(--accent-blue)",
  etf: "var(--accent-green)",
  "mutual fund": "var(--accent-purple)",
  derivative: "var(--accent-amber)",
  "fixed income": "var(--accent-red)",
  cash: "var(--text-muted)",
};

const ALLOCATION_LABELS: Record<string, string> = {
  equity: "Single stocks",
  etf: "ETFs",
  "mutual fund": "Mutual funds",
  derivative: "Options",
  "fixed income": "Bonds",
  cash: "Cash",
  other: "Other",
};

function allocationLabel(type: string): string {
  return (
    ALLOCATION_LABELS[type] ??
    type.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const EMPTY: InvestmentsResponse = {
  series: { points: [], boundaries: [], accounts: [] },
  attribution: null,
  xirr: null,
  unrealized: {
    total: {
      value: "0.00",
      cost: "0.00",
      gain: "0.00",
      gainPct: "0.0",
      cashValue: "0.00",
      excludedValue: "0.00",
    },
    byAccount: [],
    positions: [],
  },
  flows: [],
  dividends: { trailingTwelveMonths: "0.00", monthly: [] },
  allocation: [],
};

function dateTimestamp(date: string): number {
  return new Date(date + "T00:00:00Z").getTime();
}

function formatDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatAxisDollars(value: number): string {
  return Math.abs(value) >= 1000
    ? `$${(value / 1000).toFixed(0)}k`
    : `$${value}`;
}

type ChartDatum = { timestamp: number; date: string } & Record<string, number | string>;

function buildChartModel(data: InvestmentsResponse) {
  const rows = new Map<string, ChartDatum>();
  const row = (date: string): ChartDatum => {
    let entry = rows.get(date);
    if (!entry) {
      entry = { date, timestamp: dateTimestamp(date) };
      rows.set(date, entry);
    }
    return entry;
  };

  const segments = new Map<number, { key: string; quality: string }>();
  for (const point of data.series.points) {
    const key = `seg_${point.segment}`;
    segments.set(point.segment, { key, quality: point.quality });
    row(point.date)[key] = Number.parseFloat(point.value);
  }

  const accountKeys: Array<{ key: string; name: string; color: string }> = [];
  data.series.accounts.forEach((account, index) => {
    if (account.points.length < 2) return; // a single dot is not a line yet
    const key = `acct_${index}`;
    accountKeys.push({
      key,
      name: account.name,
      color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
    });
    for (const point of account.points) {
      row(point.date)[key] = Number.parseFloat(point.value);
    }
  });

  return {
    data: [...rows.values()].sort((a, b) => a.timestamp - b.timestamp),
    segments: [...segments.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v),
    accountKeys,
  };
}

function KpiTile({
  label,
  value,
  color,
  subLabel,
}: {
  label: string;
  value: string;
  color?: string;
  subLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <div
        className="mt-1 font-mono text-lg font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {subLabel && (
        <div className="text-xs text-[var(--text-muted)]">{subLabel}</div>
      )}
    </div>
  );
}

export function InvestmentPerformancePanel({
  refreshKey,
}: InvestmentPerformancePanelProps) {
  const [data, setData] = useState<InvestmentsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/investments?days=90");
      if (!res.ok) throw new Error(`Investments request failed: ${res.status}`);
      setData((await res.json()) as InvestmentsResponse);
    } catch (err) {
      console.error("Failed to fetch investment performance:", err);
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const chart = useMemo(() => buildChartModel(data), [data]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
          ))}
        </div>
        <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  const hasValue = data.series.points.some((p) => Number.parseFloat(p.value) > 0);
  if (!hasValue && data.unrealized.positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-muted)]">
        Connect an investment account to see performance.
      </div>
    );
  }

  const latest = data.series.points[data.series.points.length - 1];
  const { attribution, unrealized, xirr } = data;
  const totalGain = Number.parseFloat(unrealized.total.gain);
  const marketPnl =
    attribution?.marketPnl != null ? Number.parseFloat(attribution.marketPnl) : null;
  const cashValue = Number.parseFloat(unrealized.total.cashValue);
  const excluded = Number.parseFloat(unrealized.total.excludedValue);
  const windowLabel = attribution
    ? `${formatDateLabel(dateTimestamp(attribution.windowStart))} – ${formatDateLabel(
        dateTimestamp(attribution.windowEnd)
      )}`
    : null;

  const attributionRows = attribution
    ? [
        { name: `Start · ${formatDateLabel(dateTimestamp(attribution.windowStart))}`, value: attribution.start, delta: false as const },
        { name: "Contributions", value: attribution.contributions, delta: true as const, color: "var(--accent-purple)" },
        ...(Number.parseFloat(attribution.withdrawals) !== 0
          ? [{ name: "Withdrawals", value: `-${attribution.withdrawals}`, delta: true as const, color: "var(--accent-amber)" }]
          : []),
        {
          name: "Market P&L",
          value: attribution.marketPnl,
          delta: true as const,
          color: marketPnl != null && marketPnl < 0 ? "var(--accent-red)" : "var(--accent-green)",
        },
        ...(Number.parseFloat(attribution.coverageSteps) !== 0
          ? [{ name: "Coverage change", value: attribution.coverageSteps, delta: true as const, color: "var(--accent-amber)" }]
          : []),
        { name: `End · ${formatDateLabel(dateTimestamp(attribution.windowEnd))}`, value: attribution.end, delta: false as const },
      ]
    : [];
  const maxDelta = Math.max(
    1,
    ...attributionRows
      .filter((r) => r.delta && r.value != null)
      .map((r) => Math.abs(Number.parseFloat(r.value!)))
  );

  const flowDates = new Set(data.flows.map((f) => f.date));
  const hasLegacy = data.series.points.some((p) => p.quality === "legacy");
  const firstKnown = data.series.points.find((p) => p.quality === "known");

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Investment Performance
        </span>
        {windowLabel && (
          <span className="text-xs text-[var(--text-muted)]">
            Attribution window: {windowLabel}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Portfolio value"
          value={latest ? formatCurrency(latest.value) : "—"}
          subLabel={`${data.series.accounts.length || unrealized.byAccount.length} accounts`}
        />
        <KpiTile
          label="Unrealized gain"
          value={`${totalGain >= 0 ? "+" : ""}${formatCurrency(unrealized.total.gain)}`}
          color={totalGain >= 0 ? "var(--accent-green)" : "var(--accent-red)"}
          subLabel={`${totalGain >= 0 ? "+" : ""}${unrealized.total.gainPct}% vs cost`}
        />
        <KpiTile
          label="Contributed"
          value={attribution ? formatCurrency(attribution.contributions) : "—"}
          color="var(--accent-purple)"
          subLabel="in window"
        />
        <KpiTile
          label="Market P&L"
          value={marketPnl != null ? `${marketPnl >= 0 ? "+" : ""}${formatCurrency(attribution!.marketPnl)}` : "—"}
          color={
            marketPnl == null
              ? undefined
              : marketPnl >= 0
                ? "var(--accent-green)"
                : "var(--accent-red)"
          }
          subLabel={
            xirr != null
              ? `${(Number.parseFloat(xirr) * 100).toFixed(1)}% money-weighted, annualized`
              : marketPnl == null
                ? "not computable across an unexplained account change"
                : "return annualizes after 30 days of trusted history"
          }
        />
        <KpiTile
          label="Dividends"
          value={formatCurrency(data.dividends.trailingTwelveMonths)}
          color="var(--accent-amber)"
          subLabel="trailing 12 months"
        />
      </div>

      {chart.data.length > 1 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Portfolio Over Time
            </span>
            {hasLegacy && firstKnown && (
              <span className="text-xs text-[var(--text-muted)]">
                Coverage unknown before {formatDateLabel(dateTimestamp(firstKnown.date))} — dashed, excluded from math
              </span>
            )}
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 400, height: 256 }}
            >
              <LineChart data={chart.data}>
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
                  tickFormatter={formatDateLabel}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={formatAxisDollars}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--text-primary)",
                  }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-primary)" }}
                  labelFormatter={(ts) => formatDateLabel(ts as number)}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [
                    formatCurrency(value ?? 0),
                    String(name).startsWith("seg_") ? "Portfolio" : name,
                  ]}
                />
                {data.series.boundaries.map((boundary) => (
                  <ReferenceLine
                    key={boundary.date}
                    x={dateTimestamp(boundary.date)}
                    stroke="var(--accent-amber)"
                    strokeDasharray="4 4"
                    label={{
                      value:
                        boundary.step === null
                          ? "coverage boundary"
                          : `account set changed (${formatCurrency(boundary.step)})`,
                      position: "insideTopLeft",
                      fill: "var(--accent-amber)",
                      fontSize: 10,
                    }}
                  />
                ))}
                {[...flowDates].map((date) => (
                  <ReferenceLine
                    key={date}
                    x={dateTimestamp(date)}
                    stroke="var(--accent-purple)"
                    strokeOpacity={0.5}
                  />
                ))}
                {chart.segments.map((segment) => (
                  <Line
                    key={segment.key}
                    dataKey={segment.key}
                    stroke="var(--accent-blue)"
                    strokeWidth={2}
                    strokeDasharray={segment.quality === "legacy" ? "5 4" : undefined}
                    strokeOpacity={segment.quality === "legacy" ? 0.55 : 1}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {chart.accountKeys.map((account) => (
                  <Line
                    key={account.key}
                    dataKey={account.key}
                    name={account.name}
                    stroke={account.color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {chart.accountKeys.length === 0 && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Per-account history accrues from each refresh — lines appear after
              two capture days.
            </p>
          )}
        </div>
      )}

      {attribution && (
        <div className="mt-6">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Change Attribution
          </span>
          <div className="mt-2">
            {attributionRows.map((row) => (
              <div
                key={row.name}
                className={`grid grid-cols-[140px_1fr_110px] items-center gap-3 border-b border-[var(--border-subtle)] py-2 text-sm last:border-b-0 ${
                  row.delta ? "" : "font-medium"
                }`}
              >
                <span className="text-[var(--text-secondary)]">{row.name}</span>
                <span className="relative h-3">
                  {row.delta && row.value != null && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{
                        width: `${Math.max(
                          (Math.abs(Number.parseFloat(row.value)) / maxDelta) * 100,
                          1.5
                        )}%`,
                        background: row.color,
                      }}
                    />
                  )}
                </span>
                <span className="text-right font-mono text-sm tabular-nums">
                  {row.value == null
                    ? "unknown"
                    : row.delta
                      ? `${Number.parseFloat(row.value) >= 0 ? "+" : ""}${formatCurrency(row.value)}`
                      : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.allocation.length > 0 && (
        <div className="mt-6">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Allocation
          </span>
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 176, height: 176 }}
              >
                <PieChart>
                  <Pie
                    data={data.allocation.map((slice) => ({
                      name: allocationLabel(slice.type),
                      value: Number.parseFloat(slice.value),
                      type: slice.type,
                    }))}
                    dataKey="value"
                    innerRadius="62%"
                    outerRadius="96%"
                    stroke="var(--bg-secondary)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {data.allocation.map((slice) => (
                      <Cell
                        key={slice.type}
                        fill={
                          ALLOCATION_COLORS[slice.type] ?? "var(--accent-red)"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                    }}
                    itemStyle={{ color: "var(--text-primary)" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => formatCurrency(value ?? 0)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Total
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {latest ? formatCurrency(latest.value) : "—"}
                </span>
              </div>
            </div>
            <div className="min-w-[220px] flex-1 space-y-2">
              {data.allocation.map((slice) => (
                <div
                  key={slice.type}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        background:
                          ALLOCATION_COLORS[slice.type] ?? "var(--accent-red)",
                      }}
                    />
                    {allocationLabel(slice.type)}
                    <span className="text-xs text-[var(--text-muted)]">
                      ×{slice.count}
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                    {formatCurrency(slice.value)}
                    <span className="ml-2 inline-block w-12 text-right text-[var(--text-primary)]">
                      {slice.share}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {unrealized.byAccount.length > 0 && (
        <div className="mt-6">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Unrealized Gain by Account
          </span>
          <div className="mt-3 flex flex-col gap-3">
            {unrealized.byAccount.map((account) => {
              const pct = Number.parseFloat(account.gainPct);
              const maxPct = Math.max(
                1,
                ...unrealized.byAccount.map((a) => Math.abs(Number.parseFloat(a.gainPct)))
              );
              return (
                <div key={account.accountId} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      {account.name}
                      <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                        {formatCurrency(account.value)}
                      </span>
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        pct >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
                      }`}
                    >
                      {pct >= 0 ? "+" : ""}
                      {formatCurrency(account.gain)} · {pct >= 0 ? "+" : ""}
                      {account.gainPct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded bg-[var(--bg-tertiary)]">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(Math.abs(pct) / maxPct) * 100}%`,
                        background: pct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {cashValue > 0 && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Gain figures cover invested positions;{" "}
              {formatCurrency(unrealized.total.cashValue)} sits in uninvested
              cash (no gain to measure).
            </p>
          )}
          {excluded > 0 && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {formatCurrency(unrealized.total.excludedValue)} in positions
              without cost basis is excluded from gain figures.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
