import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsCategoryCard } from "@/components/dashboard/NeedsCategoryCard";
import CategorySettingsPage from "@/app/settings/categories/page";
import type { UncategorizedResponse } from "@/app/api/analytics/uncategorized/route";

function group(i: number, overrides: Partial<UncategorizedResponse["groups"][number]> = {}) {
  return {
    key: `merchant ${i}`,
    label: `MERCHANT ${i}`,
    count: 1,
    total: (100 - i).toFixed(2),
    firstDate: "2025-06-01",
    lastDate: "2025-06-01",
    id: 100 + i,
    ...overrides,
  };
}

const QUEUE: UncategorizedResponse = {
  groups: [
    group(0, { key: "acme payroll ppd", label: "ACME PAYROLL PPD 123", count: 24, total: "-48000.00", firstDate: "2025-01-15", lastDate: "2025-12-31" }),
    group(1, { key: "venmo payment web", label: "Venmo Payment 1041576003169", count: 22, total: "1872.18", firstDate: "2025-02-03", lastDate: "2026-04-28" }),
    ...Array.from({ length: 10 }, (_, i) => group(i + 2)),
  ],
  count: 56,
  outflow: "2754.18",
  inflow: "48000.00",
};

function stubFetch(queue: UncategorizedResponse | "error" = QUEUE) {
  const fn = vi.fn(async (url: string) => {
    if (url === "/api/analytics/uncategorized") {
      return queue === "error" ? { ok: false, status: 500 } : { ok: true, json: async () => queue };
    }
    if (url === "/api/categories") return { ok: true, json: async () => ({ options: [] }) };
    if (url.endsWith("/similar")) {
      return {
        ok: true,
        json: async () => ({ key: "acme payroll ppd", label: "ACME PAYROLL PPD 123", similarCount: 23, samples: [], defaultApply: true, category: "UNCATEGORIZED", categoryDetailed: null, hasOwnChoice: false, hasMemory: false, pending: false }),
      };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NeedsCategoryCard", () => {
  it("lists the largest groups first with both directions totalled", async () => {
    stubFetch();
    render(<NeedsCategoryCard />);
    const card = await screen.findByRole("region", { name: "Needs a category" });
    expect(within(card).getByText(/56 transactions · \$2,754 out · \$48,000 in/)).toBeInTheDocument();
    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText("ACME PAYROLL PPD 123")).toBeInTheDocument();
    expect(within(rows[0]).getByText("24 transactions · Jan 2025 to Dec 2025")).toBeInTheDocument();
    expect(within(rows[0]).getByText("+$48,000.00")).toBeInTheDocument();
    expect(within(rows[1]).getByText("$1,872.18")).toBeInTheDocument();
  });

  it("shows every group on request", async () => {
    stubFetch();
    render(<NeedsCategoryCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Show all 12 merchants" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("renders nothing when every transaction has a category", async () => {
    const fn = stubFetch({ groups: [], count: 0, outflow: "0.00", inflow: "0.00" });
    const { container } = render(<NeedsCategoryCard />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says so when the queue fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch("error");
    render(<NeedsCategoryCard />);
    expect(await screen.findByText("Couldn't load uncategorized transactions.")).toBeInTheDocument();
  });

  it("opens the picker for a group's newest transaction", async () => {
    const fn = stubFetch();
    render(<NeedsCategoryCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Categorize ACME PAYROLL PPD 123" }));
    expect(screen.getByRole("dialog", { name: "Choose a category" })).toBeInTheDocument();
    await screen.findByRole("checkbox", { name: "Also apply to 23 similar transactions and future ones" });
    expect(fn.mock.calls.map((c) => c[0])).toContain("/api/transactions/100/similar");
  });
});

describe("Memorized categories settings", () => {
  const MEMORIES = [
    { id: 7, matchKey: "acme payroll ppd", label: "ACME PAYROLL PPD 123", category: "INCOME", categoryDetailed: "INCOME_SALARY", matchCount: 24 },
    { id: 8, matchKey: "soccer club", label: "SOCCER CLUB", category: "CUSTOM_SPENDING", categoryDetailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES", matchCount: 1 },
  ];

  it("lists memories and removes one", async () => {
    let memories = MEMORIES;
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/category-memories") return { ok: true, json: async () => ({ memories }) };
      if (url === "/api/category-memories/7" && init?.method === "DELETE") {
        memories = MEMORIES.slice(1);
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fn);
    render(<CategorySettingsPage />);
    expect(await screen.findByText("→ Salary · 24 transactions")).toBeInTheDocument();
    expect(screen.getByText("→ Kids Activities · 1 transaction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove ACME PAYROLL PPD 123" }));
    await waitFor(() => expect(screen.queryByText("ACME PAYROLL PPD 123")).not.toBeInTheDocument());
    expect(screen.getByText("SOCCER CLUB")).toBeInTheDocument();
  });

  it("explains the empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ memories: [] }) })));
    render(<CategorySettingsPage />);
    expect(
      await screen.findByText("Nothing memorized yet. Categorize a transaction and keep the box ticked.")
    ).toBeInTheDocument();
  });
});
