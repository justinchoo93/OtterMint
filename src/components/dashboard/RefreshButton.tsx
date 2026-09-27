"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

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
        <span className="hidden text-xs text-ink-muted sm:inline">
          Updated {formatLastRefreshed(lastRefreshed)}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={handleRefresh}
        disabled={refreshing}
        icon={
          <RefreshCw
            aria-hidden
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin-slow" : ""}`}
          />
        }
      >
        {refreshing ? "Refreshing..." : "Refresh"}
      </Button>
    </div>
  );
}
