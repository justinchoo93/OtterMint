"use client";

import { X } from "lucide-react";

export interface ChipProps {
  label: string;
  onDismiss: () => void;
  /** Verb for the accessible name, e.g. "Clear month". The label is appended. */
  dismissLabel?: string;
}

/** A dismissible filter chip: one button, visible label plus a close icon. */
export function Chip({ label, onDismiss, dismissLabel = "Clear" }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={`${dismissLabel}: ${label}`}
      className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface-raised pr-2.5 pl-3 text-caption font-medium text-ink transition-colors hover:bg-surface-hover"
    >
      <span>{label}</span>
      <X aria-hidden className="h-3.5 w-3.5 text-ink-muted" />
    </button>
  );
}
