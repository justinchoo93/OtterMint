"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Button, Card, EmptyState } from "@/components/ui";
import { labelForCategoryKey } from "@/lib/cashflow";
import type { CategoryMemoriesResponse, CategoryMemoryRow } from "@/app/api/category-memories/route";

type State =
  | { status: "loading" }
  | { status: "ready"; memories: CategoryMemoryRow[] }
  | { status: "error" };

/** The categories the app remembers for similar transactions, each removable. */
export default function CategorySettingsPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/category-memories");
      if (!response.ok) throw new Error(`Memories request failed: ${response.status}`);
      const data = (await response.json()) as CategoryMemoriesResponse;
      setState({ status: "ready", memories: data.memories });
    } catch (error) {
      console.error("Failed to fetch category memories:", error);
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (memory: CategoryMemoryRow) => {
    setRemoving(memory.id);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/category-memories/${memory.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
      await load();
    } catch (error) {
      console.error("Failed to remove category memory:", error);
      setRemoveError(`Couldn't remove ${memory.label}. Try again.`);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <SettingsLayout title="Memorized categories">
      <p className="text-caption text-ink-secondary">
        When you categorize a transaction with “apply to similar” ticked, OtterMint remembers the choice for that
        merchant and applies it to past and future transactions. Removing one puts those transactions back to their
        original category.
      </p>
      {state.status === "loading" ? (
        <p className="text-caption text-ink-muted">Loading…</p>
      ) : state.status === "error" ? (
        <EmptyState>Memorized categories couldn&apos;t load. Reload the page to try again.</EmptyState>
      ) : state.memories.length === 0 ? (
        <EmptyState>Nothing memorized yet. Categorize a transaction and keep the box ticked.</EmptyState>
      ) : (
        <Card padding="none" aria-label="Memorized categories">
          <ul className="divide-y divide-line-subtle">
            {state.memories.map((memory) => (
              <li key={memory.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-ink">{memory.label}</span>
                  <span className="truncate text-xs text-ink-muted">
                    → {labelForCategoryKey(memory.categoryDetailed)} · {memory.matchCount}{" "}
                    {memory.matchCount === 1 ? "transaction" : "transactions"}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => remove(memory)}
                  disabled={removing !== null}
                  aria-label={`Remove ${memory.label}`}
                >
                  {removing === memory.id ? "Removing…" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {removeError && (
        <p role="alert" className="text-caption text-negative">
          {removeError}
        </p>
      )}
    </SettingsLayout>
  );
}
