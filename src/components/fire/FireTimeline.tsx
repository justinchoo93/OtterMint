"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Card, CardHeader, cx } from "@/components/ui";
import type { FireTimelineItem } from "@/lib/fire-model";

interface FireTimelineProps {
  items: FireTimelineItem[];
  subtitle: string;
}

/** Which money pays for which years: retirements, accounts opening and income starting, in date order. */
export function FireTimeline({ items, subtitle }: FireTimelineProps) {
  return (
    <Card aria-label="Which money pays for which years">
      <CardHeader title="Which money pays for which years" subtitle={subtitle} />
      <ol className="mt-5 flex flex-col">
        {items.map((item, index) => (
          <li key={item.key} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3.5">
            <div className="flex flex-col items-center" aria-hidden>
              <span className={cx("mt-1.5 h-2.5 w-2.5 rounded-full", item.tone === "retire" ? "bg-accent" : "bg-chart-muted")} />
              {index < items.length - 1 && <span className="min-h-3 w-px flex-1 bg-line" />}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 pb-5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{item.title}</span>
                <span className="text-micro text-ink-muted">{item.when}</span>
                <span className="text-caption text-ink-secondary">{item.detail}</span>
                {item.check && (
                  <span className={cx("mt-1.5 inline-flex items-start gap-1.5 text-caption", item.check.ok ? "text-accent" : "text-negative")}>
                    {item.check.ok ? (
                      <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{item.check.text}</span>
                  </span>
                )}
              </div>
              {item.amount && <span className="whitespace-nowrap font-mono text-[0.9375rem] font-semibold text-ink">{item.amount}</span>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
