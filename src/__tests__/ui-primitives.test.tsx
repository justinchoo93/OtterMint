import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  buttonClassName,
  Card,
  CardHeader,
  Chip,
  DeltaIndicator,
  EmptyState,
  LegendKey,
  SegmentedControl,
} from "@/components/ui";

describe("Button", () => {
  it("defaults to a non-submitting secondary button", () => {
    render(<Button>Refresh</Button>);
    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("bg-surface-raised");
  });

  it("renders the primary look with dark ink on the accent", () => {
    render(<Button variant="primary">Connect</Button>);
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("text-on-accent");
  });

  it("passes through type, disabled state and handlers", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" disabled onClick={onClick}>
        Save
      </Button>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes the look for links", () => {
    expect(buttonClassName({ variant: "ghost", size: "sm" })).toContain("h-8");
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ] as const;

  it("names the group and marks exactly the selected option", () => {
    render(<SegmentedControl ariaLabel="Mode" options={options} value="a" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the chosen value", () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="Mode" options={options} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("uses 44px touch targets on phones when full width", () => {
    render(<SegmentedControl ariaLabel="Mode" options={options} value="a" onChange={() => {}} fullWidth />);
    expect(screen.getByRole("button", { name: "Alpha" }).className).toContain("h-11");
  });
});

describe("Chip", () => {
  it("has an accessible name that includes its visible label and dismisses on click", () => {
    const onDismiss = vi.fn();
    render(<Chip label="August 2026" dismissLabel="Clear month" onDismiss={onDismiss} />);
    const chip = screen.getByRole("button", { name: "Clear month: August 2026" });
    expect(chip).toHaveTextContent("August 2026");
    fireEvent.click(chip);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("DeltaIndicator", () => {
  it.each([
    ["up", "positive", "text-positive"],
    ["down", "negative", "text-negative"],
    ["flat", "neutral", "text-ink-secondary"],
  ] as const)("renders a %s arrow in the %s tone", (direction, tone, className) => {
    render(
      <DeltaIndicator direction={direction} tone={tone}>
        +1.0%
      </DeltaIndicator>
    );
    const indicator = screen.getByText("+1.0%").parentElement!;
    expect(indicator).toHaveAttribute("data-direction", direction);
    expect(indicator.className).toContain(className);
    expect(indicator.querySelector("svg")).toHaveAttribute("aria-hidden");
  });
});

describe("Card, LegendKey and EmptyState", () => {
  it("renders a section with a serif heading and actions", () => {
    render(
      <Card aria-label="Cash flow card">
        <CardHeader title="Cash flow" subtitle="Apr–Sep 2026" actions={<Button>Act</Button>} />
      </Card>
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Cash flow" });
    expect(heading.className).toContain("font-serif");
    expect(screen.getByText("Apr–Sep 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("keeps legend text in ink color with a colored mark beside it", () => {
    render(
      <LegendKey color="var(--series-income)" shape="square">
        Income
      </LegendKey>
    );
    const label = screen.getByText("Income");
    expect(label.parentElement!.className).toContain("text-ink-secondary");
  });

  it("renders an empty state message", () => {
    render(<EmptyState>No spending in this period.</EmptyState>);
    expect(screen.getByText("No spending in this period.")).toBeInTheDocument();
  });
});
