"use client";

import { useState, useEffect, useCallback } from "react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";

interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  includeNetWorth: boolean;
  includeBalances: boolean;
  includeTransactions: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function SharingSettingsPage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New link form
  const [label, setLabel] = useState("");
  const [includeNetWorth, setIncludeNetWorth] = useState(true);
  const [includeBalances, setIncludeBalances] = useState(false);
  const [includeTransactions, setIncludeTransactions] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/share-links");
      const data = await res.json();
      setLinks(data.shareLinks ?? []);
    } catch (err) {
      console.error("Failed to fetch share links:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          includeNetWorth,
          includeBalances,
          includeTransactions,
        }),
      });

      if (res.ok) {
        setLabel("");
        setIncludeNetWorth(true);
        setIncludeBalances(false);
        setIncludeTransactions(false);
        await fetchLinks();
      }
    } catch (err) {
      console.error("Failed to create share link:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(linkId: string) {
    if (!confirm("Revoke this share link? Anyone with it will lose access.")) {
      return;
    }

    try {
      await fetch(`/api/share-links?id=${linkId}`, { method: "DELETE" });
      await fetchLinks();
    } catch (err) {
      console.error("Failed to revoke share link:", err);
    }
  }

  function handleCopy(link: ShareLink) {
    navigator.clipboard.writeText(
      `${window.location.origin}/shared/${link.token}`
    );
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <SettingsLayout title="Share Links">
        <div className="h-40 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] animate-pulse-subtle" />
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Share Links">
      <p className="text-sm text-[var(--text-secondary)]">
        Create read-only links to share your financial summary with others
        (e.g., an accountant or financial advisor). No account required to view.
      </p>

      {/* Create new link */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Create New Link
        </h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., For accountant"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-blue)]"
            />
          </div>
          <div className="space-y-2">
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              What to include
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includeNetWorth}
                onChange={(e) => setIncludeNetWorth(e.target.checked)}
                className="rounded"
              />
              Net worth overview
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includeBalances}
                onChange={(e) => setIncludeBalances(e.target.checked)}
                className="rounded"
              />
              Account balances
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includeTransactions}
                onChange={(e) => setIncludeTransactions(e.target.checked)}
                className="rounded"
              />
              Transactions
            </label>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || (!includeNetWorth && !includeBalances && !includeTransactions)}
            className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create link"}
          </button>
        </div>
      </div>

      {/* Existing links */}
      {links.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Active Links
          </h2>
          <div className="space-y-3">
            {links.map((link) => (
              <div
                key={link.id}
                className="rounded-lg bg-[var(--bg-tertiary)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {link.label || "Unnamed link"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(link)}
                      className="text-xs text-[var(--accent-blue)] hover:underline"
                    >
                      {copiedId === link.id ? "Copied!" : "Copy URL"}
                    </button>
                    <button
                      onClick={() => handleRevoke(link.id)}
                      className="text-xs text-[var(--accent-red)] hover:underline"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-[var(--text-muted)]">
                  {link.includeNetWorth && <span>Net Worth</span>}
                  {link.includeBalances && <span>Balances</span>}
                  {link.includeTransactions && <span>Transactions</span>}
                  {link.expiresAt && (
                    <span>
                      Expires{" "}
                      {new Date(link.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
