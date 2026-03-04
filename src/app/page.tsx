"use client";

import { useCallback, useEffect, useState } from "react";
import { NetWorthCard } from "@/components/dashboard/NetWorthCard";
import { AccountsPanel } from "@/components/dashboard/AccountsPanel";
import { TransactionsFeed } from "@/components/dashboard/TransactionsFeed";
import { HoldingsPanel } from "@/components/dashboard/HoldingsPanel";
import { ManualAccountsPanel } from "@/components/manual/ManualAccountsPanel";
import { NetWorthChart } from "@/components/dashboard/NetWorthChart";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { RefreshButton } from "@/components/dashboard/RefreshButton";
import { PlaidLinkButton } from "@/components/plaid/PlaidLinkButton";
import type {
  AccountWithInstitution,
  PlaidItemStatus,
} from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountWithInstitution[]>([]);
  const [manualAccounts, setManualAccounts] = useState<ManualAccountRow[]>([]);
  const [itemStatuses, setItemStatuses] = useState<PlaidItemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const [acctRes, manualRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/manual-accounts"),
      ]);
      const acctData = await acctRes.json();
      const manualData = await manualRes.json();
      setAccounts(acctData.accounts ?? []);
      setItemStatuses(acctData.itemStatuses ?? []);
      setManualAccounts(manualData.manualAccounts ?? []);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchAccounts();
    setRefreshKey((k) => k + 1);
  }, [fetchAccounts]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const lastRefreshed = accounts.reduce<string | null>((latest, acct) => {
    if (!acct.lastRefreshedAt) return latest;
    if (!latest) return acct.lastRefreshedAt;
    return acct.lastRefreshedAt > latest ? acct.lastRefreshedAt : latest;
  }, null);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              otterfin
            </h1>
            <span className="text-xs text-[var(--text-muted)]">dashboard</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <RefreshButton
              onRefreshed={handleRefresh}
              lastRefreshed={lastRefreshed}
            />
            <PlaidLinkButton onSuccess={handleRefresh} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
          <div className="space-y-6">
            {/* Net worth card skeleton */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
              <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              <div className="mt-4 h-8 w-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              <div className="mt-4 flex gap-6">
                <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
                <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              </div>
            </div>
            {/* Charts skeleton */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
                <div className="h-3 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
                <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
                <div className="h-3 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
                <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              </div>
            </div>
            {/* Accounts skeleton */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
              <div className="mt-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <NetWorthCard
              accounts={accounts}
              manualAccounts={manualAccounts}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <NetWorthChart refreshKey={refreshKey} />
              <SpendingChart refreshKey={refreshKey} />
            </div>
            <AccountsPanel
              accounts={accounts}
              itemStatuses={itemStatuses}
              onReauthSuccess={handleRefresh}
            />
            <HoldingsPanel refreshKey={refreshKey} />
            <ManualAccountsPanel onChanged={fetchAccounts} />
            <TransactionsFeed refreshKey={refreshKey} />
          </div>
        )}
      </main>
    </div>
  );
}
