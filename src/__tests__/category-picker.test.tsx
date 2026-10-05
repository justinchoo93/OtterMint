import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryPicker } from "@/components/dashboard/CategoryPicker";
import type { SimilarResponse } from "@/app/api/transactions/[id]/similar/route";

const OPTIONS = [
  { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE", label: "Coffee", groupLabel: "Food & Drink" },
  { category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_GROCERIES", label: "Groceries", groupLabel: "Food & Drink" },
  { category: "INCOME", categoryDetailed: "INCOME_SALARY", label: "Salary", groupLabel: "Income" },
];

function similar(overrides: Partial<SimilarResponse> = {}): SimilarResponse {
  return {
    key: "monkey grind seattle",
    label: "MONKEY GRIND SEATTLE WA",
    similarCount: 13,
    samples: [
      { id: 41, date: "2026-03-30", name: "MONKEY GRIND SEATTLE WA", amount: "5.50" },
      { id: 40, date: "2026-03-22", name: "MONKEY GRIND SEATTLE WA", amount: "6.25" },
    ],
    defaultApply: true,
    category: "UNCATEGORIZED",
    categoryDetailed: null,
    hasOwnChoice: false,
    hasMemory: false,
    pending: false,
    ...overrides,
  };
}

function stubFetch(similarBody: SimilarResponse = similar(), saveOk = true) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/categories") return { ok: true, json: async () => ({ options: OPTIONS }) };
    if (url === "/api/transactions/42/similar") return { ok: true, json: async () => similarBody };
    if (url === "/api/transactions/42/category") {
      return saveOk
        ? { ok: true, json: async () => ({ ok: true }) }
        : { ok: false, status: 400, json: async () => ({ error: "Nope" }) };
    }
    throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function saveCall(fn: ReturnType<typeof stubFetch>) {
  const call = fn.mock.calls.find(([url, init]) => url === "/api/transactions/42/category" && init?.method === "PUT");
  return call ? JSON.parse(String(call[1]!.body)) : null;
}

function renderPicker() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<CategoryPicker id={42} title="MONKEY GRIND" onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CategoryPicker", () => {
  it("lists the options under their groups with the count sentence and samples", async () => {
    stubFetch();
    renderPicker();
    const dialog = screen.getByRole("dialog", { name: "Choose a category" });
    await within(dialog).findByRole("radio", { name: /Coffee/ });
    expect(within(dialog).getByText("Food & Drink")).toBeInTheDocument();
    expect(within(dialog).getByText("Income")).toBeInTheDocument();
    expect(within(dialog).getByText("MONKEY GRIND SEATTLE WA · now", { exact: false })).toBeInTheDocument();
    const checkbox = within(dialog).getByRole("checkbox", { name: "Also apply to 13 similar transactions and future ones" });
    expect(checkbox).toBeChecked();
    const samples = within(dialog).getByRole("list", { name: "Similar transactions" });
    expect(within(samples).getByText("Mar 30, 2026 · MONKEY GRIND SEATTLE WA")).toBeInTheDocument();
    expect(within(samples).getByText("and 11 more")).toBeInTheDocument();
  });

  it("filters the options", async () => {
    stubFetch();
    renderPicker();
    await screen.findByRole("radio", { name: /Coffee/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter categories" }), { target: { value: "sal" } });
    expect(screen.queryByRole("radio", { name: /Coffee/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Salary/ })).toBeInTheDocument();
  });

  it("saves for similar transactions by default", async () => {
    const fn = stubFetch();
    const { onSaved, onClose } = renderPicker();
    fireEvent.click(await screen.findByRole("radio", { name: /Coffee/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(saveCall(fn)).toEqual({ category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE", applyToSimilar: true });
  });

  it("saves only this transaction when the box is unticked", async () => {
    const fn = stubFetch();
    const { onSaved } = renderPicker();
    fireEvent.click(await screen.findByRole("radio", { name: /Groceries/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveCall(fn)).toMatchObject({ categoryDetailed: "FOOD_AND_DRINK_GROCERIES", applyToSimilar: false });
  });

  it("starts unticked for a payment app", async () => {
    stubFetch(similar({ key: "venmo payment web", defaultApply: false }));
    renderPicker();
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });

  it("creates a category that declares its flow", async () => {
    const fn = stubFetch();
    const { onSaved } = renderPicker();
    await screen.findByRole("radio", { name: /Coffee/ });
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New category name" }), { target: { value: "Kids activities" } });
    fireEvent.click(screen.getByRole("button", { name: "Spending" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveCall(fn)).toEqual({
      category: "CUSTOM_SPENDING",
      categoryDetailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES",
      applyToSimilar: true,
    });
  });

  it("keeps Save disabled for an invalid new name", async () => {
    stubFetch();
    renderPicker();
    await screen.findByRole("radio", { name: /Coffee/ });
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New category name" }), { target: { value: "Kids' stuff" } });
    expect(screen.getByText("Use up to 30 letters, numbers and spaces.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("offers Reset only when the transaction has its own choice", async () => {
    stubFetch();
    renderPicker();
    await screen.findByRole("radio", { name: /Coffee/ });
    expect(screen.queryByRole("button", { name: "Reset to original" })).not.toBeInTheDocument();
  });

  it("resets the transaction's own choice", async () => {
    const fn = stubFetch(similar({ hasOwnChoice: true, category: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_COFFEE" }));
    const { onSaved } = renderPicker();
    expect(await screen.findByText("Current")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset to original" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fn.mock.calls.some(([url, init]) => url === "/api/transactions/42/category" && init?.method === "DELETE")).toBe(true);
  });

  it("explains a transaction that cannot be matched and saves it alone", async () => {
    const fn = stubFetch(similar({ key: "", similarCount: 0, samples: [], defaultApply: false }));
    const { onSaved } = renderPicker();
    fireEvent.click(await screen.findByRole("radio", { name: /Coffee/ }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/can't be matched to others/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveCall(fn)).toMatchObject({ applyToSimilar: false });
  });

  it("shows a failed save inline and stays open", async () => {
    stubFetch(similar(), false);
    const { onSaved, onClose } = renderPicker();
    fireEvent.click(await screen.findByRole("radio", { name: /Coffee/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    stubFetch();
    const { onClose } = renderPicker();
    await screen.findByRole("radio", { name: /Coffee/ });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
