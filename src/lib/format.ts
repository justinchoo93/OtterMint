const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return currencyFormatter.format(num);
}

function toNumber(amount: number | string | null | undefined): number {
  if (amount == null) return 0;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return Number.isFinite(num) ? num : 0;
}

const wholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "$396,516"; negatives "-$1,200"; missing or unparseable input "$0". */
export function formatWholeCurrency(amount: number | string | null | undefined): string {
  const rounded = Math.round(toNumber(amount));
  return wholeFormatter.format(rounded === 0 ? 0 : rounded);
}

/** "+$27,555", "-$1,200", and "$0" when the rounded value is zero. */
export function formatSignedWholeCurrency(amount: number | string | null | undefined): string {
  const rounded = Math.round(toNumber(amount));
  if (rounded === 0) return "$0";
  return rounded > 0 ? `+${wholeFormatter.format(rounded)}` : wholeFormatter.format(rounded);
}

/** Axis and end-label form: "$950", "$7.5k", "$397k", "$1.24M". */
export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 && Math.round(abs) !== 0 ? "-" : "";
  let body: string;
  if (abs < 1000) {
    body = String(Math.round(abs));
  } else if (abs < 100_000) {
    body = `${Number((abs / 1000).toFixed(1))}k`;
  } else if (Math.round(abs / 1000) < 1000) {
    body = `${Math.round(abs / 1000)}k`;
  } else {
    body = `${(abs / 1_000_000).toFixed(2)}M`;
  }
  return `${sign}$${body}`;
}

/** "+7.5%", "-8.2%", "0.0%". Uses a hyphen-minus, like formatCurrency. */
export function formatSignedPercent(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}%`;
}

/** A change in percentage points: "+4.5 pts", "-0.8 pts", "0.0 pts". */
export function formatSignedPoints(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  const body =
    rounded === 0 ? (0).toFixed(digits) : `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}`;
  return `${body} pts`;
}
