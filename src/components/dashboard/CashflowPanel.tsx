"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { labelForCategoryKey, type CashflowMonth } from "@/lib/cashflow";

interface CashflowPanelProps {
  refreshKey?: number;
}

const TOP_CATEGORIES = 8;

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shortMonthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });
}

function formatAxisDollars(value: number): string {
  return value >= 1000 || value <= -1000
    ? `$${(value / 1000).toFixed(0)}k`
    : `$${value}`;
}

interface KpiTileProps {
  label: string;
  value: string;
  tone: "green" | "red" | "blue" | "signed";
  subLabel?: string;
}

function KpiTile({ label, value, tone, subLabel }: KpiTileProps) {
  const amount = parseFloat(value);
  const color =
    tone === "signed"
      ? amount >= 0
        ? "var(--accent-green)"
        : "var(--accent-red)"
      : tone === "green"
        ? "var(--accent-green)"
        : tone === "red"
          ? "var(--accent-red)"
          : "var(--accent-blue)";

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <div
        className="mt-1 font-mono text-lg font-semibold tabular-nums"
        style={{ color }}
      >
        {formatCurrency(value)}
      </div>
      {subLabel && (
        <div className="text-xs text-[var(--text-muted)]">{subLabel}</div>
      )}
    </div>
  );
}

export function CashflowPanel({ refreshKey }: CashflowPanelProps) {
  const [months, setMonths] = useState<CashflowMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCashflow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/cashflow?months=6");
      if (!res.ok) throw new Error(`Cashflow request failed: ${res.status}`);
      const data = await res.json();
      const fetched: CashflowMonth[] = data.months ?? [];
      setMonths(fetched);
      setSelectedMonth((current) =>
        current && fetched.some((m) => m.month === current)
          ? current
          : (fetched[fetched.length - 1]?.month ?? null)
      );
    } catch (err) {
      console.error("Failed to fetch cashflow:", err);
      setMonths([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCashflow();
  }, [fetchCashflow, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-40 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle"
            />
          ))}
        </div>
        <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  if (months.length === 0) return null;

  const selected =
    months.find((m) => m.month === selectedMonth) ?? months[months.length - 1];
  const income = parseFloat(selected.income);
  const net = parseFloat(selected.netCashFlow);
  const savingsRate =
    income > 0 ? `${((net / income) * 100).toFixed(0)}% of income kept` : undefined;
  const selectedLabel = `${monthLabel(selected.month)}${
    selected.partial ? " (month to date)" : ""
  }`;

  const trendData = months.map((m) => ({
    label: shortMonthLabel(m.month),
    income: parseFloat(m.income),
    spending: parseFloat(m.spending),
    savings: parseFloat(m.savings),
  }));

  const topCategories = selected.spendingByCategory.slice(0, TOP_CATEGORIES);
  const otherTotal = selected.spendingByCategory
    .slice(TOP_CATEGORIES)
    .reduce((sum, c) => sum + parseFloat(c.total), 0);
  const categoryData = [
    ...topCategories.map((c) => ({
      category: labelForCategoryKey(c.key),
      total: parseFloat(c.total),
    })),
    ...(otherTotal > 0
      ? [{ category: "Other", total: Math.round(otherTotal * 100) / 100 }]
      : []),
  ];

  const tooltipStyle = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--text-primary)",
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Cash Flow
        </span>
        <select
          value={selected.month}
          onChange={(e) => setSelectedMonth(e.target.value)}
          aria-label="Cash flow month"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
        >
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {monthLabel(m.month)}
              {m.partial ? " (month to date)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Income" value={selected.income} tone="green" />
        <KpiTile label="Spending" value={selected.spending} tone="red" />
        <KpiTile label="Saved" value={selected.savings} tone="blue" />
        <KpiTile
          label="Net cash flow"
          value={selected.netCashFlow}
          tone="signed"
          subLabel={savingsRate}
        />
      </div>

      <div className="mt-6">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Monthly Trend
        </span>
        <div className="mt-3 h-56">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 400, height: 224 }}
          >
            <BarChart data={trendData}>
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
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisDollars}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--text-primary)" }}
                labelStyle={{ color: "var(--text-primary)" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => formatCurrency(value ?? 0)}
                cursor={{ fill: "var(--bg-hover)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(value: string) =>
                  value[0].toUpperCase() + value.slice(1)
                }
              />
              <Bar
                dataKey="income"
                fill="var(--accent-green)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="spending"
                fill="var(--accent-red)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="savings"
                fill="var(--accent-blue)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Spending — {selectedLabel}
        </span>
        {categoryData.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
            No transaction data for this month
          </div>
        ) : (
          <div className="mt-3 h-56">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 400, height: 224 }}
            >
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border-subtle)" }}
                  tickFormatter={formatAxisDollars}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-primary)" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatCurrency(value ?? 0), "Spent"]}
                  cursor={{ fill: "var(--bg-hover)" }}
                />
                <Bar
                  dataKey="total"
                  fill="var(--accent-blue)"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
