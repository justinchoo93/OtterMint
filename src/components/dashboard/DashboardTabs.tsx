"use client";

import { SegmentedControl } from "@/components/ui";

export type DashboardTab = "personal" | "household";

interface DashboardTabsProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

const OPTIONS = [
  { value: "personal", label: "My Finances" },
  { value: "household", label: "Household" },
] as const;

export function DashboardTabs({ activeTab, onTabChange }: DashboardTabsProps) {
  return (
    <SegmentedControl
      ariaLabel="Whose finances"
      size="sm"
      options={OPTIONS}
      value={activeTab}
      onChange={onTabChange}
    />
  );
}
