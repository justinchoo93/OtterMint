"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
} from "lucide-react";
import { NetWorthCard } from "@/components/dashboard/NetWorthCard";
import { AccountsPanel } from "@/components/dashboard/AccountsPanel";
import { TransactionsFeed } from "@/components/dashboard/TransactionsFeed";
import { HoldingsPanel } from "@/components/dashboard/HoldingsPanel";
import { ManualAccountsPanel } from "@/components/manual/ManualAccountsPanel";
import { NetWorthChart } from "@/components/dashboard/NetWorthChart";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { RefreshButton } from "@/components/dashboard/RefreshButton";
import { PlaidLinkButton } from "@/components/plaid/PlaidLinkButton";
import { AvatarMenu } from "@/components/auth/AvatarMenu";
import { DashboardTabs, type DashboardTab } from "@/components/dashboard/DashboardTabs";
import type {
  AccountWithInstitution,
  PlaidItemStatus,
} from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
}

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

type NavDestination =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "investments"
  | "analytics";

const NAV_ITEMS: {
  id: NavDestination;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts", icon: CreditCard },
  { id: "transactions", label: "Transactions", icon: ListOrdered },
  { id: "investments", label: "Investments", icon: BriefcaseBusiness },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountWithInstitution[]>([]);
  const [manualAccounts, setManualAccounts] = useState<ManualAccountRow[]>([]);
  const [itemStatuses, setItemStatuses] = useState<PlaidItemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("personal");
  const [activeDestination, setActiveDestination] =
    useState<NavDestination>("dashboard");
  const [navExpanded, setNavExpanded] = useState(true);

  // Household data
  const [householdAccounts, setHouseholdAccounts] = useState<AccountWithInstitution[]>([]);
  const [householdManualAccounts, setHouseholdManualAccounts] = useState<ManualAccountRow[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});

    // Check if user is in a group
    fetch("/api/groups")
      .then((res) => res.json())
      .then((data) => {
        if (data.groups?.length > 0) {
          setGroup(data.groups[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("ottermint-nav-expanded");
    if (stored) setNavExpanded(stored === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ottermint-nav-expanded", String(navExpanded));
  }, [navExpanded]);

  const fetchAccounts = useCallback(async () => {
    try {
      const [acctRes, manualRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/manual-accounts"),
      ]);
      const acctData = await acctRes.json();
      const manualData = await manualRes.json();
      setAccounts(acctData.accounts ?? []);
      setItemStatuses(acctData.itemStatuses ?? []);
      setManualAccounts(manualData.manualAccounts ?? []);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHouseholdData = useCallback(async () => {
    if (!group) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/accounts`);
      const data = await res.json();
      setHouseholdAccounts(data.accounts ?? []);
      setHouseholdManualAccounts(data.manualAccounts ?? []);
    } catch (err) {
      console.error("Failed to fetch household data:", err);
    }
  }, [group]);

  const handleRefresh = useCallback(() => {
    fetchAccounts();
    setRefreshKey((k) => k + 1);
    if (group) fetchHouseholdData();
  }, [fetchAccounts, fetchHouseholdData, group]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (group && activeTab === "household") {
      fetchHouseholdData();
    }
  }, [group, activeTab, fetchHouseholdData]);

  const lastRefreshed = accounts.reduce<string | null>((latest, acct) => {
    if (!acct.lastRefreshedAt) return latest;
    if (!latest) return acct.lastRefreshedAt;
    return acct.lastRefreshedAt > latest ? acct.lastRefreshedAt : latest;
  }, null);

  const showHouseholdTab = group && group.memberCount > 1;
  const isHousehold = activeTab === "household";
  const visibleAccounts = isHousehold ? householdAccounts : accounts;
  const visibleManualAccounts = isHousehold
    ? householdManualAccounts
    : manualAccounts;
  const pageTitle =
    NAV_ITEMS.find((item) => item.id === activeDestination)?.label ??
    "Dashboard";

  const renderLoadingState = () => (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 h-8 w-48 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 flex gap-6">
          <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
          <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
          <div className="h-3 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
          <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
          <div className="h-3 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
          <div className="mt-4 h-56 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
        <div className="mt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-12 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle"
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    if (loading) return renderLoadingState();

    if (activeDestination === "dashboard") {
      return (
        <div className="space-y-6 animate-fade-in">
          <NetWorthCard
            accounts={visibleAccounts}
            manualAccounts={visibleManualAccounts}
            label={isHousehold ? "Household Net Worth" : undefined}
          />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <AccountsPanel
              accounts={visibleAccounts}
              itemStatuses={isHousehold ? [] : itemStatuses}
              onReauthSuccess={handleRefresh}
            />
            {!isHousehold && <TransactionsFeed refreshKey={refreshKey} />}
          </div>
          {isHousehold && (
            <p className="text-xs text-[var(--text-muted)]">
              Note: If you and a group member share a joint account, it may appear twice.
            </p>
          )}
        </div>
      );
    }

    if (activeDestination === "accounts") {
      return (
        <div className="space-y-6 animate-fade-in">
          <AccountsPanel
            accounts={visibleAccounts}
            itemStatuses={isHousehold ? [] : itemStatuses}
            onReauthSuccess={handleRefresh}
          />
          {!isHousehold && <ManualAccountsPanel onChanged={fetchAccounts} />}
          {isHousehold && (
            <p className="text-xs text-[var(--text-muted)]">
              Note: If you and a group member share a joint account, it may appear twice.
            </p>
          )}
        </div>
      );
    }

    if (activeDestination === "transactions") {
      return (
        <div className="animate-fade-in">
          {isHousehold ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-muted)]">
              Household transaction feeds are not available yet.
            </div>
          ) : (
            <TransactionsFeed refreshKey={refreshKey} />
          )}
        </div>
      );
    }

    if (activeDestination === "investments") {
      return (
        <div className="animate-fade-in">
          {isHousehold ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-muted)]">
              Household investment holdings are not available yet.
            </div>
          ) : (
            <HoldingsPanel refreshKey={refreshKey} />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-fade-in">
        <NetWorthCard
          accounts={visibleAccounts}
          manualAccounts={visibleManualAccounts}
          label={isHousehold ? "Household Net Worth" : undefined}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NetWorthChart refreshKey={refreshKey} groupId={isHousehold ? group?.id : undefined} />
          {!isHousehold ? (
            <SpendingChart refreshKey={refreshKey} />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-muted)]">
              Household spending analytics are not available yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="flex min-h-screen">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] transition-[width] duration-200 md:block ${
            navExpanded ? "w-60" : "w-[76px]"
          }`}
        >
          <div className="flex h-full flex-col px-3 py-4">
            <div className="flex h-10 items-center justify-between">
              <div
                className={`min-w-0 overflow-hidden transition-opacity ${
                  navExpanded ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  ottermint
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setNavExpanded((expanded) => !expanded)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                aria-label={navExpanded ? "Collapse navigation" : "Expand navigation"}
                title={navExpanded ? "Collapse navigation" : "Expand navigation"}
              >
                {navExpanded ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </div>

            <nav className="mt-6 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeDestination === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveDestination(item.id)}
                    className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--accent-blue-dim)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                    aria-label={item.label}
                    title={navExpanded ? undefined : item.label}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-[var(--accent-blue)]" : ""
                      }`}
                    />
                    <span
                      className={`truncate transition-opacity ${
                        navExpanded ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)] md:hidden">
                    ottermint
                  </h1>
                  <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {pageTitle}
                  </h2>
                  {showHouseholdTab && (
                    <DashboardTabs
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <RefreshButton
                  onRefreshed={handleRefresh}
                  lastRefreshed={lastRefreshed}
                />
                {activeTab === "personal" && (
                  <PlaidLinkButton onSuccess={handleRefresh} />
                )}
                {user && <AvatarMenu displayName={user.displayName} />}
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-t border-[var(--border-subtle)] px-3 py-2 md:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeDestination === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveDestination(item.id)}
                    className={`flex h-10 min-w-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--accent-blue-dim)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-[var(--accent-blue)]" : ""
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
