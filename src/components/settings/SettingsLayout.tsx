"use client";

import Link from "next/link";

interface SettingsLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsLayout({ title, children }: SettingsLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          &larr; Dashboard
        </Link>
        <h1 className="mb-6 text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h1>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
