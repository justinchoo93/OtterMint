"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { HoldingRow } from "@/app/api/holdings/route";

interface HoldingsPanelProps {
  refreshKey?: number;
}

export function HoldingsPanel({ refreshKey }: HoldingsPanelProps) {
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch("/api/holdings");
      const data = await res.json();
      setHoldings(data.holdings ?? []);
    } catch (err) {
      console.error("Failed to fetch holdings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
        <div className="h-4 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-10 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle"
            />
          ))}
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return null;
  }

  const totalValue = holdings.reduce(
    (sum, h) => sum + parseFloat(h.value),
    0
  );
  const totalCost = holdings.reduce(
    (sum, h) => sum + parseFloat(h.costBasis ?? h.value),
    0
  );
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--accent-blue)" }}
          />
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Holdings
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`font-mono text-[11px] sm:text-xs tabular-nums ${
              totalGain >= 0
                ? "text-[var(--accent-green)]"
                : "text-[var(--accent-red)]"
            }`}
          >
            {totalGain >= 0 ? "+" : ""}
            {formatCurrency(totalGain)} ({totalGainPct >= 0 ? "+" : ""}
            {totalGainPct.toFixed(1)}%)
          </span>
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: "var(--accent-blue)" }}
          >
            {formatCurrency(totalValue)}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_80px_90px_100px_100px] gap-2 px-4 py-2 border-b border-[var(--border-subtle)] text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        <span>Security</span>
        <span className="hidden sm:block text-right">Qty</span>
        <span className="hidden sm:block text-right">Price</span>
        <span className="text-right">Value</span>
        <span className="text-right">Gain/Loss</span>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        {holdings.map((holding) => {
          const value = parseFloat(holding.value);
          const cost = parseFloat(holding.costBasis ?? holding.value);
          const gain = value - cost;
          const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

          return (
            <div
              key={holding.id}
              className="grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_80px_90px_100px_100px] gap-2 items-center px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {holding.tickerSymbol && (
                    <span className="font-mono text-xs font-medium text-[var(--accent-blue)]">
                      {holding.tickerSymbol}
                    </span>
                  )}
                  <span className="text-sm text-[var(--text-secondary)] truncate">
                    {holding.name}
                  </span>
                </div>
              </div>
              <span className="hidden sm:block font-mono text-xs tabular-nums text-right text-[var(--text-secondary)]">
                {parseFloat(holding.quantity).toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </span>
              <span className="hidden sm:block font-mono text-xs tabular-nums text-right text-[var(--text-secondary)]">
                {formatCurrency(holding.price)}
              </span>
              <span className="font-mono text-sm tabular-nums text-right text-[var(--text-primary)]">
                {formatCurrency(value)}
              </span>
              <div className="text-right">
                <span
                  className={`font-mono text-xs tabular-nums ${
                    gain >= 0
                      ? "text-[var(--accent-green)]"
                      : "text-[var(--accent-red)]"
                  }`}
                >
                  {gain >= 0 ? "+" : ""}
                  {formatCurrency(gain)}
                </span>
                <div
                  className={`font-mono text-[10px] tabular-nums ${
                    gain >= 0
                      ? "text-[var(--accent-green)]"
                      : "text-[var(--accent-red)]"
                  }`}
                >
                  {gainPct >= 0 ? "+" : ""}
                  {gainPct.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
