import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-chart">{children}</div>
  ),
  BarChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data?: Array<Record<string, unknown>>;
  }) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Bar: ({ dataKey }: { dataKey?: string }) => (
    <div data-testid="chart-bar" data-key={dataKey} />
  ),
}));

import { CashflowPanel } from "@/components/dashboard/CashflowPanel";
import type { CashflowMonth } from "@/lib/cashflow";

function month(overrides: Partial<CashflowMonth> = {}): CashflowMonth {
  return {
    month: "2026-07",
    partial: false,
    income: "4200.00",
    spending: "2682.33",
    savings: "1000.00",
    netCashFlow: "1517.67",
    spendingByCategory: [
      {
        key: "RENT_AND_UTILITIES_RENT",
        primary: "RENT_AND_UTILITIES",
        total: "1800.00",
      },
      {
        key: "FOOD_AND_DRINK_RESTAURANTS",
        primary: "FOOD_AND_DRINK",
        total: "412.33",
      },
    ],
    ...overrides,
  };
}

const PAYLOAD = {
  months: [
    month(),
    month({
      month: "2026-08",
      partial: true,
      income: "2000.00",
      spending: "800.00",
      savings: "500.00",
      netCashFlow: "1200.00",
      spendingByCategory: [
        {
          key: "FOOD_AND_DRINK_GROCERIES",
          primary: "FOOD_AND_DRINK",
          total: "800.00",
        },
      ],
    }),
  ],
};

describe("CashflowPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => PAYLOAD,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading skeleton before the fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<CashflowPanel />);
    expect(
      container.querySelector(".animate-pulse-subtle")
    ).toBeInTheDocument();
  });

  it("renders the four KPI tiles for the latest month by default", async () => {
    render(<CashflowPanel />);

    await waitFor(() => {
      expect(screen.getByText("Income")).toBeInTheDocument();
    });
    expect(screen.getByText("Spending")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Net cash flow")).toBeInTheDocument();

    // Latest month (August, partial) is selected by default.
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
    expect(screen.getByText("$800.00")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
    // Savings rate sub-label: 1200 / 2000 = 60%.
    expect(screen.getByText("60% of income kept")).toBeInTheDocument();
  });

  it("labels the current month as month to date", async () => {
    render(<CashflowPanel />);

    await waitFor(() => {
      expect(
        screen.getByText("Spending — August 2026 (month to date)")
      ).toBeInTheDocument();
    });
  });

  it("switches the KPI and category data when another month is selected", async () => {
    render(<CashflowPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText("Cash flow month")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Cash flow month"), {
      target: { value: "2026-07" },
    });

    expect(screen.getByText("$4,200.00")).toBeInTheDocument();
    expect(screen.getByText("$1,517.67")).toBeInTheDocument();
    expect(screen.getByText("Spending — July 2026")).toBeInTheDocument();

    // July's category chart contains rent, labeled without the primary prefix.
    const charts = screen.getAllByTestId("bar-chart");
    const categoryChart = charts[charts.length - 1];
    const data = JSON.parse(
      categoryChart.getAttribute("data-chart-data") ?? "[]"
    );
    expect(data).toEqual([
      { category: "Rent", total: 1800 },
      { category: "Restaurants", total: 412.33 },
    ]);
  });

  it("shows an empty state when the selected month has no spending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          months: [
            month({
              month: "2026-08",
              partial: true,
              income: "0.00",
              spending: "0.00",
              savings: "0.00",
              netCashFlow: "0.00",
              spendingByCategory: [],
            }),
          ],
        }),
      })
    );

    render(<CashflowPanel />);

    await waitFor(() => {
      expect(
        screen.getByText("No transaction data for this month")
      ).toBeInTheDocument();
    });
  });

  it("renders nothing when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    const { container } = render(<CashflowPanel />);

    await waitFor(() => {
      expect(container.querySelector(".animate-pulse-subtle")).toBeNull();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
