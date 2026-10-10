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

import { FireView } from "@/components/fire/FireView";
import { DEFAULT_ASSUMPTIONS, type FirePlan, type FireResponse } from "@/lib/fire-model";

// The approved mock's sample household; its headline is Jul 2033.
const SAVED_PLAN: FirePlan = {
  version: 1,
  assumptions: {
    ...DEFAULT_ASSUMPTIONS,
    yourAge: 35,
    partnerAge: 34,
    partnerTakeHomeMonthly: 6000,
    pensionOwner: "partner",
    pensionSalaryYearly: 95000,
    pensionServiceYears: 6,
    ssYouMonthly: 2400,
    ssPartnerMonthly: 1800,
    rothBasisYou: 5000,
    rothBasisPartner: 15000,
  },
  appAccounts: { "manual:1": { contributionYearly: 24500 } },
  typedAccounts: [
    { id: "river", name: "River", owner: "you", kind: "crypto", balance: 15000, contributionYearly: 0 },
    { id: "roth-p", name: "Roth IRA", owner: "partner", kind: "roth", balance: 20000, contributionYearly: 0 },
    { id: "k457", name: "457(b)", owner: "partner", kind: "k457", balance: 60000, contributionYearly: 24500 },
    { id: "pers3", name: "PERS 3 investment account", owner: "partner", kind: "pers3", balance: 60000, contributionYearly: 9500 },
  ],
};

function response(plan: FirePlan | null): FireResponse {
  return {
    asOf: "2026-10-09",
    cashflow: { takeHomeMonthly: 15000, spendingMonthly: 7500, cashSavedYearly: 90000, monthsCounted: 12, firstMonth: "2025-10", lastMonth: "2026-09" },
    accounts: [
      { key: "plaid:brk", name: "Brokerage", detail: "Chase ····6850", source: "plaid", balance: 450000, suggestedKind: "brokerage" },
      { key: "plaid:roth", name: "Roth IRA", detail: "Schwab ····6093", source: "plaid", balance: 7000, suggestedKind: "roth" },
      { key: "manual:1", name: "401(k)", detail: "Manual account", source: "manual", balance: 150000, suggestedKind: "k401" },
      { key: "plaid:chk", name: "Checking", detail: "Chase ····9701", source: "plaid", balance: 9000, suggestedKind: "excluded" },
    ],
    plan,
    savedAt: plan ? "2026-10-09T17:00:00.000Z" : null,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function serve(plan: FirePlan | null) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return new Response(JSON.stringify({ plan: JSON.parse(String(init.body)), savedAt: "2026-10-09T18:00:00.000Z" }), { status: 200 });
    }
    return new Response(JSON.stringify(response(plan)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function headline() {
  return screen.getByTestId("fire-headline").textContent;
}

function lever(label: string) {
  const tile = screen.getByText(label).parentElement as HTMLElement;
  return tile.children[1].textContent;
}

beforeEach(() => serve(SAVED_PLAN));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FireView", () => {
  it("shows a skeleton, then the earliest date", async () => {
    render(<FireView />);
    expect(screen.getByTestId("fire-skeleton")).toBeInTheDocument();
    await waitFor(() => expect(headline()).toBe("Jul 2033"));
    expect(screen.getByText("In 6 years 9 months · you 41½, partner 40½")).toBeInTheDocument();
    expect(screen.getByTestId("fire-status")).toHaveTextContent(/^Lasts to 95 · \$\d+k left$/);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByText("You both retire")).toBeInTheDocument();
  });

  it("moves the date when spending changes, as the first lever predicted, and saves the change", async () => {
    render(<FireView />);
    await waitFor(() => expect(headline()).toBe("Jul 2033"));
    const predicted = lever("Spend $500/mo less");
    fireEvent.change(screen.getByLabelText("Monthly spending"), { target: { value: "7000" } });
    expect(headline()).toBe(predicted);
    await waitFor(
      () => {
        const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
        expect(put).toBeDefined();
        expect(JSON.parse(String((put![1] as RequestInit).body)).assumptions.spendingMonthly).toBe(7000);
      },
      { timeout: 3000 }
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });

  it("adds a typed account that moves the date, and never lists it as an OtterMint account", async () => {
    render(<FireView />);
    await waitFor(() => expect(headline()).toBe("Jul 2033"));
    expect(screen.getAllByTestId("fire-typed-account")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Add an account" }));
    const rows = screen.getAllByTestId("fire-typed-account");
    expect(rows).toHaveLength(5);
    expect(screen.getAllByTestId("fire-app-account")).toHaveLength(4);
    fireEvent.change(within(rows[4]).getByLabelText("New account balance"), { target: { value: "500000" } });
    expect(headline()).not.toBe("Jul 2033");
  });

  it("flags a date that is too early", async () => {
    render(<FireView />);
    await waitFor(() => expect(headline()).toBe("Jul 2033"));
    fireEvent.change(screen.getByLabelText("Try retiring at"), { target: { value: "38" } });
    expect(screen.getByTestId("fire-status")).toHaveTextContent(/^Short at \d+: open accounts run dry before the rest unlock$/);
    expect(headline()).toBe("Jul 2033");
    fireEvent.click(screen.getByRole("button", { name: "Back to earliest" }));
    expect(screen.getByTestId("fire-status")).toHaveTextContent(/^Lasts to 95/);
  });

  it("invites a first-time owner to start and says nothing is saved yet", async () => {
    serve(null);
    render(<FireView />);
    await waitFor(() => expect(screen.getByText(/Start with your ages and the accounts OtterMint can't see/)).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    expect(screen.queryAllByTestId("fire-typed-account")).toHaveLength(0);
    // OtterMint's own figures fill spending until the owner changes it.
    expect(screen.getByLabelText("Monthly spending")).toHaveValue("7500");
  });

  it("says when the plan cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<FireView />);
    await waitFor(() => expect(screen.getByText("The FIRE plan couldn't load. Try Refresh.")).toBeInTheDocument());
    error.mockRestore();
  });
});
