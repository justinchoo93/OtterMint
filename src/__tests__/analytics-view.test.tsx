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
        ? [{ id: 1, date: `${month}-15`, amount: income.toFixed(2), name: `PAYROLL ${month}`, merchantName: null, categoryKey: "INCOME_WAGES", accountName: "TOTAL CHECKING" }]
        : [],
      savingsItems: hasData
        ? [{ id: 2, date: `${month}-16`, amount: savings.toFixed(2), name: `BROKERAGE ${month}`, merchantName: null, categoryKey: "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", accountName: "TOTAL CHECKING" }]
        : [],
    };
  });
}

const HISTORY = { snapshots: [], coverageEvents: [], periodChange: null };
const ITEMS = {
  count: 2,
  total: "96.40",
  items: [
    { id: 21, date: "2026-09-21", amount: "58.20", name: "DIN TAI FUNG", merchantName: "Din Tai Fung", categoryKey: "FOOD_AND_DRINK_RESTAURANTS", accountName: "Sapphire" },
    { id: 12, date: "2026-09-12", amount: "38.20", name: "TACOS EL SOL", merchantName: null, categoryKey: "FOOD_AND_DRINK_RESTAURANTS", accountName: "Sapphire" },
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
  // The chart's columns only: the period button and the picker's cells also carry month names.
  return screen
    .getAllByRole("button", { name: /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/ })
    .filter((b) => b.hasAttribute("data-month") && !b.closest('[role="dialog"]'));
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
    expect(calls(fetchMock, "/api/analytics/cashflow")).toEqual(["/api/analytics/cashflow?months=60"]);
    // 178 days back to April 1, plus a week so the previous close is the baseline.
    expect(calls(fetchMock, "/api/net-worth")).toEqual(["/api/net-worth?days=185"]);
    expect(screen.getByTestId("period-button")).toHaveTextContent("Apr–Sep 2026");
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
    await waitFor(() => expect(calls(fetchMock, "/api/net-worth")).toContain("/api/net-worth?days=94"));
    expect(calls(fetchMock, "/api/analytics/cashflow")).toHaveLength(1);
  });

  it("makes a clicked month the period, steps with the arrows, and returns to a range", async () => {
    stubFetch();
    await renderView();
    fireEvent.click(monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("August 2026"))!);

    // Six months of context ending at the month, with the month highlighted.
    const columns = monthColumns();
    expect(columns.map((b) => b.getAttribute("aria-label")!.split(":")[0])).toEqual([
      "March 2026", "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    ]);
    expect(columns.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false", "false", "true"]);
    expect(screen.getByTestId("period-button")).toHaveTextContent("August 2026");
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "false");
    expect(within(tile("Income")).getByText("$9,800")).toBeInTheDocument();
    expect(screen.getByText("Compared with July 2026")).toBeInTheDocument();
    expect(screen.getAllByText("vs Jul")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Clear month/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByTestId("period-button")).toHaveTextContent("July 2026");
    expect(within(tile("Income")).getByText("$9,700")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByTestId("period-button")).toHaveTextContent("Sep 1–26, 2026");
    expect(screen.getByRole("button", { name: "MTD" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "6M" }));
    expect(screen.getByText("History starts Jan 2026")).toBeInTheDocument();
    expect(monthColumns().every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("compares month to date with the same days of the month before", async () => {
    const months = buildMonths().map((m) =>
      m.month === "2026-08"
        ? { ...m, toDate: { income: "4900.00", spending: "3000.00", savings: "700.00", netCashFlow: "1900.00", spendingByCategory: [] } }
        : m
    );
    stubFetch({ months });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "MTD" }));
    expect(screen.getByText("Compared with August 1–26")).toBeInTheDocument();
    expect(screen.getAllByText("vs Aug 1–26")).toHaveLength(4);
    // September income 9,900 against 4,900 through August 26, not August's whole 9,800.
    expect(within(tile("Income")).getByText(/\+102\.0%/)).toBeInTheDocument();
    expect(monthColumns()).toHaveLength(6);
  });

  it("selects a month, a drag range and a whole year from the picker without refetching cash flow", async () => {
    const fetchMock = stubFetch();
    await renderView();
    fireEvent.click(screen.getByTestId("period-button"));
    fireEvent.click(screen.getByRole("button", { name: "February 2026" }));
    expect(screen.getByTestId("period-button")).toHaveTextContent("February 2026");
    expect(within(tile("Income")).getByText("$9,200")).toBeInTheDocument();
    // History starts in January, so months before it cannot be picked.
    fireEvent.click(screen.getByTestId("period-button"));
    expect(screen.getByRole("button", { name: "Earlier year" })).toBeDisabled();

    const june = screen.getByRole("button", { name: "June 2026" });
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => june);
    fireEvent.pointerDown(screen.getByRole("button", { name: "March 2026" }));
    fireEvent.pointerMove(screen.getByTestId("month-grid"));
    fireEvent.pointerUp(screen.getByRole("dialog"));
    document.elementFromPoint = original;
    expect(screen.getByTestId("period-button")).toHaveTextContent("Mar–Jun 2026");
    expect(monthColumns()).toHaveLength(4);
    expect(screen.getByText("History starts Jan 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("period-button"));
    fireEvent.click(screen.getByRole("button", { name: "All of 2026" }));
    expect(screen.getByRole("button", { name: "YTD" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("period-button")).toHaveTextContent("Jan 1–Sep 26, 2026");
    expect(calls(fetchMock, "/api/analytics/cashflow")).toHaveLength(1);
  });

  it("asks for net worth through a past month's end and shows that day's figures", async () => {
    const row = (date: string, value: number) => ({ date, totalAssets: (value + 50).toFixed(2), totalLiabilities: "50.00", netWorth: value.toFixed(2), depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null, manualAssetsTotal: null, manualLiabilitiesTotal: null, adjustedTotalAssets: (value + 50).toFixed(2), adjustedTotalLiabilities: "50.00", adjustedNetWorth: value.toFixed(2), quality: "observed", coverageSegment: 0, comparisonSegment: 0 });
    const history = { snapshots: [row("2026-07-31", 1000), row("2026-08-15", 1200), row("2026-08-31", 1777), row("2026-09-20", 9000)], coverageEvents: [], periodChange: null };
    const fn = vi.fn(async (url: string) => {
      if (url.startsWith("/api/analytics/cashflow")) return { ok: true, json: async () => ({ months: buildMonths() }) };
      return { ok: true, json: async () => history };
    });
    vi.stubGlobal("fetch", fn);
    await renderView();
    expect(screen.getByText("Net worth")).toBeInTheDocument();

    fireEvent.click(monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("August 2026"))!);
    // August 1 is 56 days before September 26, plus the baseline week.
    await waitFor(() => expect(calls(fn as never, "/api/net-worth")).toContain("/api/net-worth?days=63"));
    expect(await screen.findByText("Net worth at the end of Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("$1,777")).toBeInTheDocument();
    expect(screen.getByText("+$777 (+77.7%)")).toBeInTheDocument();
    expect(screen.getByText("Jul 31–Aug 31")).toBeInTheDocument();
    expect(screen.queryByText("$9,000")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("Net worth at the end of Jun 2026")).toBeInTheDocument();
    expect(await screen.findByText("No net worth history for this period.")).toBeInTheDocument();
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

  it("opens the Income details from the tile and closes them again", async () => {
    stubFetch();
    await renderView();
    expect(screen.getByText("Select a stat or a category to see the transactions behind it.")).toBeInTheDocument();

    fireEvent.click(tile("Income"));
    const panel = screen.getByRole("region", { name: "Income details" });
    expect(within(panel).getByRole("heading", { name: "Income" })).toBeInTheDocument();
    expect(within(panel).getByText("PAYROLL 2026-09")).toBeInTheDocument();
    expect(within(panel).getByText("PAYROLL 2026-04")).toBeInTheDocument();
    expect(within(panel).queryByText("PAYROLL 2026-03")).not.toBeInTheDocument();
    expect(within(panel).getByText("6 transactions")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("region", { name: "Income details" })).not.toBeInTheDocument();
    expect(tile("Income")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows savings withdrawals as negative amounts", async () => {
    stubFetch();
    await renderView();
    fireEvent.click(tile("Saved"));
    const panel = screen.getByRole("region", { name: "Saved details" });
    expect(within(panel).getByText("-$800.00")).toBeInTheDocument();
  });

  it("lists a category's transactions from the items route", async () => {
    const fetchMock = stubFetch();
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Restaurants/ }));
    const panel = screen.getByRole("region", { name: "Restaurants details" });
    expect(await within(panel).findByText("Din Tai Fung")).toBeInTheDocument();
    expect(within(panel).getByText("TACOS EL SOL")).toBeInTheDocument();
    expect(within(panel).getByText("2 transactions")).toBeInTheDocument();
    expect(calls(fetchMock, "/api/analytics/cashflow/items")).toEqual([
      "/api/analytics/cashflow/items?from=2026-04&to=2026-09&flow=spending&sort=date&limit=200&category=FOOD_AND_DRINK_RESTAURANTS",
    ]);
  });

  it("asks for Other as everything except the ranked rows", async () => {
    const extra = ["TRAVEL_FLIGHTS", "BANK_FEES_ATM_FEES", "MEDICAL_DENTAL_CARE", "ENTERTAINMENT_MUSIC_AND_AUDIO", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "GENERAL_SERVICES_INSURANCE", "TRANSPORTATION_GAS", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES"];
    const months = buildMonths().map((m) =>
      m.spendingByCategory.length === 0
        ? m
        : { ...m, spendingByCategory: [...m.spendingByCategory, ...extra.map((key, i) => ({ key, primary: key.split("_")[0], total: (100 - i * 10).toFixed(2) }))] }
    );
    const fetchMock = stubFetch({ months });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Other · 2 categories/ }));
    await screen.findByRole("region", { name: "Other details" });
    const url = calls(fetchMock, "/api/analytics/cashflow/items")[0];
    // The eight ranked keys are excluded; the two smallest of the ten remain.
    expect(url.match(/exclude=/g)).toHaveLength(8);
    expect(url).toContain("exclude=RENT_AND_UTILITIES_RENT");
    expect(url).not.toContain("category=");
    expect(url).not.toContain("TRANSPORTATION_GAS");
  });

  it("shows the largest purchases for the Spending tile", async () => {
    const fetchMock = stubFetch();
    await renderView();
    fireEvent.click(tile("Spending"));
    expect(await screen.findByRole("heading", { name: "Largest purchases" })).toBeInTheDocument();
    expect(calls(fetchMock, "/api/analytics/cashflow/items")[0]).toBe(
      "/api/analytics/cashflow/items?from=2026-04&to=2026-09&flow=spending&sort=amount&limit=25"
    );
  });

  it("shows one row per month for Net cash flow and closes on a range change", async () => {
    stubFetch();
    await renderView();
    fireEvent.click(tile("Net cash flow"));
    const panel = screen.getByRole("region", { name: "Net cash flow details" });
    expect(within(panel).getAllByRole("row")).toHaveLength(7); // header + six months
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.queryByRole("region", { name: "Net cash flow details" })).not.toBeInTheDocument();
  });

  it("returns focus to the tile when its details close", async () => {
    stubFetch();
    await renderView();
    fireEvent.click(tile("Income"));
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(document.activeElement).toBe(tile("Income"));
  });

  it("labels total inflows above the bar, including a withdrawal from savings", async () => {
    stubFetch();
    await renderView();
    fireEvent.click(monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("May 2026"))!);
    expect(screen.getByText("+$10,300")).toBeInTheDocument(); // income 9,500 + withdrawal 800
  });

  it("still lists a category that a selected month folds into Other", async () => {
    const ten = ["RENT_AND_UTILITIES_RENT", "FOOD_AND_DRINK_RESTAURANTS", "FOOD_AND_DRINK_GROCERIES", "TRANSPORTATION_GAS", "ENTERTAINMENT_MUSIC_AND_AUDIO", "GENERAL_SERVICES_INSURANCE", "MEDICAL_DENTAL_CARE", "TRAVEL_FLIGHTS", "BANK_FEES_ATM_FEES", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"];
    const months = buildMonths().map((m) => {
      if (m.spendingByCategory.length === 0) return m;
      // Flights ranks first over the six months but is tiny (10th, folded) in August.
      const flights = m.month === "2026-08" ? 5 : 1500;
      return { ...m, spendingByCategory: ten.map((key, i) => ({ key, primary: key.split("_")[0], total: (key === "TRAVEL_FLIGHTS" ? flights : 1000 - i * 60).toFixed(2) })) };
    });
    const fetchMock = stubFetch({ months });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Flights/ }));
    fireEvent.click(monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("August 2026"))!);
    const panel = screen.getByRole("region", { name: "Flights details" });
    expect(within(panel).queryByText("No transactions in this period.")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calls(fetchMock, "/api/analytics/cashflow/items")).toContain(
        "/api/analytics/cashflow/items?from=2026-08&to=2026-08&flow=spending&sort=date&limit=200&category=TRAVEL_FLIGHTS"
      )
    );
  });

  it("refetches an open list after a refresh", async () => {
    const fetchMock = stubFetch();
    const { rerender } = render(<AnalyticsView accounts={[]} manualAccounts={[]} refreshKey={0} />);
    await screen.findByText("Where it went");
    fireEvent.click(screen.getByRole("button", { name: /^Restaurants/ }));
    await waitFor(() => expect(calls(fetchMock, "/api/analytics/cashflow/items")).toHaveLength(1));
    rerender(<AnalyticsView accounts={[]} manualAccounts={[]} refreshKey={1} />);
    await waitFor(() => expect(calls(fetchMock, "/api/analytics/cashflow/items")).toHaveLength(2));
  });

  it("falls back to six months when a refresh moves the selected month out of the data", async () => {
    let months = buildMonths();
    const fn = vi.fn(async (url: string) => {
      if (url.startsWith("/api/analytics/cashflow")) return { ok: true, json: async () => ({ months }) };
      return { ok: true, json: async () => HISTORY };
    });
    vi.stubGlobal("fetch", fn);
    const { rerender } = render(<AnalyticsView accounts={[]} manualAccounts={[]} refreshKey={0} />);
    await screen.findByText("Where it went");
    fireEvent.click(monthColumns().find((b) => b.getAttribute("aria-label")!.startsWith("July 2026"))!);
    expect(screen.getByTestId("period-button")).toHaveTextContent("July 2026");

    // After a refresh the data starts in August, so July no longer has anything to show.
    months = buildMonths().map((m) => (m.month < "2026-08" ? { ...m, income: "0.00", spending: "0.00", savings: "0.00", netCashFlow: "0.00", spendingByCategory: [], incomeItems: [], savingsItems: [] } : m));
    rerender(<AnalyticsView accounts={[]} manualAccounts={[]} refreshKey={1} />);
    await waitFor(() => expect(screen.getByTestId("period-button")).toHaveTextContent("Aug–Sep 2026"));
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "false");
    expect(monthColumns()).toHaveLength(2);
  });

  it("never shows one scope's net-worth change under the other's heading", async () => {
    const personal = {
      snapshots: [
        { date: "2026-09-01", totalAssets: "100.00", totalLiabilities: "0.00", netWorth: "100.00", depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null, manualAssetsTotal: null, manualLiabilitiesTotal: null, adjustedTotalAssets: "100.00", adjustedTotalLiabilities: "0.00", adjustedNetWorth: "100.00", quality: "observed", coverageSegment: 0, comparisonSegment: 0 },
        { date: "2026-09-20", totalAssets: "150.00", totalLiabilities: "0.00", netWorth: "150.00", depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null, manualAssetsTotal: null, manualLiabilitiesTotal: null, adjustedTotalAssets: "150.00", adjustedTotalLiabilities: "0.00", adjustedNetWorth: "150.00", quality: "observed", coverageSegment: 0, comparisonSegment: 0 },
      ],
      coverageEvents: [],
      periodChange: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/groups/")) return new Promise(() => {}); // household history never arrives
        if (url.startsWith("/api/analytics/cashflow")) return Promise.resolve({ ok: true, json: async () => ({ months: buildMonths() }) });
        return Promise.resolve({ ok: true, json: async () => personal });
      })
    );
    const { rerender } = render(<AnalyticsView accounts={[]} manualAccounts={[]} />);
    expect(await screen.findByText("since Sep 1")).toBeInTheDocument();
    rerender(<AnalyticsView accounts={[]} manualAccounts={[]} groupId="group-1" />);
    expect(screen.getAllByText("Household net worth").length).toBeGreaterThan(0);
    expect(screen.queryByText("since Sep 1")).not.toBeInTheDocument();
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
