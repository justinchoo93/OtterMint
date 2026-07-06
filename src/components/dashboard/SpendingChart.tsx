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
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { TransactionRow } from "@/app/api/transactions/route";

interface SpendingChartProps {
  refreshKey?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Drink",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Bills",
  ENTERTAINMENT: "Entertainment",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Services",
  PERSONAL_CARE: "Personal",
  MEDICAL: "Medical",
  LOAN_PAYMENTS: "Loans",
};

const BAR_COLORS = [
  "var(--accent-blue)",
  "var(--accent-green)",
  "var(--accent-amber)",
  "var(--accent-purple)",
  "var(--accent-red)",
  "#6ee7b7",
  "#93c5fd",
  "#fbbf24",
  "#c084fc",
  "#fb923c",
];

export function SpendingChart({ refreshKey }: SpendingChartProps) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions?limit=200");
      const data = await res.json();
      setTransactions(data.transactions ?? []);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-40 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 h-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  // Only count expenses (positive amounts in Plaid = money out)
  const expenses = transactions.filter(
    (t) => parseFloat(t.amount) > 0 && !t.pending
  );

  if (expenses.length === 0) {
    return null;
  }

  // Group by category
  const categoryTotals = new Map<string, number>();
  for (const txn of expenses) {
    const cat = txn.category ?? "OTHER";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + parseFloat(txn.amount));
  }

  // Sort by total descending, take top 8
  const chartData = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, total]) => ({
      category: CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").toLowerCase(),
      total: Math.round(total * 100) / 100,
    }));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Spending by Category
      </span>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
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
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              tickLine={false}
              axisLine={false}
              width={90}
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatCurrency(value ?? 0), "Spent"]}
              cursor={{ fill: "var(--bg-hover)" }}
            />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((_, index) => (
                <Cell
                  key={index}
                  fill={BAR_COLORS[index % BAR_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
