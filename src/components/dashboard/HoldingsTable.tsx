"use client";

import type { CSSProperties } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, DeltaIndicator, EmptyState, SegmentedControl, cx } from "@/components/ui";
import { formatCurrency, formatSignedPercent, formatSignedWholeCurrency } from "@/lib/format";
import { HOLDINGS_FILTERS, formatSecurityLabel, type HoldingGroup, type HoldingsFilter } from "@/lib/investments-model";

export interface HoldingsTableProps {
  groups: HoldingGroup[];
  /** Total value of every scoped group, filtered or not, for the weight column. */
  totalValue: number;
  subtitle: string;
  showAccount: boolean;
  changeHeader: string;
  /** "3M", for the phone rows' change line. */
  rangeLabel: string;
  /** False for a period that ended before today: the change would run from its start to today. */
  showChange?: boolean;
  filter: HoldingsFilter;
  onFilter: (filter: HoldingsFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  totals: { gain: number; gainPct: number | null };
  accountLabel: (accountId: string) => string;
}

const FILTER_OPTIONS = HOLDINGS_FILTERS.map((f) => ({ value: f.id, label: f.label }));

function direction(n: number): "up" | "down" | "flat" {
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

function tone(n: number): "positive" | "negative" | "neutral" {
  return n > 0 ? "positive" : n < 0 ? "negative" : "neutral";
}

const CELL = "hidden sm:block";
const RIGHT = "hidden text-right font-mono text-xs text-ink-secondary tabular-nums sm:block";

/** Positions grouped by security, one row each, cash pinned last. */
export function HoldingsTable({
  groups,
  totalValue,
  subtitle,
  showAccount,
  changeHeader,
  rangeLabel,
  showChange = true,
  filter,
  onFilter,
  query,
  onQuery,
  totals,
  accountLabel,
}: HoldingsTableProps) {
  const cols = ["minmax(0, 1fr)", showAccount && "132px", "96px", "96px", showChange && "104px", "120px", "72px", "120px"]
    .filter(Boolean)
    .join(" ");
  const gridStyle = { "--cols": cols } as CSSProperties;
  const rowClass = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:grid-cols-[var(--cols)] sm:px-6";

  return (
    <Card padding="none" aria-label="Holdings">
      <div className="p-5 sm:px-6 sm:pt-5 sm:pb-4">
        <CardHeader
          title="Holdings"
          subtitle={subtitle}
          actions={
            <>
              <SegmentedControl
                ariaLabel="Security type"
                options={FILTER_OPTIONS}
                value={filter}
                onChange={onFilter}
                size="sm"
                fullWidth
                className="sm:inline-flex sm:w-auto"
              />
              <label className="relative flex w-full items-center sm:w-[200px]">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => onQuery(event.target.value)}
                  placeholder="Search holdings"
                  aria-label="Search holdings"
                  className="h-11 w-full rounded-control border border-line bg-surface-raised pr-2.5 pl-8 text-caption text-ink placeholder:text-ink-muted sm:h-8"
                />
              </label>
            </>
          }
        />
      </div>

      <div
        className={cx(rowClass, "hidden border-t border-b border-line-subtle py-2.5 text-micro font-medium text-ink-secondary sm:grid")}
        style={gridStyle}
      >
        <span>Security</span>
        {showAccount && <span>Account</span>}
        <span className="text-right">Shares</span>
        <span className="text-right">Price</span>
        {showChange && <span className="text-right">{changeHeader}</span>}
        <span className="flex items-center justify-end gap-1">
          <span>Value</span>
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="text-ink-muted" fill="currentColor">
            <path d="M5 8.5 1.5 5h2V1.5h3V5h2z" />
          </svg>
        </span>
        <span className="text-right">Weight</span>
        <span className="text-right">Unrealized gain</span>
      </div>

      {groups.length === 0 && (
        <div className="px-5 pb-5 sm:px-6">
          <EmptyState compact>No holdings match.</EmptyState>
        </div>
      )}

      {groups.map((group) => {
        const { label, detail } = group.isCash
          ? { label: "Cash", detail: "Money market sweep" }
          : formatSecurityLabel(group.ticker, group.name, group.securityType);
        const shares = group.isCash
          ? "—"
          : group.contracts
            ? `${group.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} contracts`
            : group.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 });
        const weight = totalValue > 0 ? `${((group.value / totalValue) * 100).toFixed(1)}%` : "—";
        const gain = group.isCash || group.cost === null ? null : group.value - group.cost;
        const gainPct = gain !== null && group.cost ? (gain / group.cost) * 100 : null;
        const account =
          group.accountIds.length > 1 ? `${group.accountIds.length} accounts` : accountLabel(group.accountIds[0] ?? "");
        return (
          <div
            key={group.key}
            data-testid="holding-row"
            className={cx(rowClass, "border-t border-line-subtle py-3 transition-colors hover:bg-surface-raised sm:py-[13px]")}
            style={gridStyle}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-caption font-semibold text-ink">{label}</span>
              <span className="truncate text-xs text-ink-secondary">{detail}</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-micro text-ink-muted sm:hidden">
                <span>{group.isCash ? account : shares.replace(/^(\S+)$/, "$1 sh")}</span>
                {showChange && group.changePct !== null && (
                  <>
                    <span>·</span>
                    <DeltaIndicator direction={direction(group.changePct)} tone={tone(group.changePct)}>
                      {formatSignedPercent(group.changePct)}
                    </DeltaIndicator>
                    <span>{rangeLabel}</span>
                  </>
                )}
              </span>
            </span>
            {showAccount && <span className={cx(CELL, "whitespace-nowrap text-xs text-ink-secondary")}>{account}</span>}
            <span className={RIGHT}>{shares}</span>
            <span className={RIGHT}>{group.isCash ? "—" : formatCurrency(group.price)}</span>
            {showChange && (
            <span className="hidden justify-end sm:flex">
              {group.changePct === null ? (
                <span className="font-mono text-xs text-ink-muted" title={group.isCash ? undefined : "No price history in this range"}>
                  —
                </span>
              ) : (
                <DeltaIndicator direction={direction(group.changePct)} tone={tone(group.changePct)}>
                  <span className="font-mono tabular-nums">{formatSignedPercent(group.changePct)}</span>
                </DeltaIndicator>
              )}
            </span>
            )}
            <span className="flex flex-col items-end gap-0.5 sm:contents">
              <span className="text-right font-mono text-sm text-ink tabular-nums">{formatCurrency(group.value)}</span>
              <span className={RIGHT}>{weight}</span>
              <span
                className={cx(
                  "flex flex-col items-end gap-0.5 font-mono text-xs tabular-nums",
                  gain === null ? "text-ink-muted" : gain > 0 ? "text-positive" : gain < 0 ? "text-negative" : "text-ink-secondary"
                )}
                title={gain === null && !group.isCash ? "No cost basis reported" : undefined}
              >
                <span className="font-semibold">{gain === null ? "—" : formatSignedWholeCurrency(gain)}</span>
                {gainPct !== null && <span className="text-micro">{formatSignedPercent(gainPct)}</span>}
              </span>
            </span>
          </div>
        );
      })}

      <div
        className={cx(rowClass, "border-t border-line-subtle py-3.5 text-caption font-semibold text-ink")}
        style={gridStyle}
      >
        <span>Total</span>
        {showAccount && <span className={CELL} />}
        <span className={CELL} />
        <span className={CELL} />
        <span className={CELL} />
        <span className="flex flex-col items-end gap-0.5 sm:contents">
          <span className="text-right font-mono text-sm tabular-nums">{formatCurrency(totalValue)}</span>
          <span className={RIGHT}>100%</span>
          <span
            className={cx(
              "flex flex-col items-end gap-0.5 font-mono text-xs tabular-nums",
              totals.gain > 0 ? "text-positive" : totals.gain < 0 ? "text-negative" : "text-ink-secondary"
            )}
          >
            <span>{formatSignedWholeCurrency(totals.gain)}</span>
            {totals.gainPct !== null && (
              <span className="whitespace-nowrap text-micro font-normal">{formatSignedPercent(totals.gainPct)} vs cost</span>
            )}
          </span>
        </span>
      </div>
    </Card>
  );
}
