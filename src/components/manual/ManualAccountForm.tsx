"use client";

import { useState } from "react";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

interface ManualAccountFormProps {
  account?: ManualAccountRow | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ManualAccountForm({
  account,
  onSaved,
  onCancel,
}: ManualAccountFormProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<"asset" | "liability">(
    (account?.type as "asset" | "liability") ?? "asset"
  );
  const [subtype, setSubtype] = useState(account?.subtype ?? "");
  const [balance, setBalance] = useState(account?.balance ?? "");
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!account;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = { name, type, subtype, balance, notes };

    try {
      const res = await fetch("/api/manual-accounts", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: account.id, ...payload } : payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }

      onSaved?.();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:outline-none";
  const labelClass = "block text-xs font-medium text-[var(--text-muted)] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Account Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. River Bitcoin, House"
          className={inputClass}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "asset" | "liability")}
            className={inputClass}
          >
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Subtype (optional)</label>
          <input
            type="text"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            placeholder="crypto, real estate, etc."
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Balance</label>
        <input
          type="text"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="0.00"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className={labelClass}>Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional info"
          className={inputClass}
        />
      </div>

      {error && (
        <div className="text-xs text-[var(--accent-red)]">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? "Saving..." : isEditing ? "Update" : "Add Account"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
