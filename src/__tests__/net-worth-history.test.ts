import { describe, expect, it } from "vitest";
import {
  computeGroupCoverageFingerprint,
  computeUserCoverageFingerprint,
  manualCoverageContribution,
  normalizeNetWorthHistory,
  plaidCoverageContribution,
  type CanonicalSnapshot,
  type CoverageEventInput,
} from "@/lib/net-worth-history";

function snapshot(
  date: string,
  assets: string,
  liabilities = "0.00",
  coverageFingerprint: string | null = null
): CanonicalSnapshot {
  return {
    date,
    totalAssets: assets,
    totalLiabilities: liabilities,
    netWorth: (Number(assets) - Number(liabilities)).toFixed(2),
    coverageFingerprint,
  };
}

function event(
  effectiveDate: string,
  assetAdjustment: string,
  liabilityAdjustment = "0.00"
): CoverageEventInput {
  return {
    effectiveDate,
    sourceType: "plaid_account",
    sourceId: `source-${effectiveDate}`,
    assetAdjustment,
    liabilityAdjustment,
  };
}

describe("coverage fingerprints", () => {
  it("is order-independent and sensitive to source identity", () => {
    const first = computeUserCoverageFingerprint(["a", "b"], [2, 1]);
    const reordered = computeUserCoverageFingerprint(["b", "a"], [1, 2]);
    const changed = computeUserCoverageFingerprint(["a", "c"], [1, 2]);

    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
  });

  it("namespaces member, plaid, and manual identifiers", () => {
    const grouped = computeGroupCoverageFingerprint(["1"], ["1"], [1]);
    const withoutMember = computeGroupCoverageFingerprint([], ["1"], [1]);
    const withoutPlaid = computeGroupCoverageFingerprint(["1"], [], [1]);

    expect(grouped).not.toBe(withoutMember);
    expect(grouped).not.toBe(withoutPlaid);
  });
});

describe("coverage contributions", () => {
  it("preserves a negative depository balance as a negative asset", () => {
    expect(
      plaidCoverageContribution({
        accountId: "checking",
        type: "depository",
        currentBalance: "-150.00",
      })
    ).toEqual({
      sourceType: "plaid_account",
      sourceId: "checking",
      assetAdjustment: "-150.00",
      liabilityAdjustment: "0.00",
    });
  });

  it("maps credit and manual liabilities to liability adjustments", () => {
    expect(
      plaidCoverageContribution({
        accountId: "card",
        type: "credit",
        currentBalance: "50000.00",
      }).liabilityAdjustment
    ).toBe("50000.00");
    expect(
      manualCoverageContribution({ id: 7, type: "liability", balance: "25.00" })
    ).toMatchObject({
      sourceType: "manual_account",
      sourceId: "7",
      assetAdjustment: "0.00",
      liabilityAdjustment: "25.00",
    });
  });
});

describe("normalizeNetWorthHistory", () => {
  it("normalizes a captured existing asset without changing raw values", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [
        snapshot("2026-07-01", "0.00", "0.00", "before"),
        snapshot("2026-07-05", "600000.00", "0.00", "after"),
      ],
      events: [event("2026-07-05", "600000.00")],
    });

    expect(history.snapshots[0]).toMatchObject({
      netWorth: "0.00",
      adjustedNetWorth: "600000.00",
      quality: "flat_normalized",
      coverageSegment: 0,
      comparisonSegment: 0,
    });
    expect(history.snapshots[1]).toMatchObject({
      netWorth: "600000.00",
      adjustedNetWorth: "600000.00",
      quality: "observed",
      coverageSegment: 1,
      comparisonSegment: 0,
    });
    expect(history.periodChange).toEqual({
      reported: "600000.00",
      normalized: "0.00",
    });
    expect(history.coverageEvents[0]).toMatchObject({
      kind: "captured_addition",
      netWorthAdjustment: "600000.00",
      sourceCount: 1,
    });
  });

  it("normalizes a captured liability in the correct direction", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [
        snapshot("2026-07-01", "100000.00", "0.00", "before"),
        snapshot("2026-07-05", "100000.00", "50000.00", "after"),
      ],
      events: [event("2026-07-05", "0.00", "50000.00")],
    });

    expect(history.snapshots[0].adjustedTotalLiabilities).toBe("50000.00");
    expect(history.snapshots[0].adjustedNetWorth).toBe("50000.00");
    expect(history.periodChange?.normalized).toBe("0.00");
  });

  it("applies multiple later additions exactly once", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [
        snapshot("2026-07-01", "100.00", "0.00", "a"),
        snapshot("2026-07-05", "300.00", "0.00", "b"),
        snapshot("2026-07-10", "350.00", "50.00", "c"),
      ],
      events: [
        event("2026-07-05", "200.00"),
        event("2026-07-10", "50.00", "50.00"),
      ],
    });

    expect(history.snapshots.map((point) => point.adjustedNetWorth)).toEqual([
      "300.00",
      "300.00",
      "300.00",
    ]);
    expect(history.snapshots.at(-1)?.adjustedNetWorth).toBe(
      history.snapshots.at(-1)?.netWorth
    );
  });

  it("splits an unexplained fingerprint change and suppresses period comparison", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [
        snapshot("2026-07-01", "100.00", "0.00", "before"),
        snapshot("2026-07-05", "50.00", "0.00", "after-delete"),
      ],
      events: [],
    });

    expect(history.snapshots[1]).toMatchObject({
      coverageSegment: 1,
      comparisonSegment: 1,
    });
    expect(history.periodChange?.normalized).toBeNull();
    expect(history.coverageEvents[0]).toMatchObject({
      kind: "coverage_unknown",
      netWorthAdjustment: null,
    });
  });

  it("isolates a legacy same-day point instead of claiming an exact boundary", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [
        snapshot("2026-07-01", "0.00"),
        snapshot("2026-07-05", "0.00"),
        snapshot("2026-07-10", "600000.00"),
      ],
      events: [],
      possibleLegacyBoundaries: ["2026-07-05"],
    });

    expect(history.snapshots.map((point) => point.coverageSegment)).toEqual([
      0, 1, 2,
    ]);
    expect(history.snapshots.map((point) => point.comparisonSegment)).toEqual([
      0, 1, 2,
    ]);
    expect(history.coverageEvents.every((item) => item.kind === "legacy_unknown")).toBe(
      true
    );
  });

  it("returns no period change for fewer than two points", () => {
    const history = normalizeNetWorthHistory({
      snapshots: [snapshot("2026-07-01", "100.00", "0.00", "known")],
      events: [],
    });

    expect(history.periodChange).toBeNull();
  });
});
