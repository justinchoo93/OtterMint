"use client";

import { Card, CardHeader } from "@/components/ui";
import { formatWholeCurrency } from "@/lib/format";
import type { AllocationRow } from "@/lib/investments-model";

/** One stacked bar by security type with a legend; colors are fixed per type. */
export function AllocationCard({ rows, total, asOfToday = false }: { rows: AllocationRow[]; total: number; asOfToday?: boolean }) {
  return (
    <Card aria-label="Allocation">
      <CardHeader title="Allocation" subtitle={`By security type · ${formatWholeCurrency(total)} total${asOfToday ? " · as of today" : ""}`} />
      <div aria-hidden className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-md">
        {rows.map((row) => (
          <span key={row.type} className="shrink-0" style={{ flexGrow: row.share, flexBasis: 0, background: row.color }} />
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.type} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: row.color }} />
              <span className="text-ink">{row.label}</span>
              {row.type !== "cash" && <span className="text-xs text-ink-muted">×{row.count}</span>}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-ink-secondary tabular-nums">{formatWholeCurrency(row.value)}</span>
              <span className="w-12 text-right font-mono text-caption text-ink tabular-nums">{row.share.toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
