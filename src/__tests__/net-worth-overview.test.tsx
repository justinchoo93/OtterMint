import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Pass,
    ComposedChart: Pass,
    CartesianGrid: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
    Tooltip: Nothing,
    ReferenceLine: Nothing,
    ReferenceDot: Nothing,
    Area: Nothing,
    Line: Nothing,
  };
});

import { NetWorthOverview } from "@/components/dashboard/NetWorthOverview";
import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";

function account(id: number, type: string, balance: number): AccountWithInstitution {
  return {
    id,
    accountId: `acct-${id}`,
    name: `Account ${id}`,
    officialName: null,
    type,
    subtype: null,
    mask: null,
    currentBalance: balance.toFixed(2),
    availableBalance: null,
    limitAmount: null,
    isoCurrencyCode: "USD",
    lastRefreshedAt: null,
    institutionName: "Bank",
    errorCode: null,
  };
}

const ACCOUNTS = [account(1, "depository", 18450), account(2, "investment", 503800), account(3, "credit", 2740), account(4, "loan", 123000)];

function point(date: string, value: number, overrides: Partial<NetWorthSnapshotRow> = {}): NetWorthSnapshotRow {
  return {
    date,
    totalAssets: value.toFixed(2),
    totalLiabilities: "0.00",
    netWorth: value.toFixed(2),
    depositoryTotal: null,
    creditTotal: null,
    investmentTotal: null,
    loanTotal: null,
    manualAssetsTotal: null,
    manualLiabilitiesTotal: null,
    adjustedTotalAssets: value.toFixed(2),
    adjustedTotalLiabilities: "0.00",
    adjustedNetWorth: value.toFixed(2),
    quality: "observed",
    coverageSegment: 1,
    comparisonSegment: 1,
    ...overrides,
  };
}

function stubHistory(snapshots: NetWorthSnapshotRow[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshots, coverageEvents: [], periodChange: null }) })
  );
}

describe("NetWorthOverview", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows live totals and the comparable change since the latest stretch began", async () => {
    stubHistory([
      point("2026-03-31", 380000, { quality: "reconstructed", reconstructionNotes: "Estimated.", coverageSegment: 0, comparisonSegment: 0 }),
      point("2026-07-01", 390000),
      point("2026-09-26", 396000),
    ]);
    render(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={178} />);

    expect(screen.getByText("$396,510")).toBeInTheDocument();
    expect(screen.getByText("$522,250")).toBeInTheDocument();
    expect(screen.getByText("$125,740")).toBeInTheDocument();
    expect(screen.getByText("Liabilities are 24% of assets.")).toBeInTheDocument();
    expect(await screen.findByText("+$6,000 (+1.5%)")).toBeInTheDocument();
    expect(screen.getByText("since Jul 1")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/net-worth?days=178", expect.objectContaining({ signal: expect.anything() }));
  });

  it("says when the measured stretch is estimated", async () => {
    stubHistory([
      point("2026-04-30", 380000, { quality: "reconstructed", reconstructionNotes: "Estimated.", coverageSegment: 0, comparisonSegment: 0 }),
      point("2026-05-31", 382000, { quality: "reconstructed", reconstructionNotes: "Estimated.", coverageSegment: 0, comparisonSegment: 0 }),
    ]);
    render(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={178} />);
    expect(await screen.findByText("since Apr 30, includes estimates")).toBeInTheDocument();
  });

  it("refetches when the range changes and uses the household route for groups", async () => {
    stubHistory([point("2026-07-01", 1), point("2026-07-02", 2)]);
    const { rerender } = render(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={178} />);
    rerender(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={87} />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/net-worth?days=87", expect.anything())
    );
    rerender(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={87} groupId="group-2" />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/groups/group-2/net-worth?days=87", expect.anything())
    );
    expect(screen.getAllByText("Household net worth").length).toBeGreaterThan(0);
  });

  it("lets the reader switch to Reported when normalization exists", async () => {
    stubHistory([
      point("2026-07-01", 0, { quality: "flat_normalized", coverageSegment: 0, comparisonSegment: 0, adjustedNetWorth: "600000.00" }),
      point("2026-07-05", 600000, { coverageSegment: 1, comparisonSegment: 0 }),
      point("2026-07-06", 601000, { coverageSegment: 1, comparisonSegment: 0 }),
    ]);
    render(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={87} />);
    const normalized = await screen.findByRole("button", { name: "Normalized" });
    expect(normalized).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("since Jul 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reported" }));
    expect(screen.getByRole("button", { name: "Reported" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("since Jul 5")).toBeInTheDocument();
  });

  it("shows an error line when history fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<NetWorthOverview accounts={ACCOUNTS} manualAccounts={[]} days={87} />);
    expect(await screen.findByText("Net worth history couldn't load. Try Refresh.")).toBeInTheDocument();
  });
});
