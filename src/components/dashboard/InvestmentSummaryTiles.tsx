"use client";

import { DeltaIndicator } from "@/components/ui";

export interface SummaryTileData {
  label: string;
  value: string;
  delta?: { direction: "up" | "down" | "flat"; tone: "positive" | "negative" | "neutral"; text: string };
  note: string;
}

/** Four figures that explain the range: market gain, contributions, income, unrealized gain. */
export function InvestmentSummaryTiles({ tiles }: { tiles: SummaryTileData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex min-h-[110px] flex-col gap-1.5 rounded-tile border border-line bg-surface p-4 sm:min-h-[124px] sm:px-5 sm:py-[18px]"
        >
          <span className="text-caption font-medium text-ink-secondary">{tile.label}</span>
          <span className="text-[1.5rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-figure">
            {tile.value}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-muted">
            {tile.delta && (
              <DeltaIndicator direction={tile.delta.direction} tone={tile.delta.tone}>
                {tile.delta.text}
              </DeltaIndicator>
            )}
            {tile.note && <span>{tile.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
