import { createHash } from "node:crypto";

export type HistoryQuality =
  | "observed"
  | "flat_normalized"
  | "unknown_coverage";

export type CoverageSourceType = "plaid_account" | "manual_account";

export interface CoverageEventInput {
  effectiveDate: string;
  sourceType: CoverageSourceType;
  sourceId: string;
  assetAdjustment: string;
  liabilityAdjustment: string;
}

export interface CanonicalSnapshot {
  date: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  coverageFingerprint?: string | null;
}

export interface NetWorthHistoryPoint extends CanonicalSnapshot {
  adjustedTotalAssets: string | null;
  adjustedTotalLiabilities: string | null;
  adjustedNetWorth: string | null;
  quality: HistoryQuality;
  coverageSegment: number;
  comparisonSegment: number;
}

export interface NetWorthSnapshotRow extends NetWorthHistoryPoint {
  depositoryTotal: string | null;
  creditTotal: string | null;
  investmentTotal: string | null;
  loanTotal: string | null;
  manualAssetsTotal: string | null;
  manualLiabilitiesTotal: string | null;
}

export interface CoverageAnnotation {
  date: string;
  kind: "captured_addition" | "legacy_unknown" | "coverage_unknown";
  assetAdjustment: string | null;
  liabilityAdjustment: string | null;
  netWorthAdjustment: string | null;
  sourceCount: number | null;
  label: string;
}

export interface CoverageAdjustedHistory<
  T extends CanonicalSnapshot = CanonicalSnapshot,
> {
  snapshots: Array<T & NetWorthHistoryPoint>;
  coverageEvents: CoverageAnnotation[];
  periodChange: {
    reported: string;
    normalized: string | null;
  } | null;
}

interface PlaidContributionAccount {
  accountId: string;
  type: string;
  currentBalance: string | null;
}

interface ManualContributionAccount {
  id: number;
  type: string;
  balance: string;
}

function money(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function fixed(value: number): string {
  // Avoid serializing -0.00 after subtracting equal adjustments.
  return (Object.is(value, -0) ? 0 : value).toFixed(2);
}

function fingerprint(parts: string[]): string {
  return createHash("sha256").update([...parts].sort().join("\u001f")).digest("hex");
}

export function computeUserCoverageFingerprint(
  plaidAccountIds: string[],
  manualAccountIds: number[]
): string {
  return fingerprint([
    ...plaidAccountIds.map((id) => `plaid:${id}`),
    ...manualAccountIds.map((id) => `manual:${id}`),
  ]);
}

export function computeGroupCoverageFingerprint(
  memberIds: string[],
  plaidAccountIds: string[],
  manualAccountIds: number[]
): string {
  return fingerprint([
    ...memberIds.map((id) => `member:${id}`),
    ...plaidAccountIds.map((id) => `plaid:${id}`),
    ...manualAccountIds.map((id) => `manual:${id}`),
  ]);
}

export function plaidCoverageContribution(
  account: PlaidContributionAccount
): Omit<CoverageEventInput, "effectiveDate"> {
  const balance = money(account.currentBalance);
  const assetAdjustment =
    account.type === "depository" || account.type === "investment" ? balance : 0;
  const liabilityAdjustment =
    account.type === "credit" || account.type === "loan" ? balance : 0;

  return {
    sourceType: "plaid_account",
    sourceId: account.accountId,
    assetAdjustment: fixed(assetAdjustment),
    liabilityAdjustment: fixed(liabilityAdjustment),
  };
}

export function manualCoverageContribution(
  account: ManualContributionAccount
): Omit<CoverageEventInput, "effectiveDate"> {
  const balance = money(account.balance);
  return {
    sourceType: "manual_account",
    sourceId: String(account.id),
    assetAdjustment: fixed(account.type === "asset" ? balance : 0),
    liabilityAdjustment: fixed(account.type === "liability" ? balance : 0),
  };
}

function edgeTouchesBoundary(
  previousDate: string,
  currentDate: string,
  boundaryDates: string[]
): boolean {
  return boundaryDates.some(
    (date) => previousDate <= date && date <= currentDate
  );
}

function eventsForEdge(
  previousDate: string,
  currentDate: string,
  events: CoverageEventInput[]
): CoverageEventInput[] {
  return events.filter(
    (event) => previousDate < event.effectiveDate && event.effectiveDate <= currentDate
  );
}

function aggregateAnnotations(events: CoverageEventInput[]): CoverageAnnotation[] {
  const byDate = new Map<string, CoverageEventInput[]>();
  for (const event of events) {
    const current = byDate.get(event.effectiveDate) ?? [];
    current.push(event);
    byDate.set(event.effectiveDate, current);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sameDay]) => {
      const assets = sameDay.reduce(
        (sum, event) => sum + money(event.assetAdjustment),
        0
      );
      const liabilities = sameDay.reduce(
        (sum, event) => sum + money(event.liabilityAdjustment),
        0
      );
      return {
        date,
        kind: "captured_addition" as const,
        assetAdjustment: fixed(assets),
        liabilityAdjustment: fixed(liabilities),
        netWorthAdjustment: fixed(assets - liabilities),
        sourceCount: sameDay.length,
        label:
          sameDay.length === 1 ? "Account connected" : `${sameDay.length} accounts connected`,
      };
    });
}

export function normalizeNetWorthHistory<T extends CanonicalSnapshot>(input: {
  snapshots: T[];
  events: CoverageEventInput[];
  possibleLegacyBoundaries?: string[];
}): CoverageAdjustedHistory<T> {
  const snapshots = [...input.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const events = [...input.events].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  );
  const legacyBoundaries = [...(input.possibleLegacyBoundaries ?? [])].sort();
  const capturedAnnotations = aggregateAnnotations(events);
  const unknownAnnotations: CoverageAnnotation[] = [];

  let coverageSegment = 0;
  let comparisonSegment = 0;

  const points = snapshots.map((snapshot, index) => {
    let startsUnknownSegment = false;
    if (index > 0) {
      const previous = snapshots[index - 1];
      const fingerprintChanged =
        previous.coverageFingerprint !== snapshot.coverageFingerprint;
      const fingerprintUnknown =
        previous.coverageFingerprint == null || snapshot.coverageFingerprint == null;
      const touchesLegacy = edgeTouchesBoundary(
        previous.date,
        snapshot.date,
        legacyBoundaries
      );
      const edgeEvents = eventsForEdge(previous.date, snapshot.date, events);
      const hasReportedBoundary = fingerprintChanged || touchesLegacy;
      const explainedAddition =
        fingerprintChanged && !fingerprintUnknown && !touchesLegacy && edgeEvents.length > 0;
      const unknownBoundary = hasReportedBoundary && !explainedAddition;

      if (hasReportedBoundary) coverageSegment += 1;
      if (unknownBoundary) {
        comparisonSegment += 1;
        startsUnknownSegment = true;
        unknownAnnotations.push({
          date: touchesLegacy
            ? legacyBoundaries.find(
                (date) => previous.date <= date && date <= snapshot.date
              ) ?? snapshot.date
            : snapshot.date,
          kind: touchesLegacy ? "legacy_unknown" : "coverage_unknown",
          assetAdjustment: null,
          liabilityAdjustment: null,
          netWorthAdjustment: null,
          sourceCount: null,
          label: touchesLegacy
            ? "Coverage may have changed around this date"
            : "Coverage changed",
        });
      }
    }

    const laterEvents = events.filter(
      (event) => snapshot.date < event.effectiveDate
    );
    const assetAdjustment = laterEvents.reduce(
      (sum, event) => sum + money(event.assetAdjustment),
      0
    );
    const liabilityAdjustment = laterEvents.reduce(
      (sum, event) => sum + money(event.liabilityAdjustment),
      0
    );
    const adjustedAssets = money(snapshot.totalAssets) + assetAdjustment;
    const adjustedLiabilities =
      money(snapshot.totalLiabilities) + liabilityAdjustment;

    return {
      ...snapshot,
      adjustedTotalAssets: fixed(adjustedAssets),
      adjustedTotalLiabilities: fixed(adjustedLiabilities),
      adjustedNetWorth: fixed(adjustedAssets - adjustedLiabilities),
      quality: startsUnknownSegment
        ? "unknown_coverage"
        : laterEvents.length > 0
          ? "flat_normalized"
          : "observed",
      coverageSegment,
      comparisonSegment,
    } satisfies T & NetWorthHistoryPoint;
  });

  // Points in a comparison segment separated by unknown coverage are valid on
  // their own, but callers must not compute one period change across segments.
  const periodChange =
    points.length < 2
      ? null
      : {
          reported: fixed(
            money(points.at(-1)?.netWorth) - money(points[0].netWorth)
          ),
          normalized:
            points[0].comparisonSegment === points.at(-1)?.comparisonSegment
              ? fixed(
                  money(points.at(-1)?.adjustedNetWorth) -
                    money(points[0].adjustedNetWorth)
                )
              : null,
        };

  const annotations = [...capturedAnnotations, ...unknownAnnotations].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  return {
    snapshots: points,
    coverageEvents: annotations,
    periodChange,
  };
}
