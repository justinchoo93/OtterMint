import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({
    children,
    initialDimension,
  }: {
    children: React.ReactNode;
    initialDimension?: { width: number; height: number };
  }) => (
    <div
      data-testid="responsive-chart"
      data-initial-dimension={JSON.stringify(initialDimension ?? null)}
    >
      {children}
    </div>
  ),
  LineChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data?: Array<Record<string, unknown>>;
  }) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  CartesianGrid: () => null,
  XAxis: ({
    dataKey,
    type,
  }: {
    dataKey?: string;
    type?: string;
  }) => (
    <div
      data-testid="chart-x-axis"
      data-key={dataKey}
      data-axis-type={type}
    />
  ),
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  Line: ({
    data,
    dataKey,
  }: {
    data?: unknown;
    dataKey?: string;
  }) => (
    <div
      data-testid="chart-line"
      data-has-private-data={String(data !== undefined)}
      data-key={dataKey}
    />
  ),
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

  it("keeps every segmented metric on one unique chronological x-axis", async () => {
    const base = response().snapshots[0];
    const dates = [
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-20",
      "2026-07-23",
    ];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () =>
        response({
          snapshots: dates.map((date, index) => ({
            ...base,
            date,
            totalAssets: `${580000 + index * 1000}.00`,
            netWorth: `${580000 + index * 1000}.00`,
            adjustedTotalAssets: null,
            adjustedTotalLiabilities: null,
            adjustedNetWorth: null,
            quality: index === 0 ? "observed" : "unknown_coverage",
            coverageSegment: index,
            comparisonSegment: index,
          })),
          coverageEvents: dates.slice(1).map((date) => ({
            date,
            kind: "legacy_unknown" as const,
            assetAdjustment: null,
            liabilityAdjustment: null,
            netWorthAdjustment: null,
            sourceCount: null,
            label: "Coverage may have changed around this date",
          })),
          periodChange: { reported: "4000.00", normalized: null },
        }),
    } as Response);

    render(<NetWorthChart />);

    const chart = await screen.findByTestId("line-chart");
    const chartData = JSON.parse(
      chart.getAttribute("data-chart-data") ?? "[]"
    ) as Array<{ date: string; timestamp: number }>;

    expect(chartData).toHaveLength(dates.length);
    expect(chartData.map((point) => point.date)).toEqual(dates);
    expect(new Set(chartData.map((point) => point.timestamp)).size).toBe(
      dates.length
    );
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute(
      "data-key",
      "timestamp"
    );
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute(
      "data-axis-type",
      "number"
    );
    const initialDimension = JSON.parse(
      screen
        .getByTestId("responsive-chart")
        .getAttribute("data-initial-dimension") ?? "null"
    ) as { width: number; height: number } | null;
    expect(initialDimension?.width).toBeGreaterThan(0);
    expect(initialDimension?.height).toBeGreaterThan(0);
    const lines = screen.getAllByTestId("chart-line");
    expect(
      lines.every(
        (line) => line.getAttribute("data-has-private-data") === "false"
      )
    ).toBe(true);
    expect(
      lines.every((line) => {
        const dataKey = line.getAttribute("data-key");
        return (
          dataKey !== null &&
          chartData.some(
            (point) =>
              typeof (point as Record<string, unknown>)[dataKey] === "number"
          )
        );
      })
    ).toBe(true);
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
