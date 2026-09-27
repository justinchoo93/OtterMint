import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  ReferenceLine: () => null,
  ReferenceDot: () => null,
  Area: ({ dataKey }: { dataKey?: string }) => <div data-testid="chart-area" data-key={dataKey} />,
  Line: ({ data, dataKey, strokeDasharray }: { strokeDasharray?: string; data?: unknown; dataKey?: string }) => (
    <div
      data-testid="chart-line"
      data-dash={strokeDasharray}
      data-has-private-data={String(data !== undefined)}
      data-key={dataKey}
    />
  ),
}));

import { NetWorthChart, type NetWorthHistory } from "@/components/dashboard/NetWorthChart";

function response(overrides: Partial<NetWorthHistory> = {}): NetWorthHistory {
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

function unknownCoverage(label: string, kind: "legacy_unknown" | "coverage_unknown"): NetWorthHistory {
  return response({
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
        kind,
        assetAdjustment: null,
        liabilityAdjustment: null,
        netWorthAdjustment: null,
        sourceCount: null,
        label,
      },
    ],
    periodChange: { reported: "600000.00", normalized: null },
  });
}

describe("NetWorthChart", () => {
  it("shows Normalized selected with honest wording kept in the notes", () => {
    render(<NetWorthChart history={response()} mode="normalized" normalizedAvailable onModeChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Normalized" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("About this chart")).toBeInTheDocument();
    expect(screen.getByText(/Earlier values use first known balances for comparison/)).toBeInTheDocument();
    expect(screen.getByText(/\$600,000\.00 first-known balance normalized out of change/)).toBeInTheDocument();
    expect(screen.getByText("Account change")).toBeInTheDocument();
  });

  it("reports mode changes to its owner", () => {
    const onModeChange = vi.fn();
    render(<NetWorthChart history={response()} mode="normalized" normalizedAvailable onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Reported" }));
    expect(onModeChange).toHaveBeenCalledWith("reported");
  });

  it("shows segmented reported history when normalization is unavailable", () => {
    render(
      <NetWorthChart
        history={unknownCoverage("Coverage may have changed around this date", "legacy_unknown")}
        mode="reported"
        normalizedAvailable={false}
        onModeChange={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: "Normalized" })).not.toBeInTheDocument();
    expect(screen.getByText(/The line is split where OtterMint cannot compare/)).toBeInTheDocument();
    expect(screen.getByText(/Coverage may have changed around this date/)).toBeInTheDocument();
  });

  it("plots only net worth, with an area under observed stretches and a padded y-domain", () => {
    render(<NetWorthChart history={response()} mode="normalized" normalizedAvailable onModeChange={() => {}} />);
    const lines = screen.getAllByTestId("chart-line");
    expect(lines.every((line) => line.getAttribute("data-key")!.startsWith("net_worth_"))).toBe(true);
    const areas = screen.getAllByTestId("chart-area");
    const estimated = lines.filter((line) => line.getAttribute("data-dash") === "6 4").map((l) => l.getAttribute("data-key"));
    expect(areas.map((a) => a.getAttribute("data-key"))).not.toEqual(expect.arrayContaining(estimated));
    const domain = JSON.parse(screen.getByTestId("chart-y-axis").getAttribute("data-domain")!);
    expect(domain[0]).toBeGreaterThan(0);
  });

  it("keeps every segmented series on one unique chronological x-axis", () => {
    const base = response().snapshots[0];
    const dates = ["2026-07-04", "2026-07-05", "2026-07-06", "2026-07-20", "2026-07-23"];
    const history = response({
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
    });
    render(<NetWorthChart history={history} mode="reported" normalizedAvailable={false} onModeChange={() => {}} />);

    const chartData = JSON.parse(
      screen.getByTestId("line-chart").getAttribute("data-chart-data") ?? "[]"
    ) as Array<{ date: string; timestamp: number }>;
    expect(chartData.map((point) => point.date)).toEqual(dates);
    expect(new Set(chartData.map((point) => point.timestamp)).size).toBe(dates.length);
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute("data-key", "timestamp");
    expect(screen.getByTestId("chart-x-axis")).toHaveAttribute("data-axis-type", "number");
    const initialDimension = JSON.parse(
      screen.getByTestId("responsive-chart").getAttribute("data-initial-dimension") ?? "null"
    ) as { width: number; height: number } | null;
    expect(initialDimension?.width).toBeGreaterThan(0);
    expect(initialDimension?.height).toBeGreaterThan(0);
    const lines = screen.getAllByTestId("chart-line");
    expect(lines.every((line) => line.getAttribute("data-has-private-data") === "false")).toBe(true);
    expect(
      lines.every((line) => {
        const dataKey = line.getAttribute("data-key");
        return dataKey !== null && chartData.some((point) => typeof (point as Record<string, unknown>)[dataKey] === "number");
      })
    ).toBe(true);
  });

  it("keeps household annotations generic", () => {
    render(
      <NetWorthChart
        history={unknownCoverage("Household coverage changed", "coverage_unknown")}
        mode="reported"
        normalizedAvailable={false}
        onModeChange={() => {}}
        isHousehold
      />
    );
    expect(screen.getByText(/Household coverage changed/)).toBeInTheDocument();
    expect(screen.queryByText(/first-known/)).not.toBeInTheDocument();
  });

  it("labels and dashes reconstructed values and discloses their sources", () => {
    const history = response({
      snapshots: response().snapshots.map((point) => ({
        ...point,
        quality: "reconstructed",
        reconstructionNotes: "Card value carried from its prior statement.",
        coverageSegment: 0,
        comparisonSegment: 0,
      })),
      coverageEvents: [],
      periodChange: { reported: "0.00", normalized: null },
    });
    render(<NetWorthChart history={history} mode="reported" normalizedAvailable={false} onModeChange={() => {}} />);
    expect(screen.getByText(/Dashed history is estimated from statements/)).toBeInTheDocument();
    expect(screen.getByText(/Dashed historical values are reconstructed estimates/)).toBeInTheDocument();
    // Two consecutive points with the same note collapse into one dated range.
    expect(screen.getAllByText(/Card value carried from its prior statement/)).toHaveLength(1);
    expect(screen.getByText(/Jul 1 – Jul 5/)).toBeInTheDocument();
    expect(screen.getAllByTestId("chart-line").every((line) => line.getAttribute("data-dash") === "6 4")).toBe(true);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-area")).not.toBeInTheDocument();
  });
});
