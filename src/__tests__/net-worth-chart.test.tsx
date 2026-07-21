import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  Line: () => null,
}));

import { NetWorthChart } from "@/components/dashboard/NetWorthChart";
import type { NetWorthHistoryResponse } from "@/lib/net-worth-history-server";

function response(
  overrides: Partial<NetWorthHistoryResponse> = {}
): NetWorthHistoryResponse {
  return {
    snapshots: [
      {
        date: "2026-07-01",
        totalAssets: "0.00",
        totalLiabilities: "0.00",
        netWorth: "0.00",
        depositoryTotal: "0.00",
        creditTotal: "0.00",
        investmentTotal: "0.00",
        loanTotal: "0.00",
        manualAssetsTotal: "0.00",
        manualLiabilitiesTotal: "0.00",
        coverageFingerprint: "before",
        adjustedTotalAssets: "600000.00",
        adjustedTotalLiabilities: "0.00",
        adjustedNetWorth: "600000.00",
        quality: "flat_normalized",
        coverageSegment: 0,
        comparisonSegment: 0,
      },
      {
        date: "2026-07-05",
        totalAssets: "600000.00",
        totalLiabilities: "0.00",
        netWorth: "600000.00",
        depositoryTotal: "0.00",
        creditTotal: "0.00",
        investmentTotal: "600000.00",
        loanTotal: "0.00",
        manualAssetsTotal: "0.00",
        manualLiabilitiesTotal: "0.00",
        coverageFingerprint: "after",
        adjustedTotalAssets: "600000.00",
        adjustedTotalLiabilities: "0.00",
        adjustedNetWorth: "600000.00",
        quality: "observed",
        coverageSegment: 1,
        comparisonSegment: 0,
      },
    ],
    coverageEvents: [
      {
        date: "2026-07-05",
        kind: "captured_addition",
        assetAdjustment: "600000.00",
        liabilityAdjustment: "0.00",
        netWorthAdjustment: "600000.00",
        sourceCount: 1,
        label: "Account connected",
      },
    ],
    periodChange: { reported: "600000.00", normalized: "0.00" },
    ...overrides,
  };
}

describe("NetWorthChart", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => response(),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults captured personal history to Normalized with honest wording", async () => {
    render(<NetWorthChart />);

    expect(await screen.findByText("Net Worth Over Time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "normalized" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByText(/Earlier values use first known balances for comparison/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\$600,000\.00 first-known balance normalized out of change/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Change excluding coverage: \$0\.00/)).toBeInTheDocument();
  });

  it("allows switching to Reported mode", async () => {
    render(<NetWorthChart />);
    await screen.findByText("Net Worth Over Time");

    fireEvent.click(screen.getByRole("button", { name: "reported" }));

    expect(screen.getByRole("button", { name: "reported" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.queryByText(/Earlier values use first known balances for comparison/)
    ).not.toBeInTheDocument();
  });

  it("shows segmented reported history when normalization is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () =>
        response({
          snapshots: response().snapshots.map((point, index) => ({
            ...point,
            adjustedTotalAssets: null,
            adjustedTotalLiabilities: null,
            adjustedNetWorth: null,
            quality: index === 1 ? "unknown_coverage" : "observed",
            comparisonSegment: index,
          })),
          coverageEvents: [
            {
              date: "2026-07-05",
              kind: "legacy_unknown",
              assetAdjustment: null,
              liabilityAdjustment: null,
              netWorthAdjustment: null,
              sourceCount: null,
              label: "Coverage may have changed around this date",
            },
          ],
          periodChange: { reported: "600000.00", normalized: null },
        }),
    } as Response);

    render(<NetWorthChart />);

    await screen.findByText("Net Worth Over Time");
    expect(screen.queryByRole("button", { name: "normalized" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/The line is split where OtterMint cannot compare/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Coverage may have changed around this date/)).toBeInTheDocument();
  });

  it("keeps household annotations generic and refetches when groupId changes", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () =>
        response({
          snapshots: response().snapshots.map((point, index) => ({
            ...point,
            adjustedTotalAssets: null,
            adjustedTotalLiabilities: null,
            adjustedNetWorth: null,
            quality: index === 1 ? "unknown_coverage" : "observed",
            comparisonSegment: index,
          })),
          coverageEvents: [
            {
              date: "2026-07-05",
              kind: "coverage_unknown",
              assetAdjustment: null,
              liabilityAdjustment: null,
              netWorthAdjustment: null,
              sourceCount: null,
              label: "Household coverage changed",
            },
          ],
          periodChange: { reported: "600000.00", normalized: null },
        }),
    } as Response);

    const { rerender } = render(<NetWorthChart groupId="group-1" />);
    expect(await screen.findByText(/Household coverage changed/)).toBeInTheDocument();
    expect(screen.queryByText(/\$600,000\.00 first-known/)).not.toBeInTheDocument();

    rerender(<NetWorthChart groupId="group-2" />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/groups/group-2/net-worth?days=90")
    );
  });
});
