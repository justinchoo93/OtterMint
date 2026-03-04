"use client";

import { useState } from "react";

interface RefreshButtonProps {
  onRefreshed?: () => void;
  lastRefreshed?: string | null;
}

export function RefreshButton({
  onRefreshed,
  lastRefreshed,
}: RefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/accounts/refresh", { method: "POST" });
      onRefreshed?.();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatLastRefreshed = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-3">
      {lastRefreshed && (
        <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
          Updated {formatLastRefreshed(lastRefreshed)}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
      >
        <svg
          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin-slow" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {refreshing ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );
}
