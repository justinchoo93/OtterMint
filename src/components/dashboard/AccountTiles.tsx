"use client";

import { DeltaIndicator, cx } from "@/components/ui";
import { formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";
import type { Scope, Stretch } from "@/lib/investments-model";

export interface AccountTileData {
  id: Scope;
  /** "Chase"; empty for the All tile, which keeps the line so values align. */
  institution: string;
  /** "Self-Directed", or "All accounts". */
  title: string;
  mask: string | null;
  value: number;
  /** Set for a period that ended before today, when the value is still today's balance. */
  valueNote?: string;
  change: Stretch | null;
  /** Lifetime or anchored net gain sentence, or the account count for All. */
  note: string;
}

interface AccountTilesProps {
  tiles: AccountTileData[];
  scope: Scope;
  onScope: (scope: Scope) => void;
}

/** The account filter: one pressed tile scopes the whole page. */
export function AccountTiles({ tiles, scope, onScope }: AccountTilesProps) {
  return (
    <div
      role="group"
      aria-label="Account filter"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5"
    >
      {tiles.map((tile) => {
        const pressed = tile.id === scope;
        const change = tile.change;
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onScope(tile.id)}
            className={cx(
              "flex w-[196px] shrink-0 flex-col items-start gap-1 rounded-tile border bg-surface p-4 text-left transition-colors sm:min-h-[124px] sm:w-auto sm:px-5 sm:py-4",
              pressed ? "border-accent" : "border-line hover:border-chart-muted"
            )}
          >
            <span className="flex h-4 items-center text-micro text-ink-muted">{tile.institution}</span>
            <span className="flex min-w-0 max-w-full items-baseline gap-1.5 text-caption font-medium text-ink-secondary">
              <span className="truncate">{tile.title}</span>
              {tile.mask && <span className="shrink-0 font-mono text-micro text-ink-muted">····{tile.mask}</span>}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl leading-[1.1] font-semibold tracking-[-0.02em] text-ink">
                {formatWholeCurrency(tile.value)}
              </span>
              {tile.valueNote && <span className="text-micro text-ink-muted">{tile.valueNote}</span>}
            </span>
            {change ? (
              <DeltaIndicator
                direction={change.amount > 0 ? "up" : change.amount < 0 ? "down" : "flat"}
                tone={change.amount > 0 ? "positive" : change.amount < 0 ? "negative" : "neutral"}
              >
                {formatSignedWholeCurrency(change.amount)}
                {change.pct !== null ? ` (${formatSignedPercent(change.pct)})` : ""}
              </DeltaIndicator>
            ) : (
              <span className="text-xs text-ink-muted">no change to measure yet</span>
            )}
            <span className="text-micro leading-[1.3] text-ink-muted">{tile.note}</span>
          </button>
        );
      })}
    </div>
  );
}
