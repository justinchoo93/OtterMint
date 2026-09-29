import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

import { MiniColumns } from "@/components/dashboard/CategoryTrendsCard";
import { TrendsView } from "@/components/dashboard/TrendsView";
import type { CashflowMonth } from "@/lib/cashflow";
import type { RecurringSummary } from "@/lib/recurring";

function monthKeys(from: string, count: number): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

// Oct 2024 to Sep 2026, data from `dataFrom`, September 2026 partial. Income
// 10,000 a month; rent 2,000; restaurants 400, doubling to 800 from Oct 2025.
// Month-to-date figures are 60% of the month.
function buildMonths(dataFrom = "2024-10"): CashflowMonth[] {
  return monthKeys("2024-10", 24).map((month) => {
    const hasData = month >= dataFrom;
    const income = hasData ? 10000 : 0;
    const rent = hasData ? 2000 : 0;
    const food = hasData ? (month >= "2025-10" ? 800 : 400) : 0;
    const spending = rent + food;
    const savings = hasData ? 1000 : 0;
    const cats = (scale: number) =>
      hasData
        ? [
            { key: "RENT_AND_UTILITIES_RENT", primary: "RENT_AND_UTILITIES", total: (rent * scale).toFixed(2) },
            { key: "FOOD_AND_DRINK_RESTAURANTS", primary: "FOOD_AND_DRINK", total: (food * scale).toFixed(2) },
          ]
        : [];
    return {
      month,
      partial: month === "2026-09",
      income: income.toFixed(2),
      spending: spending.toFixed(2),
      savings: savings.toFixed(2),
      netCashFlow: (income - spending).toFixed(2),
      spendingByCategory: cats(1),
      incomeItems: [],
      savingsItems: [],
      toDate: {
        income: (income * 0.6).toFixed(2),
        spending: (spending * 0.6).toFixed(2),
        savings: (savings * 0.6).toFixed(2),
        netCashFlow: ((income - spending) * 0.6).toFixed(2),
        spendingByCategory: cats(0.6),
      },
    };
  });
}

const RECURRING: RecurringSummary = {
  charges: [
    {
      key: "rent payment",
      merchant: "Rent payment",
      cadence: "monthly",
      amount: "2850.00",
      monthlyEquivalent: "2850.00",
      firstDate: "2025-10-01",
      lastDate: "2026-09-01",
      nextExpected: "2026-10-01",
      count: 12,
      varies: null,
      priceChange: null,
      isNew: false,
      categoryKey: "RENT_AND_UTILITIES_RENT",
      accountName: "TOTAL CHECKING",
    },
    {
      key: "netflix",
      merchant: "Netflix",
      cadence: "monthly",
      amount: "17.99",
      monthlyEquivalent: "17.99",
      firstDate: "2025-10-22",
      lastDate: "2026-09-22",
      nextExpected: "2026-10-22",
      count: 12,
      varies: null,
      priceChange: { from: "15.49", to: "17.99", since: "2026-07-22" },
      isNew: false,
      categoryKey: "ENTERTAINMENT_TV_AND_MOVIES",
      accountName: "Sapphire",
    },
  ],
  monthlyTotal: "2867.99",
  yearlyTotal: "34415.88",
  shareOfSpending: 41,
  asOf: "2026-09-26",
};

function stubFetch(options: { months?: CashflowMonth[]; cashflowOk?: boolean; recurringOk?: boolean } = {}) {
  const months = options.months ?? buildMonths();
  const fn = vi.fn(async (url: string) => {
    if (url.startsWith("/api/analytics/recurring")) {
      return options.recurringOk === false ? { ok: false, status: 500 } : { ok: true, json: async () => RECURRING };
    }
    if (url.startsWith("/api/analytics/cashflow")) {
      return options.cashflowOk === false ? { ok: false, status: 500 } : { ok: true, json: async () => ({ months }) };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TrendsView", () => {
  it("fetches cash flow and recurring charges once and opens on 1Y with a comparison", async () => {
    const fetchMock = stubFetch();
    render(<TrendsView />);
    await screen.findByText("72%");

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls.filter((u) => u.startsWith("/api/analytics/cashflow"))).toEqual(["/api/analytics/cashflow?months=24"]);
    expect(urls.filter((u) => u === "/api/analytics/recurring")).toHaveLength(1);

    expect(screen.getByText("Compared with the previous 12 months")).toBeInTheDocument();
    expect(screen.getByText("of income kept · Oct 2025–Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("-4.0 pts")).toBeInTheDocument();
    expect(screen.getByText("vs the previous 12 months")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
  });

  it("re-slices to six months without another cash-flow request", async () => {
    const fetchMock = stubFetch();
    render(<TrendsView />);
    await screen.findByText("72%");
    const before = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "6M" }));
    expect(screen.getByText("of income kept · Apr–Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("Compared with the previous 6 months")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(screen.getAllByTestId("mini-columns")[0].children).toHaveLength(6);
  });

  it("sorts category trends fastest-growing first with one bar per window month", async () => {
    stubFetch();
    render(<TrendsView />);
    await screen.findByText("72%");

    const card = screen.getByRole("region", { name: "Category trends" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Restaurants");
    expect(rows[1]).toHaveTextContent("Rent");
    expect(within(rows[0]).getByTestId("mini-columns").children).toHaveLength(12);
    expect(within(rows[0]).getByText("+107%")).toBeInTheDocument();
    expect(within(card).getByText("vs prior 12 mo")).toBeInTheDocument();
  });

  it("compares this year with last year like for like", async () => {
    stubFetch();
    render(<TrendsView />);
    await screen.findByText("72%");

    const card = screen.getByRole("region", { name: "Year to date" });
    expect(within(card).getByText("2026 so far")).toBeInTheDocument();
    expect(within(card).getByText("Jan–Sep 2026 compared with Jan–Sep 2025")).toBeInTheDocument();
    expect(within(card).getAllByText("vs 2025")).toHaveLength(4);
    expect(within(card).getByText(/2025 is counted through the same day of the month/)).toBeInTheDocument();
  });

  it("shows where history starts instead of comparisons when data begins this year", async () => {
    stubFetch({ months: buildMonths("2026-01") });
    render(<TrendsView />);
    await screen.findByText("72%");

    expect(screen.getAllByText("History starts Jan 2026").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("no earlier months to compare")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Year to date" });
    expect(within(card).queryByText("vs 2025")).toBeNull();
    expect(screen.getByRole("region", { name: "Category trends" })).toHaveTextContent("largest first");
  });

  it("lists recurring charges in order with their notes and totals", async () => {
    stubFetch();
    render(<TrendsView />);
    await screen.findByText("Netflix");

    const card = screen.getByRole("region", { name: "Recurring charges" });
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Rent payment");
    expect(rows[1]).toHaveTextContent("Netflix");
    expect(within(rows[1]).getAllByText("Price up").length).toBeGreaterThanOrEqual(1);
    expect(within(rows[1]).getByText("was $15.49 before Jul 22")).toBeInTheDocument();
    expect(within(card).getByText("$2,868")).toBeInTheDocument();
    expect(within(card).getByText("41%")).toBeInTheDocument();
    expect(within(card).getByText(/2 found/)).toBeInTheDocument();
  });

  it("keeps the cash-flow cards when only the recurring request fails", async () => {
    stubFetch({ recurringOk: false });
    render(<TrendsView />);
    await screen.findByText("72%");
    await waitFor(() =>
      expect(screen.getByText("Recurring charges couldn't load. Try Refresh.")).toBeInTheDocument()
    );
    expect(screen.getByText("of income kept · Oct 2025–Sep 2026")).toBeInTheDocument();
  });

  it("shows the cash-flow error and no cards when that request fails", async () => {
    stubFetch({ cashflowOk: false });
    render(<TrendsView />);
    await screen.findByText("Cash flow couldn't load. Try Refresh.");
    expect(screen.queryByRole("region", { name: "Savings rate" })).toBeNull();
  });

  it("renders only the household placeholder in household mode", () => {
    const fetchMock = stubFetch();
    render(<TrendsView groupId="group-1" />);
    expect(screen.getByText("Household analytics are not available yet.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("MiniColumns", () => {
  it("draws one bar per value on the row's own scale and dims a partial last month", () => {
    render(<MiniColumns values={[1, 4, 2]} partialLast />);
    const bars = Array.from(screen.getByTestId("mini-columns").children) as HTMLElement[];
    expect(bars).toHaveLength(3);
    expect(bars[1].style.height).toBe("100%");
    expect(bars[0].style.height).toBe("25%");
    expect(bars[2].style.opacity).toBe("0.55");
    expect(bars[0].style.opacity).toBe("1");
  });
});
