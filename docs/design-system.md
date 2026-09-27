# OtterMint design system

The baseline visual language for OtterMint. Tokens live in `src/app/globals.css`, primitives in `src/components/ui/`, and a development-only gallery renders everything at `/design-system` (run `npm run dev`; the page returns 404 in production builds). `src/__tests__/design-tokens.test.ts` fails if a token change breaks a contrast minimum below.

## Principles

- **Quiet surfaces, loud data.** Near-black green-tinted surfaces step up in small increments; the numbers and chart marks carry the contrast.
- **One accent.** Mint (`--accent-mint`) marks the current place and the primary action. It is not a decoration color.
- **Serif for titles only.** Instrument Serif sets page and section titles. Numbers, labels and body copy are DM Sans. JetBrains Mono is only for numbers that must align in columns and for axis ticks.
- **Meaning never rests on color alone.** A change carries an arrow and a sign; a series carries a legend; a status carries a label.
- **Real controls.** Everything clickable is a `<button>` or `<a href>`, reachable by keyboard, with the global mint focus ring.

## Tokens

There are two layers. Raw tokens in `:root` hold the values and keep their historical names so older components using `bg-[var(--bg-secondary)]` keep working. Semantic tokens in `@theme inline` map raw tokens to Tailwind utilities. **New code uses the semantic utilities.**

### Color

| Raw token | Utility | Value | Use |
| --- | --- | --- | --- |
| `--bg-primary` | `bg-canvas` | `#0a0d0c` | Page ground |
| `--bg-secondary` | `bg-surface` | `#111614` | Cards |
| `--bg-tertiary` | `bg-surface-raised` | `#171d1a` | Inputs, tooltips, segmented tracks |
| `--bg-hover` | `bg-surface-hover` | `#1c2320` | Hover, selected rows and chart columns |
| `--bg-active` | `bg-surface-active` | `#242c28` | Selected segment on a raised track. No muted text on it (4.33:1). |
| `--border` | `border-line` | `#242c28` | Card and control borders |
| `--border-subtle` | `border-line-subtle` | `#1b221e` | Dividers inside cards |
| `--text-primary` | `text-ink` | `#edf1ef` | Primary text and figures |
| `--text-secondary` | `text-ink-secondary` | `#a3ada8` | Labels, subtitles |
| `--text-muted` | `text-ink-muted` | `#85908a` | Captions, axis ticks, footers |
| `--accent-mint` | `bg-accent`, `text-accent` | `#34d399` | Active nav icon, primary buttons, net-worth line |
| (ink on accent) | `text-on-accent` | `#0a0d0c` | Text on mint (10.15:1) |
| `--delta-up` | `text-positive` | `#34d399` | Good change |
| `--delta-down` | `text-negative` | `#f0836f` | Bad change |
| `--series-income` | `bg-series-income` | `#199e70` | Income marks |
| `--series-spending` | `bg-series-spending` | `#d95926` | Spending marks, category bars |
| `--series-saved` | `bg-series-saved` | `#3987e5` | Saved marks |
| `--chart-grid` | `bg-chart-grid` | `#1e2622` | Gridlines (solid hairlines) |
| `--chart-baseline` | `bg-chart-baseline` | `#2e3833` | Zero lines |
| `--chart-muted-line` | `bg-chart-muted` | `#3a453f` | Sparklines, crosshairs |

Contrast minimums, enforced by the test: every text token (ink, secondary, muted, positive, negative) reaches 4.5:1 on canvas, surface, raised and hover; primary and secondary text reach 4.5:1 on the active fill; mint and the three series colors reach 3:1 on the card surface; dark ink reaches 4.5:1 on mint. For reference, muted text measures 4.90:1 on cards (the pre-design-system gray measured 3.75:1).

The legacy accents (`--accent-green`, `--accent-red`, `--accent-blue`, `--accent-amber`, `--accent-purple` and their `-dim` fills) remain for existing panels. The categorical chart palette `--chart-cat-1` to `--chart-cat-8` keeps its validated fixed order: assign series in that order and never cycle it; fold a ninth series into "Other".

### Type

| Utility | Size | Face | Use |
| --- | --- | --- | --- |
| `text-hero` | 52px / 600 | DM Sans | The one headline figure per view (40px on phones) |
| `text-figure` | 28px / 600 | DM Sans | Stat tile values (24px on phones) |
| `font-serif text-display` | 26px | Instrument Serif | Page titles, wordmark |
| `font-serif text-title` | 24px | Instrument Serif | Card and section titles (22px on phones, via `CardHeader`) |
| `text-sm` | 14px | DM Sans | Body text, rows |
| `text-caption` | 13px | DM Sans | Labels, subtitles, controls |
| `text-xs` | 12px | DM Sans | Small print, legends, deltas |
| `text-micro` | 11px | DM Sans or mono | Axis ticks, chart labels |

Large standalone numbers use proportional figures. Use `font-mono tabular-nums` only where numbers line up in a column (tables, axis ticks). Labels are sentence case; do not use uppercase tracked labels in new work.

### Shape and elevation

`rounded-control` (10px) for buttons, inputs and segmented tracks; `rounded-tile` (14px) for stat tiles and inner panels; `rounded-card` (16px) for cards. Borders are 1px `border-line`. The only shadow is `shadow-popover` for tooltips and menus. Spacing uses Tailwind's 4px scale: 24px between page sections, 16px between tiles, 20–32px card padding.

## Primitives

Import from `@/components/ui`.

- **`Button`**: `variant` `primary` (one per region, mint) · `secondary` (default) · `ghost`; `size` `sm` (32px) · `md` (36px); optional `icon`. Defaults to `type="button"`. Icon-only buttons need `aria-label`. `buttonClassName()` gives links the same look.
- **`Card`** and **`CardHeader`**: the standard container (`padding` `md` or `lg`) and its serif title with optional subtitle and actions.
- **`SegmentedControl`**: two to five mutually exclusive options as `aria-pressed` buttons inside a labeled group. `size="sm"` for in-card toggles; `fullWidth` for phone filter rows (44px targets).
- **`Chip`**: a dismissible active filter. Its accessible name is `"<dismissLabel>: <label>"`.
- **`DeltaIndicator`**: arrow plus signed text; `tone` says whether the change is good for the reader (more spending is `negative` even though it goes up).
- **`LegendKey`**: a series key whose mark mirrors the chart mark (square for bars and areas, line or dashed line for lines, dot for markers). Text stays ink.
- **`EmptyState`**, **`Skeleton`**: the empty/error message and the first-load placeholder. Refetches keep the previous render dimmed instead of flashing a skeleton.

## Data visualization

- Series colors are fixed by meaning: income aqua, spending orange, saved blue. Nominal lists (such as spending categories) use one color, not a color per row.
- Two or more series get a legend; a single series is named by its title.
- Lines are 2px; bars at most 24px wide with 4px rounded outer ends, square at the baseline, and a 2px gap between stacked segments; end dots have a 2px ring in the surface color.
- Gridlines and axes are solid hairlines in `--chart-grid`; the zero line uses `--chart-baseline`. Never dashed; dashes mean "estimated".
- Label selectively: the selected or latest value and the line end, never every point. Tooltips repeat what is reachable elsewhere; they never gate a value.
- Do not force a y-axis to zero when the story is change (net worth); do start bars at zero.

## Accessibility

Text 4.5:1, marks 3:1, touch targets 44px on phones, visible focus (global `:focus-visible` ring in `globals.css`), real buttons with `aria-pressed` for toggles, `aria-label` on icon-only controls, and `prefers-reduced-motion` respected for decorative animation.

## Migrating older components

Panels written before this system use raw classes such as `bg-[var(--bg-secondary)]` and uppercase tracked labels. They already pick up the new colors. When touching one, swap raw classes for semantic utilities (`bg-surface`, `text-ink-muted`, `border-line`), replace hand-rolled buttons and toggles with `Button` and `SegmentedControl`, and replace uppercase labels with `CardHeader`.
