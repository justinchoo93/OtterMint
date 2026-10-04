"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cx, SegmentedControl } from "@/components/ui";
import {
  addMonths,
  describePeriod,
  monthGridCells,
  monthLongLabel,
  normalizePeriod,
  PERIOD_PRESETS,
  periodFromSpan,
  spanKeysLabel,
  stepPeriod,
  type Period,
  type PeriodBounds,
  type PeriodPresetId,
} from "@/lib/analytics-model";

export interface PeriodBarProps {
  period: Period;
  onChange: (period: Period) => void;
  /** The first and last months the picker may select. */
  bounds: PeriodBounds;
  /** "YYYY-MM-DD" */
  today: string;
  /** Overrides the described label, e.g. a span clipped to the first data month. */
  label?: string;
  caption?: ReactNode;
}

const PRESET_OPTIONS: ReadonlyArray<{ value: string; label: string }> = PERIOD_PRESETS.map((r) => ({
  value: r.id,
  label: r.label,
}));

// 44px on phones; from sm, as tall as the segmented control beside it.
const CONTROL = "h-11 rounded-control border bg-surface-raised text-ink transition-colors sm:h-[38px]";
const ARROW = cx(
  CONTROL,
  "flex w-11 shrink-0 items-center justify-center border-line hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-raised sm:w-[38px]"
);
const PICK = "h-11 rounded-lg text-caption font-medium transition-colors disabled:cursor-not-allowed sm:h-[38px]";
const CHOICE = cx(PICK, "border px-3 disabled:opacity-40");

function choiceClass(on: boolean): string {
  return cx(
    CHOICE,
    on ? "border-accent bg-accent-dim text-ink" : "border-line text-ink-secondary hover:bg-surface-hover hover:text-ink"
  );
}

const same = (a: Period, b: Period) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The time control shared by Dashboard, Analytics and Investments: quick
 * ranges, arrows that step by month or year, and a button that opens a picker
 * (a popover from sm, a bottom sheet on phones). In the picker a click selects
 * a month and a press-and-drag selects a range; Shift extends from the
 * current period's first month.
 */
export function PeriodBar({ period, onChange, bounds, today, label, caption }: PeriodBarProps) {
  const described = describePeriod(period, today);
  const current = described.period;
  const thisYear = Number(today.slice(0, 4));
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(thisYear);
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setDrag(null);
    buttonRef.current?.focus();
  };
  const choose = (next: Period) => {
    onChange(normalizePeriod(next, today));
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setDrag(null);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const previous = stepPeriod(current, -1, bounds, today);
  const next = stepPeriod(current, 1, bounds, today);
  const unit = described.stepUnit ?? "month";

  // The months the grid tints: an active drag, or the period clamped to the bounds.
  const anchor = described.firstMonth < bounds.firstMonth ? bounds.firstMonth : described.firstMonth;
  const selection = drag
    ? {
        from: drag.from <= drag.to ? drag.from : drag.to,
        to: drag.from <= drag.to ? drag.to : drag.from,
        solidEnds: true,
      }
    : { from: anchor, to: described.lastMonth, solidEnds: current.kind === "range" };
  const cells = monthGridCells(viewYear, selection, bounds, today);

  const inBounds = (first: string, last: string) => last >= bounds.firstMonth && first <= bounds.lastMonth;
  const lastMonth = addMonths(today.slice(0, 7), -1);
  const shortcuts: Array<{ label: string; period: Period; disabled: boolean }> = [
    { label: "This month", period: { kind: "preset", id: "MTD" }, disabled: false },
    { label: "Last month", period: { kind: "month", month: lastMonth }, disabled: !inBounds(lastMonth, lastMonth) },
    { label: "This year", period: { kind: "preset", id: "YTD" }, disabled: false },
    {
      label: "Last year",
      period: { kind: "year", year: thisYear - 1 },
      disabled: !inBounds(`${thisYear - 1}-01`, `${thisYear - 1}-12`),
    },
  ];
  const wholeYear = normalizePeriod({ kind: "year", year: viewYear }, today);

  const extendTo = (month: string) => choose(periodFromSpan(anchor, month, today));
  const onCellPointerDown = (month: string, event: PointerEvent<HTMLButtonElement>) => {
    if (event.shiftKey) extendTo(month);
    else setDrag({ from: month, to: month });
  };
  // A finger press captures later pointer events to the cell first touched, so
  // the cell under the pointer is found by hit-testing rather than pointerenter.
  const onGridPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const cell = document.elementFromPoint?.(event.clientX, event.clientY)?.closest("[data-month]");
    const month = cell?.getAttribute("data-month");
    if (!month || month === drag.to || (cell as HTMLButtonElement).disabled) return;
    setDrag({ from: drag.from, to: month });
  };
  const commitDrag = () => {
    if (drag) choose(periodFromSpan(drag.from, drag.to, today));
  };
  const cancelDrag = () => {
    if (drag) setDrag(null);
  };
  const onCellKeyDown = (month: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.shiftKey || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    extendTo(month);
  };

  const hint =
    drag && selection.from !== selection.to
      ? `Release to select ${spanKeysLabel(selection.from, selection.to)}.`
      : "Select a month, or drag across months for a range. Shift-click reaches across years.";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SegmentedControl
        ariaLabel="Quick ranges"
        options={PRESET_OPTIONS}
        value={current.kind === "preset" ? current.id : ""}
        onChange={(id) => onChange({ kind: "preset", id: id as PeriodPresetId })}
        fullWidth
        className="sm:inline-flex sm:w-auto"
      />

      <div className="relative flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Previous ${unit}`}
          disabled={!previous}
          onClick={() => previous && onChange(previous)}
          className={ARROW}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="period-button"
          onClick={() => {
            setDrag(null);
            setViewYear(Number(described.lastMonth.slice(0, 4)));
            setOpen((o) => !o);
          }}
          className={cx(
            CONTROL,
            "flex min-w-0 flex-1 items-center gap-2 px-3 text-caption font-medium hover:bg-surface-hover sm:min-w-[204px] sm:flex-none",
            current.kind === "preset" ? "border-line" : "border-accent"
          )}
        >
          <Calendar aria-hidden className="h-[15px] w-[15px] shrink-0 text-ink-secondary" />
          <span className="flex-1 text-left whitespace-nowrap">{label ?? described.buttonLabel}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
        </button>
        <button
          type="button"
          aria-label={`Next ${unit}`}
          disabled={!next}
          onClick={() => next && onChange(next)}
          className={ARROW}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>

        {open && (
          <>
            <button
              type="button"
              aria-label="Close period picker"
              tabIndex={-1}
              onClick={close}
              className="fixed inset-0 z-40 cursor-default bg-black/60 sm:bg-transparent"
            />
            <div
              role="dialog"
              aria-label="Choose a period"
              onPointerUp={commitDrag}
              onPointerLeave={cancelDrag}
              onPointerCancel={cancelDrag}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3.5 rounded-t-[20px] border-t border-line bg-surface-raised px-4 pt-3 pb-7 sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:bottom-auto sm:left-0 sm:w-[328px] sm:rounded-tile sm:border sm:p-3.5 sm:shadow-popover"
            >
              <div className="flex items-center justify-between sm:hidden">
                <h2 className="font-serif text-[1.375rem] leading-[1.15] font-normal text-ink">Choose a period</h2>
                <button type="button" onClick={close} className="h-11 rounded-lg px-3 text-sm font-medium text-accent">
                  Done
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {shortcuts.map((shortcut) => {
                  const target = normalizePeriod(shortcut.period, today);
                  const on = same(target, current);
                  return (
                    <button
                      key={shortcut.label}
                      type="button"
                      aria-pressed={on}
                      disabled={shortcut.disabled}
                      onClick={() => choose(target)}
                      className={choiceClass(on)}
                    >
                      {shortcut.label}
                    </button>
                  );
                })}
              </div>

              <div className="h-px bg-line" />

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Earlier year"
                  disabled={!inBounds(`${viewYear - 1}-01`, `${viewYear - 1}-12`)}
                  onClick={() => setViewYear((y) => y - 1)}
                  className={cx(PICK, "flex w-11 items-center justify-center text-ink hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent sm:w-[38px]")}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </button>
                <span className="min-w-11 text-center text-[15px] font-semibold text-ink" aria-live="polite">
                  {viewYear}
                </span>
                <button
                  type="button"
                  aria-label="Later year"
                  disabled={!inBounds(`${viewYear + 1}-01`, `${viewYear + 1}-12`)}
                  onClick={() => setViewYear((y) => y + 1)}
                  className={cx(PICK, "flex w-11 items-center justify-center text-ink hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent sm:w-[38px]")}
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-pressed={same(wholeYear, current)}
                  disabled={!inBounds(`${viewYear}-01`, `${viewYear}-12`)}
                  onClick={() => choose(wholeYear)}
                  className={choiceClass(same(wholeYear, current))}
                >
                  All of {viewYear}
                </button>
              </div>

              <div
                data-testid="month-grid"
                onPointerMove={onGridPointerMove}
                className="grid touch-none grid-cols-4 gap-1.5 select-none"
              >
                {cells.map((cell) => (
                  <button
                    key={cell.month}
                    type="button"
                    data-month={cell.month}
                    aria-label={monthLongLabel(cell.month)}
                    aria-pressed={cell.inRange}
                    disabled={cell.disabled}
                    onPointerDown={(event) => onCellPointerDown(cell.month, event)}
                    onKeyDown={(event) => onCellKeyDown(cell.month, event)}
                    // Pointer clicks are handled on pointerup; detail 0 is a keyboard activation.
                    onClick={(event) => {
                      if (event.detail === 0) choose({ kind: "month", month: cell.month });
                    }}
                    className={cx(
                      PICK,
                      "border",
                      cell.current ? "border-ink-muted" : "border-transparent",
                      cell.disabled
                        ? "text-ink-muted opacity-40"
                        : cell.solid
                          ? "border-accent bg-accent text-on-accent"
                          : cell.inRange
                            ? "bg-accent-dim text-ink"
                            : "text-ink hover:bg-surface-hover"
                    )}
                  >
                    {cell.label}
                  </button>
                ))}
              </div>

              <p className="text-xs leading-snug text-ink-muted">{hint}</p>
            </div>
          </>
        )}
      </div>

      {caption && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">{caption}</div>}
    </div>
  );
}
