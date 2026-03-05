"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/format";

interface SharedData {
  label: string | null;
  displayName: string;
  snapshots?: Array<{
    date: string;
    totalAssets: string;
    totalLiabilities: string;
    netWorth: string;
  }>;
  accounts?: Array<{
    name: string;
    type: string;
    subtype: string | null;
    mask: string | null;
    currentBalance: string | null;
    institutionName: string;
  }>;
  manualAccounts?: Array<{
    name: string;
    type: string;
    subtype: string | null;
    balance: string;
  }>;
}

type ViewState = "loading" | "ready" | "unavailable" | "error";

export default function SharedViewPage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<ViewState>("loading");
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSharedData() {
      try {
        const res = await fetch(`/api/shared/${token}`);
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) {
            setState("unavailable");
          } else {
            setState("error");
            const d = await res.json();
            setError(d.error || "Something went wrong");
          }
          return;
        }

        const d = await res.json();
        setData(d);
        setState("ready");
      } catch {
        setState("error");
        setError("Failed to load shared data");
      }
    }

    fetchSharedData();
  }, [token]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="h-40 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] animate-pulse-subtle" />
        </div>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 sm:p-8 text-center">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            otterfin
          </h1>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            This share link is no longer available.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
        <p className="text-sm text-[var(--accent-red)]">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const latestSnapshot =
    data.snapshots && data.snapshots.length > 0
      ? data.snapshots[data.snapshots.length - 1]
      : null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              otterfin
            </h1>
            <span className="text-xs text-[var(--text-muted)]">
              shared view
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <p className="text-xs text-[var(--text-muted)]">
            {data.displayName}&apos;s finances
            {data.label && ` \u2022 ${data.label}`}
          </p>

          {latestSnapshot && (
            <>
              <div className="mt-3">
                <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                  {formatCurrency(parseFloat(latestSnapshot.netWorth))}
                </span>
              </div>
              <div className="mt-4 flex gap-6">
                <div>
                  <span className="text-xs text-[var(--text-muted)]">
                    Assets
                  </span>
                  <div className="font-mono text-sm tabular-nums text-[var(--accent-green)]">
                    {formatCurrency(parseFloat(latestSnapshot.totalAssets))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)]">
                    Liabilities
                  </span>
                  <div className="font-mono text-sm tabular-nums text-[var(--accent-red)]">
                    {formatCurrency(
                      parseFloat(latestSnapshot.totalLiabilities)
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {data.accounts && data.accounts.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Accounts
            </h2>
            <div className="space-y-2">
              {data.accounts.map((acct, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                >
                  <div>
                    <span className="text-sm text-[var(--text-primary)]">
                      {acct.name}
                    </span>
                    {acct.mask && (
                      <span className="ml-1 text-xs text-[var(--text-muted)]">
                        ····{acct.mask}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {acct.institutionName}
                    </span>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {acct.currentBalance
                      ? formatCurrency(parseFloat(acct.currentBalance))
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.manualAccounts && data.manualAccounts.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Manual Accounts
            </h2>
            <div className="space-y-2">
              {data.manualAccounts.map((acct, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                >
                  <span className="text-sm text-[var(--text-primary)]">
                    {acct.name}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(parseFloat(acct.balance))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-[var(--text-muted)]">
          Read-only view &bull; Powered by OtterFin
        </p>
      </main>
    </div>
  );
}
