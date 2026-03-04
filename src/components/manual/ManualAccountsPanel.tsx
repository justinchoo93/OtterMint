"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { ManualAccountForm } from "./ManualAccountForm";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

interface ManualAccountsPanelProps {
  onChanged?: () => void;
}

export function ManualAccountsPanel({ onChanged }: ManualAccountsPanelProps) {
  const [accounts, setAccounts] = useState<ManualAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManualAccountRow | null>(
    null
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/manual-accounts");
      const data = await res.json();
      setAccounts(data.manualAccounts ?? []);
    } catch (err) {
      console.error("Failed to fetch manual accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/manual-accounts?id=${id}`, { method: "DELETE" });
      fetchAccounts();
      onChanged?.();
    } catch (err) {
      console.error("Failed to delete manual account:", err);
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingAccount(null);
    fetchAccounts();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-40 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
      </div>
    );
  }

  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");
  const assetsTotal = assets.reduce(
    (sum, a) => sum + parseFloat(a.balance),
    0
  );
  const liabilitiesTotal = liabilities.reduce(
    (sum, a) => sum + parseFloat(a.balance),
    0
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--accent-purple)" }}
          />
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Manual Accounts
          </span>
        </div>
        <div className="flex items-center gap-3">
          {accounts.length > 0 && (
            <span
              className="font-mono text-sm font-medium tabular-nums"
              style={{ color: "var(--accent-purple)" }}
            >
              {formatCurrency(assetsTotal - liabilitiesTotal)}
            </span>
          )}
          <button
            onClick={() => {
              setEditingAccount(null);
              setShowForm(!showForm);
            }}
            className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {showForm ? "Close" : "+ Add"}
          </button>
        </div>
      </div>

      {(showForm || editingAccount) && (
        <div className="px-4 py-4 border-b border-[var(--border-subtle)]">
          <ManualAccountForm
            account={editingAccount}
            onSaved={handleSaved}
            onCancel={() => {
              setShowForm(false);
              setEditingAccount(null);
            }}
          />
        </div>
      )}

      {accounts.length === 0 && !showForm && (
        <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No manual accounts. Add one for things Plaid can&apos;t reach.
        </div>
      )}

      {accounts.length > 0 && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--bg-hover)] group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-primary)]">
                    {acct.name}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      acct.type === "asset"
                        ? "bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                        : "bg-[var(--accent-red-dim)] text-[var(--accent-red)]"
                    }`}
                  >
                    {acct.type.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {acct.subtype && (
                    <span className="capitalize">{acct.subtype}</span>
                  )}
                  {acct.notes && acct.subtype && <span> · </span>}
                  {acct.notes && <span>{acct.notes}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-sm tabular-nums ${
                    acct.type === "asset"
                      ? "text-[var(--accent-green)]"
                      : "text-[var(--accent-red)]"
                  }`}
                >
                  {formatCurrency(acct.balance)}
                </span>
                <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditingAccount(acct);
                      setShowForm(false);
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(acct.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red-dim)] transition-colors cursor-pointer"
                  >
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
