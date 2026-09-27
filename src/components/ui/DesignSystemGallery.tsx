"use client";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  DeltaIndicator,
  EmptyState,
  LegendKey,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";

const SWATCHES: Array<{ group: string; items: Array<{ name: string; utility: string; value: string }> }> = [
  {
    group: "Surfaces",
    items: [
      { name: "--bg-primary", utility: "bg-canvas", value: "#0a0d0c" },
      { name: "--bg-secondary", utility: "bg-surface", value: "#111614" },
      { name: "--bg-tertiary", utility: "bg-surface-raised", value: "#171d1a" },
      { name: "--bg-hover", utility: "bg-surface-hover", value: "#1c2320" },
      { name: "--bg-active", utility: "bg-surface-active", value: "#242c28" },
      { name: "--border", utility: "border-line", value: "#242c28" },
      { name: "--border-subtle", utility: "border-line-subtle", value: "#1b221e" },
    ],
  },
  {
    group: "Text",
    items: [
      { name: "--text-primary", utility: "text-ink", value: "#edf1ef" },
      { name: "--text-secondary", utility: "text-ink-secondary", value: "#a3ada8" },
      { name: "--text-muted", utility: "text-ink-muted", value: "#85908a" },
    ],
  },
  {
    group: "Accent and change",
    items: [
      { name: "--accent-mint", utility: "bg-accent / text-accent", value: "#34d399" },
      { name: "--delta-up", utility: "text-positive", value: "#34d399" },
      { name: "--delta-down", utility: "text-negative", value: "#f0836f" },
    ],
  },
  {
    group: "Data",
    items: [
      { name: "--series-income", utility: "bg-series-income", value: "#199e70" },
      { name: "--series-spending", utility: "bg-series-spending", value: "#d95926" },
      { name: "--series-saved", utility: "bg-series-saved", value: "#3987e5" },
      { name: "--chart-grid", utility: "bg-chart-grid", value: "#1e2622" },
      { name: "--chart-baseline", utility: "bg-chart-baseline", value: "#2e3833" },
      { name: "--chart-muted-line", utility: "bg-chart-muted", value: "#3a453f" },
    ],
  },
];

const TYPE_SCALE = [
  { label: "Hero figure · text-hero · DM Sans 52/600", className: "text-hero text-ink", sample: "$396,516" },
  { label: "Figure · text-figure · DM Sans 28/600", className: "text-figure text-ink", sample: "$66,758" },
  { label: "Display · font-serif text-display · 26", className: "font-serif text-display text-ink", sample: "Analytics" },
  { label: "Title · font-serif text-title · 24", className: "font-serif text-title text-ink", sample: "Where it went" },
  { label: "Body · text-sm · 14", className: "text-sm text-ink", sample: "Income above the line, spending and saving below." },
  { label: "Caption · text-caption · 13", className: "text-caption text-ink-secondary", sample: "Compared with the previous 3 months" },
  { label: "Micro · text-micro · 11", className: "text-micro text-ink-muted", sample: "Apr  May  Jun  Jul" },
  { label: "Numbers in columns · font-mono tabular-nums", className: "font-mono text-sm tabular-nums text-ink", sample: "$1,853.00" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function DesignSystemGallery() {
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "ALL">("6M");
  const [mode, setMode] = useState<"normalized" | "reported">("normalized");
  const [chips, setChips] = useState(["August 2026", "Restaurants"]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-display font-normal text-ink">OtterMint design system</h1>
        <p className="text-caption text-ink-secondary">
          Development-only gallery of tokens and primitives. The guide is docs/design-system.md.
        </p>
      </header>

      <Section title="Color">
        <div className="flex flex-col gap-6">
          {SWATCHES.map((group) => (
            <div key={group.group} className="flex flex-col gap-3">
              <h3 className="text-caption font-medium text-ink-secondary">{group.group}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {group.items.map((item) => (
                  <div key={item.name} className="flex flex-col gap-2">
                    <div
                      className="h-12 rounded-control border border-line"
                      style={{ background: `var(${item.name})` }}
                    />
                    <div className="flex flex-col">
                      <span className="font-mono text-micro text-ink">{item.name}</span>
                      <span className="text-micro text-ink-muted">{item.utility}</span>
                      <span className="font-mono text-micro text-ink-muted">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col divide-y divide-line-subtle">
          {TYPE_SCALE.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
              <span className="w-72 shrink-0 text-micro text-ink-muted">{row.label}</span>
              <span className={row.className}>{row.sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />}>
              Connect Account
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              ariaLabel="Time range"
              options={[
                { value: "3M", label: "3M" },
                { value: "6M", label: "6M" },
                { value: "1Y", label: "1Y" },
                { value: "ALL", label: "All" },
              ]}
              value={range}
              onChange={setRange}
            />
            <SegmentedControl
              ariaLabel="Net worth history mode"
              size="sm"
              options={[
                { value: "normalized", label: "Normalized" },
                { value: "reported", label: "Reported" },
              ]}
              value={mode}
              onChange={setMode}
            />
            {chips.map((chip) => (
              <Chip
                key={chip}
                label={chip}
                dismissLabel="Clear"
                onDismiss={() => setChips((current) => current.filter((c) => c !== chip))}
              />
            ))}
          </div>
          <div className="max-w-sm">
            <SegmentedControl
              ariaLabel="Time range, full width"
              fullWidth
              options={[
                { value: "3M", label: "3M" },
                { value: "6M", label: "6M" },
                { value: "1Y", label: "1Y" },
                { value: "ALL", label: "All" },
              ]}
              value={range}
              onChange={setRange}
            />
          </div>
        </div>
      </Section>

      <Section title="Data display">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-5">
            <DeltaIndicator direction="up" tone="positive" size="md">
              +$27,555 (+7.5%)
            </DeltaIndicator>
            <DeltaIndicator direction="up" tone="negative">
              +14% more spending
            </DeltaIndicator>
            <DeltaIndicator direction="down" tone="positive">
              −3% spending
            </DeltaIndicator>
            <DeltaIndicator direction="down" tone="negative">
              −8.2% income
            </DeltaIndicator>
            <DeltaIndicator direction="flat" tone="neutral">
              0.0%
            </DeltaIndicator>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <LegendKey color="var(--series-income)" shape="square">
              Income
            </LegendKey>
            <LegendKey color="var(--series-spending)" shape="square">
              Spending
            </LegendKey>
            <LegendKey color="var(--series-saved)" shape="square">
              Saved
            </LegendKey>
            <LegendKey color="var(--accent-mint)" shape="line">
              Observed
            </LegendKey>
            <LegendKey color="var(--accent-mint)" shape="dashed-line">
              Estimated
            </LegendKey>
            <LegendKey color="var(--text-muted)" shape="dot">
              Account change
            </LegendKey>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <EmptyState>No spending in this period.</EmptyState>
            <div className="flex flex-col gap-3 rounded-tile border border-line p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24" />
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
