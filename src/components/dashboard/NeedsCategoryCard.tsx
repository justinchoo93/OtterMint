"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardHeader, cx } from "@/components/ui";
import { CategoryPicker } from "@/components/dashboard/CategoryPicker";
import { formatCurrency, formatWholeCurrency } from "@/lib/format";
import type { UncategorizedGroup } from "@/lib/category-memory";
import type { UncategorizedResponse } from "@/app/api/analytics/uncategorized/route";

interface NeedsCategoryCardProps {
  /** Changes after a data refresh or a save anywhere; refetches. */
  refreshKey?: number;
  /** Called after the owner saves a category here. */
  onCategorized?: () => void;
}

type State =
  | { status: "loading"; data: UncategorizedResponse | null }
  | { status: "ready"; data: UncategorizedResponse }
  | { status: "error"; data: UncategorizedResponse | null };

const VISIBLE_GROUPS = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

function span(group: UncategorizedGroup): string {
  if (group.count === 1) {
    return `${MONTHS[Number(group.lastDate.slice(5, 7)) - 1]} ${Number(group.lastDate.slice(8, 10))}, ${group.lastDate.slice(0, 4)}`;
  }
  const first = monthYear(group.firstDate);
  const last = monthYear(group.lastDate);
  return first === last ? first : `${first} to ${last}`;
}

/**
 * The review queue on the Analytics tab: transactions with no category,
 * grouped by merchant, largest first. Categorizing a group with "apply to
 * similar" ticked clears all of it at once.
 */
export function NeedsCategoryCard({ refreshKey, onCategorized }: NeedsCategoryCardProps) {
  const [state, setState] = useState<State>({ status: "loading", data: null });
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState<UncategorizedGroup | null>(null);
  const [localKey, setLocalKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState((current) => ({ status: "loading", data: current.data }));
      try {
        const response = await fetch("/api/analytics/uncategorized", { signal: controller.signal });
        if (!response.ok) throw new Error(`Uncategorized request failed: ${response.status}`);
        setState({ status: "ready", data: (await response.json()) as UncategorizedResponse });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch uncategorized transactions:", error);
        setState((current) => ({ status: "error", data: current.data }));
      }
    };
    load();
    return () => controller.abort();
  }, [refreshKey, localKey]);

  const data = state.data;
  if (!data) {
    return state.status === "error" ? (
      <Card aria-label="Needs a category">
        <p className="text-caption text-ink-muted">Couldn&apos;t load uncategorized transactions.</p>
      </Card>
    ) : null;
  }
  if (data.groups.length === 0) return null;

  const visible = expanded ? data.groups : data.groups.slice(0, VISIBLE_GROUPS);
  const totals = [
    `${data.count} ${data.count === 1 ? "transaction" : "transactions"}`,
    Number.parseFloat(data.outflow) > 0 ? `${formatWholeCurrency(data.outflow)} out` : null,
    Number.parseFloat(data.inflow) > 0 ? `${formatWholeCurrency(data.inflow)} in` : null,
  ].filter(Boolean);

  return (
    <Card aria-label="Needs a category" className={cx("flex flex-col", state.status === "loading" && "opacity-70")}>
      <CardHeader
        title="Needs a category"
        subtitle={`${totals.join(" · ")} · grouped by merchant, largest first`}
      />
      <ul className={cx("mt-4 divide-y divide-line-subtle", expanded && "max-h-[480px] overflow-y-auto")}>
        {visible.map((group) => {
          const cents = Math.round(Number.parseFloat(group.total) * 100);
          const inflow = cents < 0;
          return (
            <li key={group.key} className="flex items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-ink">{group.label}</span>
                <span className="truncate text-xs text-ink-muted">
                  {group.count} {group.count === 1 ? "transaction" : "transactions"} · {span(group)}
                </span>
              </div>
              <span
                className={cx(
                  "shrink-0 font-mono text-sm tabular-nums",
                  inflow ? "text-positive" : "text-ink"
                )}
              >
                {inflow ? "+" : ""}
                {formatCurrency(Math.abs(cents) / 100)}
              </span>
              <Button size="sm" onClick={() => setPicking(group)} aria-label={`Categorize ${group.label}`}>
                Categorize
              </Button>
            </li>
          );
        })}
      </ul>
      {data.groups.length > VISIBLE_GROUPS && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer" : `Show all ${data.groups.length} merchants`}
          </Button>
        </div>
      )}
      {picking && (
        <CategoryPicker
          id={picking.id}
          title={picking.label}
          onClose={() => setPicking(null)}
          // The page's refresh refetches this card too; refetch locally only without one.
          onSaved={() => (onCategorized ? onCategorized() : setLocalKey((key) => key + 1))}
        />
      )}
    </Card>
  );
}
