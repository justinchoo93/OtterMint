import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ label }: { label?: { value?: string } }) => (
    <div data-testid="reference-line" data-label={label?.value ?? ""} />
  ),
  Line: ({ dataKey, strokeDasharray }: { dataKey?: string; strokeDasharray?: string }) => (
    <div data-testid="chart-line" data-key={dataKey} data-dash={strokeDasharray ?? ""} />
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="pie" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  Cell: () => null,
}));

import { InvestmentPerformancePanel } from "@/components/dashboard/InvestmentPerformancePanel";
import type { InvestmentsResponse } from "@/app/api/analytics/investments/route";

function payload(overrides: Partial<InvestmentsResponse> = {}): InvestmentsResponse {
  return {
    series: {
      points: [
        { date: "2026-07-05", value: "391010.83", segment: 0, quality: "legacy" },
        { date: "2026-07-22", value: "451013.63", segment: 0, quality: "legacy" },
        { date: "2026-07-23", value: "452791.71", segment: 1, quality: "known" },
        { date: "2026-08-14", value: "459956.89", segment: 1, quality: "known" },
      ],
      boundaries: [{ date: "2026-07-23", step: null }],
      accounts: [],
    },
    attribution: {
      windowStart: "2026-07-23",
      windowEnd: "2026-08-14",
      start: "452791.71",
      contributions: "2500.00",
      withdrawals: "0.00",
      marketPnl: "4665.18",
      coverageSteps: "0.00",
      end: "459956.89",
    },
    xirr: null,
    unrealized: {
      total: {
        value: "441206.06",
        cost: "302145.39",
        gain: "139060.67",
        gainPct: "46.0",
        cashValue: "16330.21",
        excludedValue: "0.00",
      },
      byAccount: [
        {
          accountId: "sd",
          name: "Self-Directed",
          value: "120103.88",
          cost: "59450.76",
          gain: "60653.12",
          gainPct: "102.0",
        },
      ],
      positions: [
        {
          accountId: "sd",
          account: "Self-Directed",
          securityId: "qqq",
          ticker: "QQQ",
          name: "Invesco QQQ",
          value: "77472.90",
          cost: "55985.88",
          gain: "21487.02",
          gainPct: "38.4",
        },
      ],
    },
    flows: [{ date: "2026-07-31", kind: "contribution", amount: "2500.00" }],
    dividends: {
      trailingTwelveMonths: "512.40",
      monthly: [{ month: "2026-08", total: "46.80" }],
    },
    allocation: [
      { type: "equity", value: "237524.57", share: "51.6", count: 16 },
      { type: "derivative", value: "46384.00", share: "10.1", count: 4 },
      { type: "cash", value: "16330.21", share: "3.5", count: 4 },
    ],
    ...overrides,
  };
}

function stubFetch(body: InvestmentsResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => body })
  );
}

beforeEach(() => {
  stubFetch(payload());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvestmentPerformancePanel", () => {
  it("shows a loading skeleton before the fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<InvestmentPerformancePanel />);
    expect(container.querySelector(".animate-pulse-subtle")).toBeInTheDocument();
  });

  it("renders the four KPI tiles from the payload", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(screen.getByText("Portfolio value")).toBeInTheDocument();
    });
    expect(screen.getAllByText("$459,956.89").length).toBeGreaterThan(0);
    expect(screen.getByText("+$139,060.67")).toBeInTheDocument();
    expect(screen.getByText("+46.0% vs cost")).toBeInTheDocument();
    expect(screen.getAllByText("+$4,665.18").length).toBeGreaterThan(0);
  });

  it("explains a null xirr instead of showing a number", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(
        screen.getByText("return annualizes after 30 days of trusted history")
      ).toBeInTheDocument();
    });
  });

  it("shows the annualized return once xirr is present", async () => {
    stubFetch(payload({ xirr: "0.1042" }));
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(
        screen.getByText("10.4% money-weighted, annualized")
      ).toBeInTheDocument();
    });
  });

  it("marks the legacy region and draws it dashed", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(
        screen.getByText(/Coverage unknown before Jul 23/)
      ).toBeInTheDocument();
    });
    const lines = screen.getAllByTestId("chart-line");
    const legacy = lines.find((l) => l.getAttribute("data-key") === "seg_0");
    const trusted = lines.find((l) => l.getAttribute("data-key") === "seg_1");
    expect(legacy?.getAttribute("data-dash")).toBe("5 4");
    expect(trusted?.getAttribute("data-dash")).toBe("");
  });

  it("renders attribution rows and the basis-exclusion footnote", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(screen.getByText("Change Attribution")).toBeInTheDocument();
    });
    expect(screen.getByText("Contributions")).toBeInTheDocument();
    expect(screen.getAllByText("Market P&L").length).toBe(2); // KPI + attribution row
    expect(
      screen.getByText(/\$16,330\.21 sits in uninvested\s+cash/)
    ).toBeInTheDocument();
  });

  it("shows 'unknown' market P&L when steps are unexplained", async () => {
    stubFetch(
      payload({
        attribution: {
          windowStart: "2026-07-23",
          windowEnd: "2026-08-14",
          start: "452791.71",
          contributions: "2500.00",
          withdrawals: "0.00",
          marketPnl: null,
          coverageSteps: "0.00",
          end: "459956.89",
        },
      })
    );
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(screen.getByText("unknown")).toBeInTheDocument();
    });
    expect(
      screen.getByText("not computable across an unexplained account change")
    ).toBeInTheDocument();
  });

  it("renders the empty state for a user with no investment data", async () => {
    stubFetch({
      series: { points: [], boundaries: [], accounts: [] },
      attribution: null,
      xirr: null,
      unrealized: {
        total: { value: "0.00", cost: "0.00", gain: "0.00", gainPct: "0.0",
          cashValue: "0.00", excludedValue: "0.00" },
        byAccount: [],
        positions: [],
      },
      flows: [],
      dividends: { trailingTwelveMonths: "0.00", monthly: [] },
      allocation: [],
    });
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(
        screen.getByText("Connect an investment account to see performance.")
      ).toBeInTheDocument();
    });
  });

  it("renders the allocation donut with typed labels and shares", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(screen.getByText("Allocation")).toBeInTheDocument();
    });
    expect(screen.getByText("Single stocks")).toBeInTheDocument();
    expect(screen.getByText("Options")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("51.6%")).toBeInTheDocument();
    const pie = screen.getByTestId("pie");
    const chartData = JSON.parse(pie.getAttribute("data-chart-data") ?? "[]");
    expect(chartData).toHaveLength(3);
    expect(chartData[0]).toMatchObject({ name: "Single stocks", value: 237524.57 });
  });

  it("shows the trailing dividend income tile", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(screen.getByText("Dividends")).toBeInTheDocument();
    });
    expect(screen.getByText("$512.40")).toBeInTheDocument();
    expect(screen.getByText("trailing 12 months")).toBeInTheDocument();
  });

  it("notes that per-account lines are still accruing", async () => {
    render(<InvestmentPerformancePanel />);
    await waitFor(() => {
      expect(
        screen.getByText(/Per-account history accrues from each refresh/)
      ).toBeInTheDocument();
    });
  });
});
