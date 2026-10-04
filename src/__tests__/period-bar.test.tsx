import React, { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodBar } from "@/components/dashboard/PeriodBar";
import type { Period } from "@/lib/analytics-model";

const TODAY = "2026-10-03";
const BOUNDS = { firstMonth: "2025-01", lastMonth: "2026-10" };
const preset = (id: "MTD" | "3M" | "6M" | "YTD" | "1Y" | "ALL"): Period => ({ kind: "preset", id });

function setup(period: Period, onChange = vi.fn()) {
  render(<PeriodBar period={period} onChange={onChange} bounds={BOUNDS} today={TODAY} />);
  return onChange;
}

const periodButton = () => screen.getByTestId("period-button");
const openPicker = () => fireEvent.click(periodButton());
const cell = (name: string) => screen.getByRole("button", { name });

const originalElementFromPoint = document.elementFromPoint;
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint;
});

describe("PeriodBar", () => {
  it("shows the six quick ranges with the active one pressed", () => {
    setup(preset("6M"));
    for (const name of ["MTD", "3M", "6M", "YTD", "1Y", "All"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", String(name === "6M"));
    }
    expect(periodButton()).toHaveTextContent("May–Oct 2026");
    expect(periodButton().className).toContain("border-line");
  });

  it("lights no quick range for a month and shows it on the button", () => {
    setup({ kind: "month", month: "2026-09" });
    for (const name of ["MTD", "3M", "6M", "YTD", "1Y", "All"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect(periodButton()).toHaveTextContent("September 2026");
    expect(periodButton().className).toContain("border-accent");
  });

  it("uses the label the page passes", () => {
    render(<PeriodBar period={preset("1Y")} onChange={vi.fn()} bounds={BOUNDS} today={TODAY} label="Jan–Oct 2026" />);
    expect(periodButton()).toHaveTextContent("Jan–Oct 2026");
  });

  it("reports a quick range", () => {
    const onChange = setup(preset("6M"));
    fireEvent.click(screen.getByRole("button", { name: "YTD" }));
    expect(onChange).toHaveBeenCalledWith(preset("YTD"));
  });

  it("steps by month from month to date, and not past today", () => {
    const onChange = setup(preset("MTD"));
    expect(periodButton()).toHaveTextContent("Oct 1–3, 2026");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: "2026-09" });
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("steps by year from year to date and returns to it", () => {
    const onChange = setup(preset("YTD"));
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    expect(onChange).toHaveBeenCalledWith({ kind: "year", year: 2025 });
  });

  it("disables both arrows for a rolling range", () => {
    setup(preset("6M"));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("opens the picker on the period's year, tinted, with months outside the data disabled", () => {
    setup(preset("6M"));
    expect(screen.queryByRole("dialog")).toBeNull();
    openPicker();
    expect(screen.getByRole("dialog", { name: "Choose a period" })).toBeInTheDocument();
    expect(periodButton()).toHaveAttribute("aria-expanded", "true");
    expect(cell("May 2026")).toHaveAttribute("aria-pressed", "true");
    expect(cell("April 2026")).toHaveAttribute("aria-pressed", "false");
    expect(cell("November 2026")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Earlier year" }));
    expect(cell("January 2025")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Earlier year" })).toBeDisabled();
  });

  it("selects a month from the keyboard and closes", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    // Testing Library clicks have detail 0, like a click made with Enter or Space.
    fireEvent.click(cell("March 2026"));
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: "2026-03" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(periodButton()).toHaveFocus();
  });

  it("selects one month on a press and release without movement", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    fireEvent.pointerDown(cell("March 2026"));
    fireEvent.pointerUp(cell("March 2026"));
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: "2026-03" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores the pointer click that follows a press, so a month is not selected twice", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    fireEvent.click(cell("March 2026"), { detail: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects a range by pressing on one month and dragging to another", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    const june = cell("June 2026");
    document.elementFromPoint = vi.fn(() => june);
    fireEvent.pointerDown(cell("March 2026"));
    fireEvent.pointerMove(screen.getByTestId("month-grid"), { clientX: 10, clientY: 10 });
    expect(screen.getByText("Release to select Mar–Jun 2026.")).toBeInTheDocument();
    expect(cell("April 2026")).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerUp(screen.getByRole("dialog"));
    expect(onChange).toHaveBeenCalledWith({ kind: "range", from: "2026-03", to: "2026-06" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selects a range dragged backwards", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    const feb = cell("February 2026");
    document.elementFromPoint = vi.fn(() => feb);
    fireEvent.pointerDown(cell("May 2026"));
    fireEvent.pointerMove(screen.getByTestId("month-grid"));
    fireEvent.pointerUp(feb);
    expect(onChange).toHaveBeenCalledWith({ kind: "range", from: "2026-02", to: "2026-05" });
  });

  it("cancels a drag that leaves the picker", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    const june = cell("June 2026");
    document.elementFromPoint = vi.fn(() => june);
    fireEvent.pointerDown(cell("March 2026"));
    fireEvent.pointerMove(screen.getByTestId("month-grid"));
    fireEvent.pointerLeave(screen.getByRole("dialog"));
    fireEvent.pointerUp(screen.getByRole("dialog"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(cell("June 2026")).toHaveAttribute("aria-pressed", "true"); // back to the 6M tint
    expect(cell("March 2026")).toHaveAttribute("aria-pressed", "false");
  });

  it("does not drag onto a disabled month", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    const december = cell("December 2026");
    document.elementFromPoint = vi.fn(() => december);
    fireEvent.pointerDown(cell("August 2026"));
    fireEvent.pointerMove(screen.getByTestId("month-grid"));
    fireEvent.pointerUp(screen.getByRole("dialog"));
    expect(onChange).toHaveBeenCalledWith({ kind: "month", month: "2026-08" });
  });

  it("extends across years with Shift, by pointer and by keyboard", () => {
    const onChange = setup({ kind: "month", month: "2025-11" });
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Later year" }));
    fireEvent.pointerDown(cell("February 2026"), { shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "range", from: "2025-11", to: "2026-02" });

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Later year" }));
    fireEvent.keyDown(cell("March 2026"), { key: "Enter", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "range", from: "2025-11", to: "2026-03" });
  });

  it("offers shortcuts and whole years", () => {
    const onChange = setup(preset("6M"));
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "month", month: "2026-09" });

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Last year" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "year", year: 2025 });

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "All of 2026" }));
    expect(onChange).toHaveBeenLastCalledWith(preset("YTD"));

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Earlier year" }));
    fireEvent.click(screen.getByRole("button", { name: "All of 2025" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "year", year: 2025 });

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(onChange).toHaveBeenLastCalledWith(preset("MTD"));
  });

  it("marks the active shortcut and whole year", () => {
    setup({ kind: "year", year: 2025 });
    openPicker();
    expect(screen.getByRole("button", { name: "Last year" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All of 2025" })).toHaveAttribute("aria-pressed", "true");
    expect(cell("January 2025")).toHaveAttribute("aria-pressed", "true");
    expect(cell("December 2025")).toHaveAttribute("aria-pressed", "true");
  });

  it("closes on Escape and on the backdrop, returning focus to the button", () => {
    setup(preset("6M"));
    openPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(periodButton()).toHaveFocus();
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Close period picker" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows the period it is given", () => {
    function Harness() {
      const [period, setPeriod] = useState<Period>(preset("MTD"));
      return <PeriodBar period={period} onChange={setPeriod} bounds={BOUNDS} today={TODAY} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(periodButton()).toHaveTextContent("September 2026");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(periodButton()).toHaveTextContent("August 2026");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(periodButton()).toHaveTextContent("Oct 1–3, 2026");
    expect(screen.getByRole("button", { name: "MTD" })).toHaveAttribute("aria-pressed", "true");
  });
});
