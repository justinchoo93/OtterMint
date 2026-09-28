import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({
    children,
    initialDimension,
  }: {
    children: React.ReactNode;
    initialDimension?: { width: number; height: number };
  }) => (
    <div data-testid="responsive-chart" data-initial-dimension={JSON.stringify(initialDimension ?? null)}>
      {children}
    </div>
  ),
  ComposedChart: ({ children, data }: { children: React.ReactNode; data?: Array<Record<string, unknown>> }) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  CartesianGrid: () => null,
  XAxis: ({ dataKey, type }: { dataKey?: string; type?: string }) => (
    <div data-testid="chart-x-axis" data-key={dataKey} data-axis-type={type} />
  ),
  YAxis: ({ domain }: { domain?: unknown }) => <div data-testid="chart-y-axis" data-domain={JSON.stringify(domain)} />,
  Tooltip: () => null,
  ReferenceDot: () => null,
  Area: ({ dataKey }: { dataKey?: string }) => <div data-testid="chart-area" data-key={dataKey} />,
  Line: ({ data, dataKey, strokeDasharray }: { strokeDasharray?: string; data?: unknown; dataKey?: string }) => (
    <div
      data-testid="chart-line"
      data-dash={strokeDasharray ?? ""}
      data-has-private-data={String(data !== undefined)}
      data-key={dataKey}
    />
  ),
}));

import { NetWorthChart, type NetWorthHistory } from "@/components/dashboard/NetWorthChart";
import type { NetWorthSnapshotRow } from "@/lib/net-worth-history";

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
    coverageFingerprint: "fp",
    adjustedTotalAssets: value.toFixed(2),
    adjustedTotalLiabilities: "0.00",
    adjustedNetWorth: value.toFixed(2),
    quality: "observed",
    coverageSegment: 1,
    comparisonSegment: 0,
    ...overrides,
  };
}

const ACCOUNT_CONNECTED = {
  date: "2026-07-20",
  kind: "captured_addition" as const,
  assetAdjustment: "60000.00",
  liabilityAdjustment: "0.00",
  netWorthAdjustment: "60000.00",
  sourceCount: 1,
  label: "Account connected",
};

/** Two estimated month ends, then observed points across an account connection. */
function history(overrides: Partial<NetWorthHistory> = {}): NetWorthHistory {
  return {
    snapshots: [
      point("2026-05-31", 623767, {
        quality: "reconstructed",
        reconstructionNotes: "Card value carried from its prior statement.",
        coverageSegment: 0,
      }),
      point("2026-06-30", 684461, {
        quality: "reconstructed",
        reconstructionNotes: "Card value carried from its prior statement.",
        coverageSegment: 0,
      }),
      point("2026-07-06", 586513, { quality: "flat_normalized", adjustedNetWorth: "646513.00" }),
      point("2026-07-20", 626800, { coverageSegment: 2 }),
      point("2026-09-27", 697765, { coverageSegment: 2 }),
    ],
    coverageEvents: [ACCOUNT_CONNECTED],
    periodChange: { reported: "73998.00", normalized: null },
    ...overrides,
  };
}

describe("NetWorthChart", () => {
  it("draws one solid net-worth line with an area, on a y-axis that hugs the data", () => {
    render(<NetWorthChart history={history()} />);

    const lines = screen.getAllByTestId("chart-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute("data-key", "netWorth");
    expect(lines[0]).toHaveAttribute("data-dash", "");
    expect(lines[0]).toHaveAttribute("data-has-private-data", "false");
    expect(screen.getAllByTestId("chart-area")).toHaveLength(1);
    expect(screen.getByTestId("chart-area")).toHaveAttribute("data-key", "netWorth");

    const domain = JSON.parse(screen.getByTestId("chart-y-axis").getAttribute("data-domain")!) as [number, number];
    expect(domain[0]).toBeGreaterThan(500000);
    expect(domain[1]).toBeLessThan(800000);
  });

  it("plots every point in order on one numeric time axis, with a value for each", () => {
    render(<NetWorthChart history={history()} />);

    const chartData = JSON.parse(
      screen.getByTestId("line-chart").getAttribute("data-chart-data") ?? "[]"
    ) as Array<{ date: string; timestamp: number; netWorth: number }>;
    expect(chartData.map((row) => row.date)).toEqual(history().snapshots.map((row) => row.date));
    expect(new Set(chartData.map((row) => row.timestamp)).size).toBe(chartData.length);
    expect(chartData.every((row) => typeof row.netWorth === "number")).toBe(true);
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute("data-key", "timestamp");
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute("data-axis-type", "number");
    const initialDimension = JSON.parse(
      screen.getByTestId("responsive-chart").getAttribute("data-initial-dimension") ?? "null"
    ) as { width: number; height: number } | null;
    expect(initialDimension?.width).toBeGreaterThan(0);
    expect(initialDimension?.height).toBeGreaterThan(0);
  });

  it("shows no mode toggle, legend or estimate styling", () => {
    render(<NetWorthChart history={history()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Normalized")).not.toBeInTheDocument();
    expect(screen.queryByText("Reported")).not.toBeInTheDocument();
    expect(screen.queryByText("Observed")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimated")).not.toBeInTheDocument();
    expect(screen.queryByText("Account change")).not.toBeInTheDocument();
    expect(screen.queryByText(/Dashed/)).not.toBeInTheDocument();
  });

  it("keeps estimate sources and account changes under About this chart", () => {
    render(<NetWorthChart history={history()} />);

    expect(screen.getByText("About this chart")).toBeInTheDocument();
    expect(screen.getByText(/Estimated values and how they were reconstructed from statements/)).toBeInTheDocument();
    // Two consecutive points with the same note collapse into one dated range.
    expect(screen.getAllByText(/Card value carried from its prior statement/)).toHaveLength(1);
    expect(screen.getByText(/May 31 – Jun 30/)).toBeInTheDocument();
    expect(screen.getByText(/Jul 20 · Account connected/)).toBeInTheDocument();
    expect(screen.queryByText(/normalized out of change/)).not.toBeInTheDocument();
  });

  it("omits the notes when there is nothing to disclose", () => {
    render(
      <NetWorthChart
        history={history({
          snapshots: [point("2026-07-06", 586513), point("2026-07-20", 626800)],
          coverageEvents: [],
        })}
      />
    );
    expect(screen.queryByText("About this chart")).not.toBeInTheDocument();
  });

  it("keeps household annotations generic", () => {
    render(
      <NetWorthChart
        history={history({
          coverageEvents: [
            {
              date: "2026-07-20",
              kind: "coverage_unknown",
              assetAdjustment: null,
              liabilityAdjustment: null,
              netWorthAdjustment: null,
              sourceCount: null,
              label: "Household coverage changed",
            },
          ],
        })}
        isHousehold
      />
    );
    expect(screen.getByText(/Jul 20 · Household coverage changed/)).toBeInTheDocument();
    expect(screen.queryByText(/first-known/)).not.toBeInTheDocument();
  });

  it("asks for a longer range when fewer than two points are in range", () => {
    render(<NetWorthChart history={history({ snapshots: [point("2026-09-27", 697765)], coverageEvents: [] })} />);
    expect(screen.getByText(/Not enough history in this range/)).toBeInTheDocument();
  });
});
