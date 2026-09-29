// Merchant-name normalization shared by recurring-charge detection and the
// enrichment of backfilled bank descriptors. Pure. The rules and the evidence
// behind them are in docs/plans/descriptor-enrichment.md (Decision Log).

// US states, DC and Canadian provinces, dropped from the end of a descriptor.
const REGION_CODES = new Set(
  (
    "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc " +
    "ab bc mb nb nl ns nt nu on pe qc sk yt"
  ).split(" ")
);

// Domain suffixes and corporate noise that carry no identity.
const NOISE_TOKENS = new Set(["com", "net", "org", "co", "io", "www", "http", "https", "inc", "llc", "ltd"]);

// Payment-processor phrases banks prepend to the real merchant.
const PROCESSOR_PREFIXES: string[][] = [
  ["aplpay"],
  ["applepay"],
  ["sq"],
  ["tst"],
  ["pp"],
  ["paypal"],
  ["gpay"],
  ["recurring", "card", "purchase"],
];

/**
 * The words that identify a merchant in a name or a bank descriptor: lower
 * case, letters only (store numbers, dates, phone numbers, URLs and
 * punctuation fall away), without domain and corporate noise, without a
 * leading payment-processor phrase, and without trailing state codes. The
 * same rules on both sides make "Trader Joe's" and "TRADER JOE S #273
 * 00SEATTLE WA" agree token for token.
 */
export function merchantTokens(text: string): string[] {
  let tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token));
  for (const prefix of PROCESSOR_PREFIXES) {
    if (prefix.length < tokens.length && prefix.every((word, i) => tokens[i] === word)) {
      tokens = tokens.slice(prefix.length);
      break;
    }
  }
  while (tokens.length > 1 && REGION_CODES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

/** Grouping key: the merchant name's tokens when Plaid supplied one, else the descriptor's. */
export function merchantKey(row: { merchantName: string | null; name: string }): string {
  const base = row.merchantName?.trim() || row.name;
  return merchantTokens(base).join(" ");
}
