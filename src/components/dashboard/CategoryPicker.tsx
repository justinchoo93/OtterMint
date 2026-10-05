"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import { Button, cx, SegmentedControl } from "@/components/ui";
import { customCategory, type CategoryOption, type CategoryPair, type CustomFlow } from "@/lib/category-memory";
import { labelForCategoryKey } from "@/lib/cashflow";
import { formatCurrency } from "@/lib/format";
import type { CategoriesResponse } from "@/app/api/categories/route";
import type { SimilarResponse } from "@/app/api/transactions/[id]/similar/route";

interface CategoryPickerProps {
  /** transactions.id of the transaction being categorized. */
  id: number;
  /** Merchant name or descriptor, shown until the transaction's details load. */
  title: string;
  onClose: () => void;
  /** Called after a save or reset succeeds, before the picker closes. */
  onSaved: () => void;
}

type Loaded = { options: CategoryOption[]; similar: SimilarResponse };

const FLOW_OPTIONS: ReadonlyArray<{ value: CustomFlow; label: string }> = [
  { value: "spending", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "savings", label: "Savings" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sampleDate(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}

/** Plaid's sign flipped for reading: money in shows as +$X, money out as $X. */
function SampleAmount({ amount }: { amount: string }) {
  const value = Number.parseFloat(amount);
  return (
    <span className={cx("shrink-0 font-mono tabular-nums", value < 0 && "text-positive")}>
      {value < 0 ? "+" : ""}
      {formatCurrency(Math.abs(value))}
    </span>
  );
}

function samePair(a: CategoryPair | null, b: { category: string | null; categoryDetailed: string | null }): boolean {
  return Boolean(a && a.category === b.category && a.categoryDetailed === b.categoryDetailed);
}

/**
 * Choose a category for one transaction, and whether to remember it for every
 * similar transaction (src/lib/category-memory.ts). A modal dialog: a sheet at
 * the bottom on phones, a centered panel from the sm breakpoint up.
 */
export function CategoryPicker({ id, title, onClose, onSaved }: CategoryPickerProps) {
  const headingId = useId();
  const filterRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<CategoryPair | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFlow, setNewFlow] = useState<CustomFlow>("spending");
  const [applyToSimilar, setApplyToSimilar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    filterRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [optionsResponse, similarResponse] = await Promise.all([
          fetch("/api/categories", { signal: controller.signal }),
          fetch(`/api/transactions/${id}/similar`, { signal: controller.signal }),
        ]);
        if (!optionsResponse.ok || !similarResponse.ok) throw new Error("Category picker failed to load");
        const options = ((await optionsResponse.json()) as CategoriesResponse).options;
        const similar = (await similarResponse.json()) as SimilarResponse;
        setLoaded({ options, similar });
        setApplyToSimilar(similar.pending || (similar.key !== "" && similar.defaultApply));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load the category picker:", error);
        setLoadError(true);
      }
    };
    load();
    return () => controller.abort();
  }, [id]);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = (loaded?.options ?? []).filter(
      (option) =>
        !needle || option.label.toLowerCase().includes(needle) || option.groupLabel.toLowerCase().includes(needle)
    );
    const byGroup = new Map<string, CategoryOption[]>();
    for (const option of visible) {
      const list = byGroup.get(option.groupLabel) ?? [];
      list.push(option);
      byGroup.set(option.groupLabel, list);
    }
    return [...byGroup.entries()];
  }, [loaded, filter]);

  const similar = loaded?.similar ?? null;
  const matchable = similar !== null && similar.key !== "";
  const created = creating ? customCategory(newName, newFlow) : null;
  const choice = creating ? created : selected;
  const heading = similar?.label ?? title;
  const currentLabel =
    similar && (similar.categoryDetailed ?? similar.category)
      ? labelForCategoryKey(similar.categoryDetailed ?? similar.category ?? "UNCATEGORIZED")
      : "Uncategorized";

  const save = async () => {
    if (!choice || !similar) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/transactions/${id}/category`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...choice, applyToSimilar: matchable && applyToSimilar }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The category couldn't be saved.");
      }
      onSaved();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The category couldn't be saved.");
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/transactions/${id}/category`, { method: "DELETE" });
      if (!response.ok) throw new Error("The category couldn't be reset.");
      onSaved();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The category couldn't be reset.");
      setSaving(false);
    }
  };

  let rememberText: string | null = null;
  if (similar && matchable) {
    rememberText =
      similar.similarCount > 0
        ? `Also apply to ${similar.similarCount} similar ${similar.similarCount === 1 ? "transaction" : "transactions"} and future ones`
        : `Remember for future transactions from ${similar.label}`;
  }

  // Portaled to <body>: the views animate in with a transform that would
  // otherwise become this fixed overlay's containing block.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex max-h-[92vh] w-full flex-col rounded-t-card border border-line bg-surface shadow-popover sm:max-h-[85vh] sm:max-w-lg sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 pt-5 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={headingId} className="font-serif text-[1.375rem] leading-[1.15] font-normal text-ink sm:text-title">
              Choose a category
            </h2>
            <p className="truncate text-caption text-ink-secondary">
              {heading} · now <span className="text-ink">{currentLabel}</span>
            </p>
          </div>
          <Button
            size="sm"
            iconOnly
            aria-label="Close"
            onClick={onClose}
            icon={<X aria-hidden className="h-4 w-4 shrink-0" />}
          />
        </div>

        <div className="px-5 pt-4">
          <input
            ref={filterRef}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter categories"
            aria-label="Filter categories"
            className="h-11 w-full rounded-control border border-line bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted sm:h-9"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" role="radiogroup" aria-label="Categories">
          {loadError ? (
            <p className="px-2 py-4 text-caption text-ink-muted">Categories couldn&apos;t load. Close and try again.</p>
          ) : !loaded ? (
            <p className="px-2 py-4 text-caption text-ink-muted">Loading categories…</p>
          ) : (
            <>
              {groups.length === 0 && (
                <p className="px-2 py-4 text-caption text-ink-muted">No category matches “{filter}”.</p>
              )}
              {groups.map(([groupLabel, options]) => (
                <div key={groupLabel} className="pb-1">
                  <p className="px-2 pt-3 pb-1 text-xs text-ink-muted">{groupLabel}</p>
                  {options.map((option) => {
                    const isSelected = !creating && samePair(selected, option);
                    const isCurrent = similar ? samePair(option, similar) : false;
                    return (
                      <button
                        key={`${option.category}|${option.categoryDetailed}`}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setCreating(false);
                          setSelected({ category: option.category, categoryDetailed: option.categoryDetailed });
                        }}
                        className={cx(
                          "flex h-11 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-sm transition-colors sm:h-9",
                          isSelected ? "bg-surface-active text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                          {isCurrent && <span>Current</span>}
                          {isSelected && <Check aria-hidden className="h-4 w-4 text-accent" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="border-t border-line-subtle pt-2">
                <button
                  type="button"
                  aria-expanded={creating}
                  onClick={() => setCreating((value) => !value)}
                  className={cx(
                    "flex h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm transition-colors sm:h-9",
                    creating ? "bg-surface-active text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
                  )}
                >
                  <Plus aria-hidden className="h-4 w-4" />
                  New category
                </button>
                {creating && (
                  <div className="flex flex-col gap-3 px-3 pt-3 pb-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      maxLength={30}
                      placeholder="Name, e.g. Kids activities"
                      aria-label="New category name"
                      className="h-11 w-full rounded-control border border-line bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted sm:h-9"
                    />
                    <SegmentedControl
                      ariaLabel="Counts as"
                      options={FLOW_OPTIONS}
                      value={newFlow}
                      onChange={setNewFlow}
                      size="sm"
                      className="self-start"
                    />
                    {newName.trim() !== "" && !created && (
                      <p className="text-xs text-negative">Use up to 30 letters, numbers and spaces.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line-subtle px-5 pt-4 pb-5">
          {similar && similar.pending && (
            <p className="text-xs text-ink-muted">
              This transaction is pending, so the choice is remembered for {similar.label} and applies when it posts.
            </p>
          )}
          {similar && !similar.pending && matchable && rememberText && (
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={applyToSimilar}
                  onChange={(event) => setApplyToSimilar(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-mint)]"
                />
                <span>{rememberText}</span>
              </label>
              {similar.samples.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-7 text-xs text-ink-muted" aria-label="Similar transactions">
                  {similar.samples.map((sample) => (
                    <li key={sample.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {sampleDate(sample.date)} · {sample.name}
                      </span>
                      <SampleAmount amount={sample.amount} />
                    </li>
                  ))}
                  {similar.similarCount > similar.samples.length && (
                    <li>and {similar.similarCount - similar.samples.length} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          {similar && !matchable && (
            <p className="text-xs text-ink-muted">
              This transaction can&apos;t be matched to others, so only it changes.
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-xs text-negative">
              {saveError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {similar?.hasOwnChoice && (
                <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                  Reset to original
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={!choice || !similar || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
