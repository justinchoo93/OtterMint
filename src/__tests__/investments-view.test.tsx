import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The active-point hook is a real hook here so a test can drive the crosshair
// with `setActivePoints` and have the chart's reporter re-render.
const { activeHolder } = vi.hoisted(() => {
  const listeners = new Set<(points: unknown[] | undefined) => void>();
  const holder = {
    points: undefined as unknown[] | undefined,
    set(points: unknown[] | undefined) {
      holder.points = points;
      listeners.forEach((l) => l(points));
    },
    subscribe(listener: (points: unknown[] | undefined) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { activeHolder: holder };
});

vi.mock("recharts", async () => {
  const ReactModule = await import("react");
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
    ComposedChart: ({ children, data }: { children: React.ReactNode; data?: Array<Record<string, unknown>> }) => (
      <div data-testid="line-chart" data-chart-data={JSON.stringify(data ?? [])}>
        {children}
      </div>
    ),
    CartesianGrid: () => null,
    XAxis: ({ ticks }: { ticks?: number[] }) => <div data-testid="chart-x-axis" data-ticks={JSON.stringify(ticks ?? null)} />,
    YAxis: () => null,
    Tooltip: () => null,
    Area: () => null,
    Line: () => null,
    ReferenceDot: ({ label }: { label?: { value?: string } }) => <div data-testid="end-label">{label?.value}</div>,
    useActiveTooltipDataPoints: () => {
      const [points, setPoints] = ReactModule.useState(activeHolder.points);
      ReactModule.useEffect(() => activeHolder.subscribe(setPoints), []);
      return points;
    },
  };
});

import { InvestmentsView } from "@/components/dashboard/InvestmentsView";
import type { InvestmentsResponse } from "@/lib/investments-model";

function fixture(overrides: Partial<InvestmentsResponse> = {}): InvestmentsResponse {
  const account = (
    accountId: string,
    name: string,
    mask: string,
    institutionName: string,
    balance: string,
    netGain: InvestmentsResponse["accounts"][number]["netGain"],
    start = "40000.00",
    mid = "42000.00"
  ) => ({
    accountId,
    name,
    mask,
    institutionName,
    subtype: "brokerage",
    balance,
    points: [
      { date: "2026-08-15", value: start },
      { date: "2026-09-26", value: mid },
      { date: "2026-09-29", value: balance },
    ],
    netGain,
  });
  return {
    today: "2026-09-29",
    since: "2026-07-01",
    portfolio: {
      points: [
        { date: "2026-07-05", value: "380000.00", segment: 0, quality: "legacy" },
        { date: "2026-07-22", value: "385000.00", segment: 0, quality: "legacy" },
        { date: "2026-07-23", value: "386000.00", segment: 1, quality: "known" },
        { date: "2026-08-14", value: "388000.00", segment: 1, quality: "known" },
        { date: "2026-09-26", value: "390000.00", segment: 1, quality: "known" },
        { date: "2026-09-29", value: "391404.58", segment: 1, quality: "known" },
      ],
      boundaries: [{ date: "2026-07-23" }],
      liveAppended: true,
    },
    accounts: [
      account("acc_6850", "Self-Directed", "6850", "Chase", "312480.42", { mode: "anchored", startDate: "2026-08-15", netContributions: "-2000.00", gain: "14480.42", gainPct: "4.9" }, "300000.00", "310000.00"),
      account("acc_6940", "Self-Directed", "6940", "Chase", "18960.18", { mode: "anchored", startDate: "2026-08-15", netContributions: "5000.00", gain: "460.18", gainPct: "2.5" }, "13500.00", "18500.00"),
      account("acc_5111", "Individual", "5111", "Charles Schwab", "47514.67", { mode: "lifetime", startDate: "2026-04-22", netContributions: "35000.00", gain: "12514.67", gainPct: "35.8" }, "44000.00", "46000.00"),
      account("acc_6093", "Roth IRA", "6093", "Charles Schwab", "12449.31", { mode: "lifetime", startDate: "2026-04-10", netContributions: "17500.14", gain: "-5050.83", gainPct: "-28.9" }, "13000.00", "12400.00"),
    ],
    flows: [
      { date: "2026-08-03", accountId: "acc_6850", kind: "withdrawal", amount: "2000.00" },
      { date: "2026-09-15", accountId: "acc_6940", kind: "deposit", amount: "5000.00" },
    ],
    income: [
      { date: "2026-07-02", accountId: "acc_6850", kind: "dividend", amount: "362.50" },
      { date: "2026-08-12", accountId: "acc_6850", kind: "interest", amount: "41.05" },
      { date: "2026-09-12", accountId: "acc_6850", kind: "interest", amount: "38.12" },
      { date: "2026-09-19", accountId: "acc_6940", kind: "dividend", amount: "104.80" },
      { date: "2026-09-19", accountId: "acc_6093", kind: "dividend", amount: "12.00" },
    ],
    incomeTrailingTwelveMonths: [
      { accountId: "acc_6850", amount: "1200.00" },
      { accountId: "acc_6940", amount: "400.00" },
      { accountId: "acc_5111", amount: "0.00" },
      { accountId: "acc_6093", amount: "24.00" },
    ],
    positions: [
      pos("acc_6850", "Self-Directed", "sec_vti", "VTI", "Vanguard Total Stock Market ETF", "etf", "420.00000000", "312.4000", "131208.00", "112788.00", "298.7000"),
      pos("acc_6850", "Self-Directed", "sec_qqq", "QQQ", "Invesco QQQ Trust", "etf", "60.00000000", "586.3000", "35178.00", "31068.00", "564.2000"),
      pos("acc_6850", "Self-Directed", "sec_aapl_chase", "AAPL", "Apple Inc.", "equity", "100.00000000", "248.1000", "24810.00", "19650.00", "235.4000"),
      pos("acc_6850", "Self-Directed", "sec_cash_6850", null, "Cash", "cash", "121284.42000000", "1.0000", "121284.42", null, null, true),
      pos("acc_6940", "Self-Directed", "sec_schd", "SCHD", "Schwab U.S. Dividend Equity ETF", "etf", "400.00000000", "27.1500", "10860.00", "10220.00", "25.7000"),
      pos("acc_6940", "Self-Directed", "sec_cash_6940", null, "Cash", "cash", "8100.18000000", "1.0000", "8100.18", null, null, true),
      pos("acc_5111", "Individual", "sec_aapl", "AAPL", "Apple Inc.", "equity", "80.00000000", "248.1000", "19848.00", "15856.00", "235.4000"),
      pos("acc_5111", "Individual", "sec_nvda", "NVDA", "NVIDIA Corp.", "equity", "110.00000000", "181.5000", "19965.00", "16940.00", "185.0000"),
      pos("acc_5111", "Individual", "sec_aapl_c", "AAPL261218C00260000", "AAPL Dec 18 2026 260 Call", "derivative", "500.00000000", "12.4000", "6200.00", "7050.00", "14.1000"),
      pos("acc_5111", "Individual", "sec_cash_5111", null, "Cash", "cash", "1501.67000000", "1.0000", "1501.67", null, null, true),
      pos("acc_6093", "Roth IRA", "sec_nvda", "NVDA", "NVIDIA Corp.", "equity", "40.00000000", "181.5000", "7260.00", "6736.00", "185.0000"),
      pos("acc_6093", "Roth IRA", "sec_crwd", "CRWD", "CrowdStrike Holdings", "equity", "10.00000000", "434.2000", "4342.00", "4990.00", null),
      pos("acc_6093", "Roth IRA", "sec_cash_6093", null, "Cash", "cash", "847.31000000", "1.0000", "847.31", null, null, true),
    ],
    activity: ACTIVITY,
    activityTotal: ACTIVITY.length,
    ...overrides,
  };
}

function pos(
  accountId: string,
  accountName: string,
  securityId: string,
  tickerSymbol: string | null,
  name: string,
  securityType: string,
  quantity: string,
  price: string,
  value: string,
  costBasis: string | null,
  startPrice: string | null,
  isCashEquivalent = false
): InvestmentsResponse["positions"][number] {
  return { accountId, accountName, securityId, tickerSymbol, name, securityType, isCashEquivalent, quantity, price, value, costBasis, startPrice, startDate: startPrice ? "2026-08-15" : null };
}

const ACTIVITY: InvestmentsResponse["activity"] = [
  ["2026-09-26", "acc_5111", "buy", "Bought NVDA", "-3564.00", "20", "178.20"],
  ["2026-09-24", "acc_5111", "sell", "Sold to close AAPL call", "2910.00", "-3", "9.70"],
  ["2026-09-19", "acc_6940", "dividend", "SCHD dividend", "104.80", null, null],
  ["2026-09-19", "acc_6093", "dividend", "NVDA dividend", "12.00", null, null],
  ["2026-09-15", "acc_6940", "deposit", "Deposit from Chase checking", "5000.00", null, null],
  ["2026-09-12", "acc_6850", "interest", "Sweep interest", "38.12", null, null],
  ["2026-09-08", "acc_6093", "sell", "Sold CRWD", "6315.00", "-15", "421.00"],
  ["2026-09-02", "acc_6850", "buy", "Bought VTI", "-6162.00", "20", "308.10"],
  ["2026-08-27", "acc_5111", "buy", "Bought to open AAPL call", "-7050.00", "5", "14.10"],
  ["2026-08-22", "acc_6850", "sell", "Sold QQQ", "5724.00", "-10", "572.40"],
  ["2026-08-20", "acc_6850", "split", "CRWD split", "0.00", "23.4", null],
  ["2026-08-14", "acc_6093", "buy", "Bought NVDA", "-5052.00", "30", "168.40"],
  ["2026-08-12", "acc_6850", "interest", "Sweep interest", "41.05", null, null],
  ["2026-08-03", "acc_6850", "withdrawal", "Transfer to Chase checking", "-2000.00", null, null],
  ["2026-07-28", "acc_5111", "sell", "Sold to close NVDA call", "1680.00", "-4", "4.20"],
  ["2026-07-02", "acc_6850", "dividend", "VTI dividend", "362.50", null, null],
].map(([date, accountId, kind, name, amount, quantity, price], index) => ({
  id: 100 - index,
  date: date as string,
  accountId: accountId as string,
  kind: kind as InvestmentsResponse["activity"][number]["kind"],
  name: name as string,
  amount: amount as string,
  quantity: quantity as string | null,
  price: price as string | null,
  securityId: null,
}));

type FetchStub = ReturnType<typeof vi.fn>;

function stubFetch(responder: (url: string) => Promise<Response> | Response): FetchStub {
  const stub = vi.fn((input: RequestInfo | URL) => Promise.resolve(responder(String(input))));
  vi.stubGlobal("fetch", stub);
  return stub;
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function requestedUrls(stub: FetchStub): string[] {
  return stub.mock.calls.map((call) => String(call[0]));
}

/** The hero card; the account tiles repeat its figures, so hero queries stay inside it. */
function hero(): HTMLElement {
  return screen.getByRole("region", { name: "Investments over time" });
}

function findHero(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Investments over time" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  activeHolder.points = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InvestmentsView hero", () => {
  it("requests 90 days by default and shows the live value with its change since the trusted start", async () => {
    const stub = stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    expect(await within(await findHero()).findByText("$391,405")).toBeInTheDocument();
    expect(requestedUrls(stub)).toEqual(["/api/analytics/investments?days=90"]);
    expect(screen.getByText("Portfolio value")).toBeInTheDocument();
    // 391,404.58 − 386,000 = +5,404.58 (+1.4%), measured since the first fingerprinted point.
    expect(within(hero()).getByText("+$5,405 (+1.4%)")).toBeInTheDocument();
    expect(screen.getByText("since Jul 23")).toBeInTheDocument();
    expect(screen.getByTestId("end-label")).toHaveTextContent("$391k");
  });

  it("switches ranges with exactly one new request and dims the page until it lands", async () => {
    let resolveSecond: ((response: Response) => void) | null = null;
    const stub = stubFetch((url) => {
      if (url.includes("days=28")) return new Promise<Response>((resolve) => { resolveSecond = resolve; });
      return ok(fixture());
    });
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    await waitFor(() => expect(requestedUrls(stub)).toEqual(["/api/analytics/investments?days=90", "/api/analytics/investments?days=28"]));
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => {
      resolveSecond!(ok(fixture({ since: "2026-09-01" })));
    });
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(within(hero()).getByText("$391,405")).toBeInTheDocument();
  });

  it("follows the crosshair: the hero shows the hovered value, its change from the stretch start and the full date", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    fireEvent.mouseEnter(screen.getByTestId("investment-chart"));
    act(() => {
      activeHolder.set([{ timestamp: Date.parse("2026-08-14T00:00:00Z"), value: 388000, date: "2026-08-14", segment: 1 }]);
    });
    expect(await within(hero()).findByText("$388,000")).toBeInTheDocument();
    expect(screen.getByText("+$2,000 (+0.5%)")).toBeInTheDocument();
    expect(screen.getByText("Aug 14, 2026")).toBeInTheDocument();
    // A legacy point before the trusted stretch shows its value but no change.
    act(() => {
      activeHolder.set([{ timestamp: Date.parse("2026-07-05T00:00:00Z"), value: 380000, date: "2026-07-05", segment: 0 }]);
    });
    expect(await within(hero()).findByText("$380,000")).toBeInTheDocument();
    expect(within(hero()).queryByText(/\(\+|\(-/)).toBeNull();
    // Recharts keeps its active point after the mouse leaves; the hero must not.
    fireEvent.mouseLeave(screen.getByTestId("investment-chart"));
    expect(await within(hero()).findByText("$391,405")).toBeInTheDocument();
    expect(screen.getByText("since Jul 23")).toBeInTheDocument();
    act(() => {
      activeHolder.set(undefined);
    });
    expect(within(hero()).getByText("$391,405")).toBeInTheDocument();
  });

  it("explains the trusted-history rule and lists account-set changes in the window", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    const details = screen.getByText("About this chart").closest("details")!;
    expect(within(details).getByText(/Before Jul 23, 2026 the set of accounts covered is unknown/)).toBeInTheDocument();
    expect(within(details).getByText("Jul 23 · account set changed")).toBeInTheDocument();
  });

  it("renders the account tiles with lifetime and anchored net-gain lines, All pressed", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    const group = screen.getByRole("group", { name: "Account filter" });
    const tiles = within(group).getAllByRole("button");
    expect(tiles).toHaveLength(5);
    expect(tiles[0]).toHaveAttribute("aria-pressed", "true");
    expect(within(tiles[0]).getByText("4 accounts · 2 with lifetime history")).toBeInTheDocument();
    const individual = tiles.find((t) => within(t).queryByText("····5111"))!;
    expect(within(individual).getByText("Charles Schwab")).toBeInTheDocument();
    expect(within(individual).getByText("Individual")).toBeInTheDocument();
    expect(within(individual).getByText("+$12,515 lifetime on $35,000 in")).toBeInTheDocument();
    expect(within(individual).getByText("····5111")).toBeInTheDocument();
    // 44,000 → 47,514.67 over the window: +3,514.67 (+8.0%).
    expect(within(individual).getByText("+$3,515 (+8.0%)")).toBeInTheDocument();
    const chase = tiles.find((t) => within(t).queryByText("····6850"))!;
    expect(within(chase).getByText("+$14,480 since Aug 15 · earlier history not visible")).toBeInTheDocument();
  });

  it("scopes the whole page to one account without a request", async () => {
    const stub = stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    const group = screen.getByRole("group", { name: "Account filter" });
    const roth = within(group).getAllByRole("button").find((t) => within(t).queryByText("····6093"))!;
    fireEvent.click(roth);
    expect(screen.getByText("Charles Schwab Roth IRA ····6093")).toBeInTheDocument();
    expect(within(hero()).getByText("$12,449")).toBeInTheDocument();
    expect(roth).toHaveAttribute("aria-pressed", "true");
    // 13,000 → 12,449.31: −550.69 (−4.2%), since the account's first snapshot.
    expect(screen.getByText("since Aug 15 · earliest history")).toBeInTheDocument();
    expect(requestedUrls(stub)).toHaveLength(1);
    fireEvent.click(within(group).getByRole("button", { name: /All accounts/ }));
    expect(screen.getByText("Portfolio value")).toBeInTheDocument();
  });

  it("summarizes the range: market gain with its money-weighted return, contributions, income and unrealized gain", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    // Stretch +5,404.58 − net contributions 3,000 = market gain 2,404.58;
    // denominator 386,000 − 2,000 × 57/68 + 5,000 × 14/68 = 385,352.94 → +0.6%.
    const market = screen.getByText("Market gain").parentElement!;
    expect(within(market).getByText("+$2,405")).toBeInTheDocument();
    expect(within(market).getByText("+0.6% return")).toBeInTheDocument();
    expect(within(market).getByText("money-weighted, this range")).toBeInTheDocument();
    const contributions = screen.getByText("Net contributions").parentElement!;
    expect(within(contributions).getByText("+$3,000")).toBeInTheDocument();
    expect(within(contributions).getByText("1 deposit · 1 withdrawal")).toBeInTheDocument();
    const income = screen.getByText("Dividends & interest").parentElement!;
    expect(within(income).getByText("$558.47")).toBeInTheDocument();
    expect(within(income).getByText("$1,624 trailing 12 months")).toBeInTheDocument();
    const unrealized = within(screen.getByRole("group", { name: "Range summary" })).getByText("Unrealized gain").parentElement!;
    expect(within(unrealized).getByText("+$34,373")).toBeInTheDocument();
    expect(within(unrealized).getByText("+15.3% vs cost")).toBeInTheDocument();

    const group = screen.getByRole("group", { name: "Account filter" });
    fireEvent.click(within(group).getAllByRole("button").find((t) => within(t).queryByText("····6093"))!);
    // Roth: 13,000 → 12,449.31 with no flows: −550.69 market gain, −4.2% return.
    expect(within(screen.getByText("Market gain").parentElement!).getByText("-$551")).toBeInTheDocument();
    expect(within(screen.getByText("Market gain").parentElement!).getByText("-4.2% return")).toBeInTheDocument();
    expect(within(screen.getByText("Net contributions").parentElement!).getByText("0 deposits · 0 withdrawals")).toBeInTheDocument();
    expect(within(screen.getByText("Dividends & interest").parentElement!).getByText("$12.00")).toBeInTheDocument();
    expect(within(within(screen.getByRole("group", { name: "Range summary" })).getByText("Unrealized gain").parentElement!).getByText("-$124")).toBeInTheDocument();
    expect(within(within(screen.getByRole("group", { name: "Range summary" })).getByText("Unrealized gain").parentElement!).getByText("-1.1% vs cost")).toBeInTheDocument();
  });

  it("withholds the return for a scope with a single snapshot", async () => {
    const data = fixture();
    data.accounts[1] = { ...data.accounts[1], points: [{ date: "2026-09-29", value: "18960.18" }] };
    stubFetch(() => ok(data));
    render(<InvestmentsView />);
    await within(await findHero()).findByText("$391,405");
    const group = screen.getByRole("group", { name: "Account filter" });
    fireEvent.click(within(group).getAllByRole("button").find((t) => within(t).queryByText("····6940"))!);
    expect(within(screen.getByText("Market gain").parentElement!).getByText("needs two days of history")).toBeInTheDocument();
    expect(screen.getByText("Not enough history in this range. Try a longer range.")).toBeInTheDocument();
  });

  it("lists holdings by value with cash last, merged across accounts, options in contracts", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await findHero();
    const rows = screen.getAllByTestId("holding-row");
    expect(rows.map((r) => within(r).getAllByText(/^(VTI|QQQ|AAPL|NVDA|SCHD|CRWD|Cash|AAPL \$260 call)$/)[0].textContent)).toEqual([
      "VTI", "AAPL", "QQQ", "NVDA", "SCHD", "AAPL $260 call", "CRWD", "Cash",
    ]);
    const aapl = rows[1];
    expect(within(aapl).getByText("2 accounts")).toBeInTheDocument();
    expect(within(aapl).getByText("180")).toBeInTheDocument();
    expect(within(aapl).getByText("$44,658.00")).toBeInTheDocument();
    expect(within(aapl).getByText("11.4%")).toBeInTheDocument();
    expect(within(aapl).getByText("+$9,152")).toBeInTheDocument();
    expect(within(aapl).getByText("+25.8%")).toBeInTheDocument();
    const option = rows[5];
    expect(within(option).getAllByText("5 contracts").length).toBeGreaterThan(0);
    expect(within(option).getByText("Expires Dec 18, 2026")).toBeInTheDocument();
    expect(within(option).getByText("-$850")).toBeInTheDocument();
    const crwd = rows[6];
    expect(within(crwd).getAllByText("—").length).toBeGreaterThan(0); // no price history, no basis
    const cash = rows[7];
    expect(within(cash).getByText("Money market sweep")).toBeInTheDocument();
    expect(within(cash).getAllByText("4 accounts").length).toBeGreaterThan(0);
    expect(screen.getByText("7 positions and cash across 4 accounts · sorted by value")).toBeInTheDocument();
    expect(screen.getByText("3M change")).toBeInTheDocument();
    // Footer totals: every position's value, and the unrealized gain over positions with a basis.
    expect(screen.getByText("$391,404.58")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Holdings" })).getByText("+$34,373")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(await screen.findByText("1M change")).toBeInTheDocument();
  });

  it("filters holdings by type pill and by search, and drops the account column when scoped", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await findHero();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getAllByTestId("holding-row")).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("group", { name: "Security type" })).getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Search holdings"), { target: { value: "aapl" } });
    expect(screen.getAllByTestId("holding-row")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Search holdings"), { target: { value: "" } });
    expect(screen.getAllByTestId("holding-row")).toHaveLength(8);
    expect(screen.getByText("Account")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Account filter" });
    fireEvent.click(within(group).getAllByRole("button").find((t) => within(t).queryByText("····5111"))!);
    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.getAllByTestId("holding-row")).toHaveLength(4);
    expect(screen.getByText("3 positions and cash in Charles Schwab ····5111 · sorted by value")).toBeInTheDocument();
  });

  it("shows the allocation by security type with shares that sum to the whole", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await findHero();
    const allocation = screen.getByRole("region", { name: "Allocation" });
    const items = within(allocation).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "ETFs×3$177,24645.3%",
      "Single stocks×3$76,22519.5%",
      "Options×1$6,2001.6%",
      "Cash$131,73433.7%",
    ]);
    expect(within(allocation).getByText("By security type · $391,405 total")).toBeInTheDocument();
  });

  it("shows the newest eight activity rows, expands to all, and scopes with the tiles", async () => {
    stubFetch(() => ok(fixture()));
    render(<InvestmentsView />);
    await findHero();
    expect(screen.getAllByTestId("activity-row")).toHaveLength(8);
    const first = screen.getAllByTestId("activity-row")[0];
    expect(within(first).getByText("Bought NVDA")).toBeInTheDocument();
    expect(within(first).getByText("-$3,564.00")).toBeInTheDocument();
    expect(within(first).getByText(/20 shares at \$178\.20 · Charles Schwab ····5111/)).toBeInTheDocument();
    expect(within(screen.getAllByTestId("activity-row")[2]).getByText("+$104.80")).toBeInTheDocument();
    expect(screen.getByText("Showing 8 of 16 · newest first")).toBeInTheDocument();
    expect(screen.getByText("Past 3 months · 16 events across all accounts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 16" }));
    expect(screen.getAllByTestId("activity-row")).toHaveLength(16);
    expect(screen.getByText("Showing all 16 · newest first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Account filter" });
    fireEvent.click(within(group).getAllByRole("button").find((t) => within(t).queryByText("····6093"))!);
    const rothRows = screen.getAllByTestId("activity-row");
    expect(rothRows).toHaveLength(3);
    expect(within(rothRows[0]).getByText("NVDA dividend")).toBeInTheDocument();
    expect(within(rothRows[0]).queryByText(/Charles Schwab/)).toBeNull();
    expect(screen.getByText("Showing all 3 · newest first")).toBeInTheDocument();
    expect(screen.getByText("Past 3 months · 3 events in this account")).toBeInTheDocument();
  });

  it("prompts to connect an account when there are none", async () => {
    stubFetch(() => ok(fixture({ accounts: [], positions: [], activity: [], activityTotal: 0, flows: [], income: [] })));
    render(<InvestmentsView />);
    expect(await screen.findByText("Connect an investment account to see performance.")).toBeInTheDocument();
  });

  it("shows the error line when the request fails", async () => {
    stubFetch(() => new Response("nope", { status: 500 }));
    render(<InvestmentsView />);
    expect(await screen.findByText("Investments couldn't load. Try Refresh.")).toBeInTheDocument();
  });
});
