"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { NetWorthSnapshotRow } from "@/app/api/net-worth/route";

interface NetWorthChartProps {
  refreshKey?: number;
  groupId?: string;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NetWorthChart({ refreshKey, groupId }: NetWorthChartProps) {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    try {
      const url = groupId
        ? `/api/groups/${groupId}/net-worth?days=90`
        : "/api/net-worth?days=90";
      const res = await fetch(url);
      const data = await res.json();
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      console.error("Failed to fetch net worth history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-40 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 h-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  if (snapshots.length < 2) {
    return null;
  }

  const chartData = snapshots.map((s) => ({
    date: s.date,
    label: formatDateLabel(s.date),
    netWorth: parseFloat(s.netWorth),
    assets: parseFloat(s.totalAssets),
    liabilities: parseFloat(s.totalLiabilities),
  }));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Net Worth Over Time
      </span>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                formatCurrency(value ?? 0),
                name === "netWorth"
                  ? "Net Worth"
                  : name === "assets"
                    ? "Assets"
                    : "Liabilities",
              ]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => String(label)}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="var(--accent-blue)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--accent-blue)" }}
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke="var(--accent-green)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, fill: "var(--accent-green)" }}
            />
            <Line
              type="monotone"
              dataKey="liabilities"
              stroke="var(--accent-red)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, fill: "var(--accent-red)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
