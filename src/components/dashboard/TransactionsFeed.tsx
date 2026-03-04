"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { TransactionRow } from "@/app/api/transactions/route";

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Drink",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  LOAN_PAYMENTS: "Loan Payment",
  RENT_AND_UTILITIES: "Bills",
  ENTERTAINMENT: "Entertainment",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Services",
  PERSONAL_CARE: "Personal Care",
  MEDICAL: "Medical",
  INCOME: "Income",
  GOVERNMENT_AND_NON_PROFIT: "Government",
};

function formatCategory(category: string | null): string {
  if (!category) return "Other";
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").toLowerCase();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TransactionsFeedProps {
  refreshKey?: number;
}

export function TransactionsFeed({ refreshKey }: TransactionsFeedProps) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions?limit=50");
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
        <div className="h-4 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-10 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle"
            />
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
        <div className="text-[var(--text-muted)] text-sm">
          No transactions yet. Connect an account and refresh to sync.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Recent Transactions
        </span>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {transactions.map((txn) => {
          const amount = parseFloat(txn.amount);
          // Plaid: positive = money spent, negative = money received
          const isCredit = amount < 0;

          return (
            <div
              key={txn.transactionId}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-primary)] truncate">
                      {txn.merchantName ?? txn.name}
                    </span>
                    {txn.pending && (
                      <span className="shrink-0 rounded bg-[var(--accent-amber-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-amber)]">
                        PENDING
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{formatDate(txn.date)}</span>
                    <span>·</span>
                    <span className="capitalize">
                      {formatCategory(txn.category)}
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={`font-mono text-sm tabular-nums pl-4 ${
                  isCredit
                    ? "text-[var(--accent-green)]"
                    : "text-[var(--text-primary)]"
                }`}
              >
                {isCredit ? "+" : "-"}
                {formatCurrency(Math.abs(amount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
