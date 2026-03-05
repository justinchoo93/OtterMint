"use client";

export type DashboardTab = "personal" | "household";

interface DashboardTabsProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export function DashboardTabs({ activeTab, onTabChange }: DashboardTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bg-tertiary)] p-0.5">
      <button
        onClick={() => onTabChange("personal")}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          activeTab === "personal"
            ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        My Finances
      </button>
      <button
        onClick={() => onTabChange("household")}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          activeTab === "household"
            ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        Household
      </button>
    </div>
  );
}
