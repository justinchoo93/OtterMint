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

import { AnalyticsView } from "@/components/dashboard/AnalyticsView";
import type { CashflowMonth } from "@/lib/cashflow";

function monthKeys(from: string, count: number): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

// Oct 2024 to Sep 2026; data starts Jan 2026 like production; May has a net withdrawal.
function buildMonths(): CashflowMonth[] {
  return monthKeys("2024-10", 24).map((month) => {
    const hasData = month >= "2026-01";
    const index = Number(month.slice(5, 7));
    const income = hasData ? 9000 + index * 100 : 0;
    const spending = hasData ? 6000 + index * 10 : 0;
    const savings = hasData ? (month === "2026-05" ? -800 : 1500) : 0;
    return {
      month,
      partial: month === "2026-09",
      income: income.toFixed(2),
      spending: spending.toFixed(2),
      savings: savings.toFixed(2),
      netCashFlow: (income - spending).toFixed(2),
      spendingByCategory: hasData
        ? [
            { key: "RENT_AND_UTILITIES_RENT", primary: "RENT_AND_UTILITIES", total: "1800.00" },
            { key: "FOOD_AND_DRINK_RESTAURANTS", primary: "FOOD_AND_DRINK", total: (spending - 1800).toFixed(2) },
          ]
        : [],
      incomeItems: hasData
        ? [{ date: `${month}-15`, amount: income.toFixed(2), name: `PAYROLL ${month}`, merchantName: null, categoryKey: "INCOME_WAGES", accountName: "TOTAL CHECKING" }]
        : [],
      savingsItems: hasData
        ? [{ date: `${month}-16`, amount: savings.toFixed(2), name: `BROKERAGE ${month}`, merchantName: null, categoryKey: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", accountName: "TOTAL CHECKING" }]
        : [],
    };
  });
}

const HISTORY = { snapshots: [], coverageEvents: [], periodChange: null };
const ITEMS = {
  count: 2,
  total: "96.40",
  items: [
    { date: "2026-09-21", amount: "58.20", name: "DIN TAI FUNG", merchantName: "Din Tai Fung", categoryKey: "FOOD_AND_DRINK_RESTAURANTS", accountName: "Sapphire" },
    { date: "2026-09-12", amount: "38.20", name: "TACOS EL SOL", merchantName: null, categoryKey: "FOOD_AND_DRINK_RESTAURANTS", accountName: "Sapphire" },
  ],
};

function stubFetch(options: { months?: CashflowMonth[]; cashflowOk?: boolean } = {}) {
  const months = options.months ?? buildMonths();
  const fn = vi.fn(async (url: string) => {
    if (url.startsWith("/api/analytics/cashflow/items")) return { ok: true, json: async () => ITEMS };
    if (url.startsWith("/api/analytics/cashflow")) {
      return options.cashflowOk === false ? { ok: false, status: 500 } : { ok: true, json: async () => ({ months }) };
    }
    if (url.includes("/net-worth")) return { ok: true, json: async () => HISTORY };
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const calls = (fn: ReturnType<typeof stubFetch>, prefix: string) =>
  fn.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith(prefix));

function monthColumns() {
  return screen.getAllByRole("button", { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/ });
}

function tile(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

async function renderView(props: Partial<React.ComponentProps<typeof AnalyticsView>> = {}) {
  render(<AnalyticsView accounts={[]} manualAccounts={[]} {...props} />);
  if (!props.groupId) await screen.findByText("Where it went");
}

describe("AnalyticsView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens on 6M: six month columns, one cash-flow fetch, and no comparison before history starts", async () => {
    const fetchMock = stubFetch();
    await renderView();
    expect(monthColumns().map((b) => b.getAttribute("aria-label")!.split(":")[0])).toEqual([
      "April 2026",
      "May 2026",
      "June 2026",
      "July 2026",
      "August 2026",
      "September 2026 (month to date)",
    ]);
    expect(calls(fetchMock, "/api/analytics/cashflow")).toEqual(["/api/analytics/cashflow?months=24"]);
    expect(calls(fetchMock, "/api/net-worth")).toEqual(["/api/net-worth?days=178"]);
    expect(screen.getByText("History starts Jan 2026")).toBeInTheDocument();
    expect(screen.queryByText(/vs prior/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to 3M without refetching cash flow and compares with the three months before", async () => {
    const fetchMock = stubFetch();
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "3M" }));

    expect(monthColumns()).toHaveLength(3);
    expect(screen.getByText("Compared with the previous 3 months")).toBeInTheDocument();
    expect(screen.getAllByText("vs prior 3 mo")).toHaveLength(4);
    await waitFor(() => expect(calls(fetchMock, "/api/net-worth")).toContain("/api/net-worth?days=87"));
    expect(calls(fetchMock, "/api/analytics/cashflow")).toHaveLength(1);
  });

  it("scopes the tiles to a clicked month and clears it from the chip", async () => {
    stubFetch();
    await renderView();
    const august = monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("August 2026"))!;
    fireEvent.click(august);

    expect(august).toHaveAttribute("aria-pressed", "true");
    expect(within(tile("Income")).getByText("$9,800")).toBeInTheDocument();
    expect(screen.getByText("Compared with July 2026")).toBeInTheDocument();
    expect(screen.getAllByText("vs Jul")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Clear month: August 2026" }));
    expect(screen.queryByRole("button", { name: /Clear month/ })).not.toBeInTheDocument();
    expect(screen.getByText("History starts Jan 2026")).toBeInTheDocument();
  });

  it("renders a month with a net withdrawal from savings", async () => {
    stubFetch();
    await renderView();
    const may = monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("May 2026"))!;
    expect(may.getAttribute("aria-label")).toContain("saved -$800");
  });

  it("ranks categories and keeps Income and Saved tiles as toggles", async () => {
    stubFetch();
    await renderView();
    expect(screen.getByRole("button", { name: /^Rent/ })).toBeInTheDocument();
    fireEvent.click(tile("Income"));
    expect(tile("Income")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(tile("Income"));
    expect(tile("Income")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows only net worth and a placeholder for households, never requesting cash flow", async () => {
    const fetchMock = stubFetch();
    await renderView({ groupId: "group-1" });
    expect(await screen.findByText("Household spending analytics are not available yet.")).toBeInTheDocument();
    await waitFor(() => expect(calls(fetchMock, "/api/groups/group-1/net-worth")).toHaveLength(1));
    expect(calls(fetchMock, "/api/analytics")).toHaveLength(0);
  });

  it("shows an error card when cash flow fails to load", async () => {
    stubFetch({ cashflowOk: false });
    render(<AnalyticsView accounts={[]} manualAccounts={[]} />);
    expect(await screen.findByText("Cash flow couldn't load. Try Refresh.")).toBeInTheDocument();
  });

  it("shows an empty state before any transactions exist", async () => {
    stubFetch({ months: buildMonths().map((m) => ({ ...m, income: "0.00", spending: "0.00", savings: "0.00", spendingByCategory: [] })) });
    render(<AnalyticsView accounts={[]} manualAccounts={[]} />);
    expect(await screen.findByText("No transactions yet. Connect an account and refresh to sync.")).toBeInTheDocument();
  });
});
