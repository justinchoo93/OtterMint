"use client";

import { formatCurrency } from "@/lib/format";
import type {
  AccountWithInstitution,
  PlaidItemStatus,
} from "@/app/api/accounts/route";
import { PlaidReauthButton } from "@/components/plaid/PlaidReauthButton";

interface AccountsPanelProps {
  accounts: AccountWithInstitution[];
  itemStatuses?: PlaidItemStatus[];
  onReauthSuccess?: () => void;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; dimColor: string }
> = {
  depository: {
    label: "Cash",
    color: "var(--accent-green)",
    dimColor: "var(--accent-green-dim)",
  },
  credit: {
    label: "Credit Cards",
    color: "var(--accent-red)",
    dimColor: "var(--accent-red-dim)",
  },
  investment: {
    label: "Investments",
    color: "var(--accent-blue)",
    dimColor: "var(--accent-blue-dim)",
  },
  loan: {
    label: "Loans",
    color: "var(--accent-amber)",
    dimColor: "var(--accent-amber-dim)",
  },
  other: {
    label: "Other",
    color: "var(--accent-purple)",
    dimColor: "var(--accent-purple-dim)",
  },
};

function groupByType(accounts: AccountWithInstitution[]) {
  const groups: Record<string, AccountWithInstitution[]> = {};
  for (const acct of accounts) {
    const type = acct.type in TYPE_CONFIG ? acct.type : "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(acct);
  }
  return groups;
}

export function AccountsPanel({
  accounts,
  itemStatuses = [],
  onReauthSuccess,
}: AccountsPanelProps) {
  const grouped = groupByType(accounts);
  const typeOrder = ["depository", "credit", "investment", "loan", "other"];

  const errorItems = itemStatuses.filter((s) => s.errorCode);

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
        <div className="text-[var(--text-muted)] text-sm">
          No accounts connected yet.
          <br />
          Connect a bank to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorItems.length > 0 && (
        <div className="rounded-xl border border-[var(--accent-red)] bg-[var(--accent-red-dim)] p-4">
          <div className="text-xs font-medium text-[var(--accent-red)] mb-2">
            Connection issues
          </div>
          <div className="space-y-2">
            {errorItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="text-sm text-[var(--text-primary)]">
                    {item.institutionName}
                  </span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {item.errorCode === "ITEM_LOGIN_REQUIRED"
                      ? "Login expired"
                      : item.errorMessage ?? item.errorCode}
                  </span>
                </div>
                {item.errorCode === "ITEM_LOGIN_REQUIRED" && (
                  <PlaidReauthButton
                    itemId={item.id}
                    onSuccess={onReauthSuccess}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {typeOrder.map((type) => {
        const group = grouped[type];
        if (!group) return null;
        const config = TYPE_CONFIG[type];
        const groupTotal = group.reduce(
          (sum, a) => sum + parseFloat(a.currentBalance ?? "0"),
          0
        );

        return (
          <div
            key={type}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: config.color }}
                />
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {config.label}
                </span>
              </div>
              <span
                className="font-mono text-sm font-medium tabular-nums"
                style={{ color: config.color }}
              >
                {formatCurrency(groupTotal)}
              </span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {group.map((acct) => (
                <div
                  key={acct.accountId}
                  className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)] truncate">
                        {acct.name}
                      </span>
                      {acct.mask && (
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          ····{acct.mask}
                        </span>
                      )}
                      {acct.errorCode && (
                        <span className="shrink-0 rounded bg-[var(--accent-red-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-red)]">
                          ERROR
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {acct.institutionName}
                      {acct.subtype && (
                        <span className="ml-1 capitalize">
                          · {acct.subtype}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right pl-4">
                    <div className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(acct.currentBalance)}
                    </div>
                    {acct.availableBalance &&
                      acct.availableBalance !== acct.currentBalance && (
                        <div className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                          {formatCurrency(acct.availableBalance)} avail
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
