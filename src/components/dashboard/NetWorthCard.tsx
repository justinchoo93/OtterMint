"use client";

import { formatCurrency } from "@/lib/format";
import { computeNetWorthTotals } from "@/lib/net-worth-totals";
import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

interface NetWorthCardProps {
  accounts: AccountWithInstitution[];
  manualAccounts?: ManualAccountRow[];
  label?: string;
}

export function NetWorthCard({ accounts, manualAccounts = [], label = "Net Worth" }: NetWorthCardProps) {
  const {
    assets: totalAssets,
    liabilities: totalLiabilities,
    netWorth,
    accountCount: totalAccounts,
  } = computeNetWorthTotals(accounts, manualAccounts);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {totalAccounts > 0 ? `${totalAccounts} accounts` : "No accounts"}
        </span>
      </div>
      <div className="mt-3">
        <span className="font-mono text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
          {formatCurrency(netWorth)}
        </span>
      </div>
      <div className="mt-4 flex gap-6">
        <div>
          <span className="text-xs text-[var(--text-muted)]">Assets</span>
          <div className="font-mono text-sm tabular-nums text-[var(--accent-green)]">
            {formatCurrency(totalAssets)}
          </div>
        </div>
        <div>
          <span className="text-xs text-[var(--text-muted)]">Liabilities</span>
          <div className="font-mono text-sm tabular-nums text-[var(--accent-red)]">
            {formatCurrency(totalLiabilities)}
          </div>
        </div>
      </div>
    </div>
  );
}
