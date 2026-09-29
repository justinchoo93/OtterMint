"use client";

import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { ACTIVITY_LABELS, formatShortDate, type InvestmentActivity } from "@/lib/investments-model";

const PREVIEW_ROWS = 8;

export interface ActivityCardProps {
  /** Newest first, already scoped. */
  events: InvestmentActivity[];
  /** The true count for the scope and range (the response caps the list). */
  total: number;
  subtitle: string;
  showAccount: boolean;
  accountLabel: (accountId: string) => string;
  expanded: boolean;
  onToggle: () => void;
}

function detailOf(event: InvestmentActivity): string | null {
  if (event.quantity === null || event.price === null) return null;
  const quantity = Math.abs(Number.parseFloat(event.quantity));
  if (!Number.isFinite(quantity) || quantity === 0) return null;
  const unit = /\b(call|put)\b/i.test(event.name) ? "contract" : "share";
  const noun = quantity === 1 ? unit : `${unit}s`;
  return `${quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${noun} at ${formatCurrency(event.price)}`;
}

/** The brokerage feed for the range and scope, eight rows unless expanded. */
export function ActivityCard({ events, total, subtitle, showAccount, accountLabel, expanded, onToggle }: ActivityCardProps) {
  const visible = expanded ? events : events.slice(0, PREVIEW_ROWS);
  const showingAll = visible.length >= total;
  const footer = showingAll
    ? `Showing all ${total} · newest first`
    : `Showing ${visible.length} of ${total} · newest first`;

  return (
    <Card padding="none" aria-label="Activity">
      <div className="p-5 pb-4 sm:px-6">
        <CardHeader title="Activity" subtitle={subtitle} />
      </div>
      {events.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6">
          <EmptyState compact>No activity in this range.</EmptyState>
        </div>
      ) : (
        <ul>
          {visible.map((event) => {
            const amount = Number.parseFloat(event.amount);
            const detail = detailOf(event);
            const meta = [detail, showAccount ? accountLabel(event.accountId) : null].filter(Boolean).join(" · ");
            return (
              <li
                key={event.id}
                data-testid="activity-row"
                className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line-subtle px-4 py-[11px] transition-colors hover:bg-surface-raised sm:grid-cols-[56px_84px_minmax(0,1fr)_110px] sm:gap-3 sm:px-6"
              >
                <span className="font-mono text-xs text-ink-muted">{formatShortDate(event.date)}</span>
                <span className="hidden h-[22px] items-center justify-self-start rounded-md bg-surface-raised px-2 text-micro font-medium text-ink-secondary sm:inline-flex">
                  {ACTIVITY_LABELS[event.kind]}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-caption text-ink">{event.name}</span>
                  <span className="truncate text-micro text-ink-muted">
                    <span className="sm:hidden">{ACTIVITY_LABELS[event.kind]}{meta ? " · " : ""}</span>
                    {meta}
                  </span>
                </span>
                <span className="text-right font-mono text-caption text-ink tabular-nums">
                  {amount > 0 ? "+" : ""}
                  {formatCurrency(amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-xs text-ink-muted sm:px-6">
        <span>{footer}</span>
        {total > PREVIEW_ROWS && (
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {expanded ? "Show fewer" : `Show all ${total}`}
          </Button>
        )}
      </div>
    </Card>
  );
}
