"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, Card, CardHeader, cx, EmptyState } from "@/components/ui";
import type { AnalyticsDetail } from "@/components/dashboard/AnalyticsView";
import {
  categoryRowFor,
  monthLongLabel,
  periodDelta,
  sumPeriod,
  type CategoryRow,
  type Delta,
} from "@/lib/analytics-model";
import { labelForCategoryKey, type CashflowLineItem, type CashflowMonth } from "@/lib/cashflow";
import { formatCurrency, formatSignedPercent, formatSignedWholeCurrency, formatWholeCurrency } from "@/lib/format";
import type { CashflowItemsResponse } from "@/app/api/analytics/cashflow/items/route";

interface AnalyticsDetailsProps {
  detail: AnalyticsDetail;
  periodMonths: CashflowMonth[];
  priorMonths: CashflowMonth[] | null;
  periodLabel: string;
  comparisonLabel: string | null;
  rows: CategoryRow[];
  onClose: () => void;
  /** Changes after a data refresh; refetches the open list. */
  refreshKey?: number;
}

type ItemsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: CashflowItemsResponse }
  | { status: "error" };

const SPENDING_LIMIT = 25;
const CATEGORY_LIMIT = 200;

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-xl leading-tight font-semibold text-ink">{value}</span>
    </div>
  );
}

function ItemsTable({ items, tone }: { items: CashflowLineItem[]; tone: "income" | "neutral" }) {
  return (
    <div className="mt-4 max-h-[480px] overflow-y-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-muted">
            <th className="w-14 py-2 pr-3 pl-2.5 font-medium sm:w-24">Date</th>
            <th className="py-2 pr-3 font-medium">Merchant</th>
            <th className="hidden w-44 py-2 pr-3 font-medium md:table-cell">Category</th>
            <th className="hidden w-48 py-2 pr-3 font-medium md:table-cell">Account</th>
            <th className="w-28 py-2 pr-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const amount = Number.parseFloat(item.amount);
            return (
              <tr key={`${item.date}-${item.name}-${index}`} className="border-b border-line-subtle">
                <td className="py-2.5 pr-3 pl-2.5 align-top font-mono text-xs text-ink-muted tabular-nums">
                  {shortDate(item.date)}
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <span className="block truncate text-ink">{item.merchantName ?? item.name}</span>
                  <span className="block truncate text-xs text-ink-muted md:hidden">
                    {labelForCategoryKey(item.categoryKey)} · {item.accountName}
                  </span>
                </td>
                <td className="hidden truncate py-2.5 pr-3 align-top text-ink-secondary md:table-cell">
                  {labelForCategoryKey(item.categoryKey)}
                </td>
                <td className="hidden truncate py-2.5 pr-3 align-top text-ink-secondary md:table-cell">
                  {item.accountName}
                </td>
                <td
                  className={cx(
                    "py-2.5 pr-2.5 text-right align-top font-mono tabular-nums",
                    tone === "income" && amount > 0 ? "text-positive" : "text-ink"
                  )}
                >
                  {tone === "income" && amount > 0 ? "+" : ""}
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthTable({ months }: { months: CashflowMonth[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-muted">
            <th className="py-2 pr-3 pl-2.5 font-medium">Month</th>
            <th className="py-2 pr-3 text-right font-medium">Income</th>
            <th className="py-2 pr-3 text-right font-medium">Spending</th>
            <th className="py-2 pr-3 text-right font-medium">Saved</th>
            <th className="py-2 pr-2.5 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {[...months].reverse().map((month) => {
            const t = sumPeriod([month]);
            return (
              <tr key={month.month} className="border-b border-line-subtle">
                <td className="py-2.5 pr-3 pl-2.5 font-sans text-ink">
                  {monthLongLabel(month.month)}
                  {month.partial ? <span className="text-ink-muted"> · to date</span> : null}
                </td>
                <td className="py-2.5 pr-3 text-right text-ink-secondary">{formatWholeCurrency(t.income)}</td>
                <td className="py-2.5 pr-3 text-right text-ink-secondary">{formatWholeCurrency(t.spending)}</td>
                <td className="py-2.5 pr-3 text-right text-ink-secondary">{formatWholeCurrency(t.savings)}</td>
                <td className={cx("py-2.5 pr-2.5 text-right", t.netCashFlow >= 0 ? "text-positive" : "text-negative")}>
                  {formatSignedWholeCurrency(t.netCashFlow)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The transactions (or months) behind the selected stat tile or category. */
export function AnalyticsDetails({
  detail,
  periodMonths,
  priorMonths,
  periodLabel,
  comparisonLabel,
  rows,
  onClose,
  refreshKey,
}: AnalyticsDetailsProps) {
  const ref = useRef<HTMLElement>(null);
  const [items, setItems] = useState<ItemsState>({ status: "idle" });
  const from = periodMonths[0]?.month ?? "";
  const to = periodMonths[periodMonths.length - 1]?.month ?? "";
  const selectedCategory = detail?.kind === "category" ? detail.key : null;
  // A category folded into Other for this period still has its own transactions.
  const categoryRow = selectedCategory
    ? (rows.find((r) => r.key === selectedCategory) ??
      (selectedCategory === "OTHER" ? null : categoryRowFor(periodMonths, priorMonths, selectedCategory)))
    : null;
  // Other is every key except the ranked rows, sent as a short exclude list.
  const categoryParams =
    categoryRow?.key === "OTHER"
      ? rows.filter((r) => r.key !== "OTHER").map((r) => `&exclude=${encodeURIComponent(r.key)}`).join("")
      : (categoryRow?.memberKeys.map((k) => `&category=${encodeURIComponent(k)}`).join("") ?? "");

  let url: string | null = null;
  if (detail?.kind === "spending") {
    url = `/api/analytics/cashflow/items?from=${from}&to=${to}&flow=spending&sort=amount&limit=${SPENDING_LIMIT}`;
  } else if (detail?.kind === "category" && categoryRow) {
    url = `/api/analytics/cashflow/items?from=${from}&to=${to}&flow=spending&sort=date&limit=${CATEGORY_LIMIT}${categoryParams}`;
  }

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const load = async () => {
      setItems({ status: "loading" });
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Items request failed: ${response.status}`);
        setItems({ status: "ready", data: (await response.json()) as CashflowItemsResponse });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch cash-flow items:", error);
        setItems({ status: "error" });
      }
    };
    load();
    return () => controller.abort();
  }, [url, refreshKey]);

  const detailKey = detail ? (selectedCategory ? `category:${selectedCategory}` : detail.kind) : null;
  useEffect(() => {
    if (!detailKey || !ref.current || typeof ref.current.scrollIntoView !== "function") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [detailKey]);

  if (!detail) {
    return (
      <EmptyState compact>Select a stat or a category to see the transactions behind it.</EmptyState>
    );
  }

  const totals = sumPeriod(periodMonths);
  const prior = priorMonths ? sumPeriod(priorMonths) : null;
  const versus = comparisonLabel ? comparisonLabel.replace(/^Compared with /, "vs ") : null;
  const subtitle = (delta: Delta | null) =>
    delta && versus ? `${periodLabel} · ${formatSignedPercent(delta.pct, 0)} ${versus}` : periodLabel;

  let title: string;
  let delta: Delta | null = null;
  let stats: Array<{ label: string; value: string }> = [];
  let body: ReactNode;
  let footer: string | null = null;

  const remoteBody = (tone: "income" | "neutral") => {
    if (items.status === "error") {
      return <p className="mt-4 text-caption text-ink-muted">Transactions couldn&apos;t load. Try again.</p>;
    }
    if (items.status !== "ready") {
      return <p className="mt-4 text-caption text-ink-muted">Loading transactions…</p>;
    }
    if (items.data.items.length === 0) {
      return <EmptyState className="mt-4">No transactions in this period.</EmptyState>;
    }
    return <ItemsTable items={items.data.items} tone={tone} />;
  };
  const remoteCount = items.status === "ready" ? items.data.count : null;

  if (detail.kind === "income" || detail.kind === "saved") {
    const isIncome = detail.kind === "income";
    const list = periodMonths
      .flatMap((m) => (isIncome ? m.incomeItems : m.savingsItems))
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    title = isIncome ? "Income" : "Saved";
    const value = isIncome ? totals.income : totals.savings;
    delta = prior ? periodDelta(value, isIncome ? prior.income : prior.savings, true) : null;
    const largest = list.reduce((max, item) => Math.max(max, Number.parseFloat(item.amount)), 0);
    stats = isIncome
      ? [
          { label: "Total", value: formatWholeCurrency(value) },
          { label: "Deposits", value: String(list.length) },
          { label: "Largest", value: formatWholeCurrency(largest) },
        ]
      : [
          { label: "Total", value: formatWholeCurrency(value) },
          { label: "Transfers", value: String(list.length) },
          {
            label: "Of income",
            value: totals.income > 0 ? `${Math.round((value / totals.income) * 100)}%` : "—",
          },
        ];
    body =
      list.length === 0 ? (
        <EmptyState className="mt-4">No transactions in this period.</EmptyState>
      ) : (
        <ItemsTable items={list} tone={isIncome ? "income" : "neutral"} />
      );
    footer = `${list.length} ${list.length === 1 ? "transaction" : "transactions"}`;
  } else if (detail.kind === "net") {
    title = "Net cash flow";
    delta = prior ? periodDelta(totals.netCashFlow, prior.netCashFlow, true) : null;
    stats = [
      { label: "Total", value: formatSignedWholeCurrency(totals.netCashFlow) },
      { label: "Months", value: String(periodMonths.length) },
      {
        label: "Kept",
        value: totals.income > 0 ? `${Math.round((totals.netCashFlow / totals.income) * 100)}%` : "—",
      },
    ];
    body = <MonthTable months={periodMonths} />;
  } else if (detail.kind === "spending") {
    title = "Largest purchases";
    delta = prior ? periodDelta(totals.spending, prior.spending, false) : null;
    stats = [
      { label: "Spending", value: formatWholeCurrency(totals.spending) },
      { label: "Transactions", value: remoteCount === null ? "…" : String(remoteCount) },
      {
        label: "Average",
        value: remoteCount ? formatCurrency(totals.spending / remoteCount) : "…",
      },
    ];
    body = remoteBody("neutral");
    if (items.status === "ready") {
      footer = `Showing the ${items.data.items.length} largest of ${items.data.count} transactions`;
    }
  } else {
    const key = selectedCategory ?? "";
    title = categoryRow ? categoryRow.label : key === "OTHER" ? "Other" : labelForCategoryKey(key);
    if (!categoryRow) {
      body = <EmptyState className="mt-4">No transactions in this period.</EmptyState>;
    } else {
      delta = categoryRow.delta;
      stats = [
        { label: "Total", value: formatWholeCurrency(categoryRow.total) },
        { label: "Transactions", value: remoteCount === null ? "…" : String(remoteCount) },
        {
          label: "Average",
          value: remoteCount ? formatCurrency(categoryRow.total / remoteCount) : "…",
        },
      ];
      body = remoteBody("neutral");
      if (items.status === "ready") {
        footer =
          items.data.items.length < items.data.count
            ? `Showing ${items.data.items.length} of ${items.data.count} transactions`
            : `${items.data.count} ${items.data.count === 1 ? "transaction" : "transactions"}`;
      }
    }
  }

  return (
    <Card ref={ref} aria-label={`${title} details`}>
      <CardHeader
        title={title}
        subtitle={subtitle(delta)}
        actions={
          <>
            {stats.length > 0 && (
              <div className="flex items-start gap-6">
                {stats.map((stat) => (
                  <Stat key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </div>
            )}
            <Button
              size="sm"
              iconOnly
              aria-label="Close details"
              onClick={onClose}
              icon={<X aria-hidden className="h-4 w-4 shrink-0" />}
            />
          </>
        }
      />
      {body}
      {footer && <p className="mt-3 text-xs text-ink-muted">{footer}</p>}
    </Card>
  );
}
