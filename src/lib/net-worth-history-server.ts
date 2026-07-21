import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  accounts,
  groupMembers,
  groupNetWorthSnapshots,
  manualAccounts,
  userNetWorthCoverageEvents,
  userNetWorthSnapshots,
} from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/with-user";
import {
  normalizeNetWorthHistory,
  type CoverageAdjustedHistory,
  type CoverageAnnotation,
  type CoverageEventInput,
  type CoverageSourceType,
  type NetWorthSnapshotRow,
} from "@/lib/net-worth-history";

export interface NetWorthHistoryResponse {
  snapshots: NetWorthSnapshotRow[];
  coverageEvents: CoverageAnnotation[];
  periodChange: CoverageAdjustedHistory["periodChange"];
}

function utcDate(value: Date): string {
  return value.toISOString().split("T")[0];
}

function sourceType(value: string): CoverageSourceType | null {
  return value === "plaid_account" || value === "manual_account" ? value : null;
}

function toEvent(row: typeof userNetWorthCoverageEvents.$inferSelect): CoverageEventInput | null {
  const validSourceType = sourceType(row.sourceType);
  if (!validSourceType) return null;
  return {
    effectiveDate: row.effectiveDate,
    sourceType: validSourceType,
    sourceId: row.sourceId,
    assetAdjustment: row.assetAdjustment,
    liabilityAdjustment: row.liabilityAdjustment,
  };
}

export async function buildUserNetWorthHistory(
  userId: string,
  startDate: string,
  executor: DbExecutor
): Promise<NetWorthHistoryResponse> {
  const [snapshots, eventRows, plaidAccounts, userManualAccounts] =
    await Promise.all([
      executor
        .select()
        .from(userNetWorthSnapshots)
        .where(
          and(
            eq(userNetWorthSnapshots.userId, userId),
            gte(userNetWorthSnapshots.date, startDate)
          )
        )
        .orderBy(asc(userNetWorthSnapshots.date)),
      executor
        .select()
        .from(userNetWorthCoverageEvents)
        .where(
          and(
            eq(userNetWorthCoverageEvents.userId, userId),
            gte(userNetWorthCoverageEvents.effectiveDate, startDate)
          )
        )
        .orderBy(asc(userNetWorthCoverageEvents.effectiveDate)),
      executor
        .select({
          accountId: accounts.accountId,
          createdAt: accounts.createdAt,
        })
        .from(accounts)
        .where(eq(accounts.userId, userId)),
      executor
        .select({
          id: manualAccounts.id,
          createdAt: manualAccounts.createdAt,
        })
        .from(manualAccounts)
        .where(eq(manualAccounts.userId, userId)),
    ]);

  const events = eventRows.map(toEvent).filter((event) => event !== null);
  const capturedSources = new Set(
    events.map((event) => `${event.sourceType}:${event.sourceId}`)
  );
  const possibleLegacyBoundaries = [
    ...plaidAccounts
      .filter(
        (account) =>
          !capturedSources.has(`plaid_account:${account.accountId}`)
      )
      .map((account) => utcDate(account.createdAt)),
    ...userManualAccounts
      .filter(
        (account) =>
          !capturedSources.has(`manual_account:${account.id}`)
      )
      .map((account) => utcDate(account.createdAt)),
  ];

  return normalizeNetWorthHistory({
    snapshots,
    events,
    possibleLegacyBoundaries,
  }) as NetWorthHistoryResponse;
}

export async function buildGroupNetWorthHistory(
  groupId: string,
  startDate: string,
  executor: DbExecutor
): Promise<NetWorthHistoryResponse> {
  const members = await executor
    .select({
      userId: groupMembers.userId,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  const memberIds = members.map((member) => member.userId);

  const [snapshots, plaidAccounts, groupManualAccounts] = await Promise.all([
    executor
      .select()
      .from(groupNetWorthSnapshots)
      .where(
        and(
          eq(groupNetWorthSnapshots.groupId, groupId),
          gte(groupNetWorthSnapshots.date, startDate)
        )
      )
      .orderBy(asc(groupNetWorthSnapshots.date)),
    memberIds.length === 0
      ? Promise.resolve([])
      : executor
          .select({ createdAt: accounts.createdAt })
          .from(accounts)
          .where(inArray(accounts.userId, memberIds)),
    memberIds.length === 0
      ? Promise.resolve([])
      : executor
          .select({ createdAt: manualAccounts.createdAt })
          .from(manualAccounts)
          .where(inArray(manualAccounts.userId, memberIds)),
  ]);

  const history = normalizeNetWorthHistory({
    snapshots,
    events: [],
    possibleLegacyBoundaries: [
      ...members.map((member) => utcDate(member.joinedAt)),
      ...plaidAccounts.map((account) => utcDate(account.createdAt)),
      ...groupManualAccounts.map((account) => utcDate(account.createdAt)),
    ],
  });

  return {
    snapshots: history.snapshots.map((point) => ({
      ...point,
      adjustedTotalAssets: null,
      adjustedTotalLiabilities: null,
      adjustedNetWorth: null,
    })),
    coverageEvents: history.coverageEvents.map((event) => ({
      ...event,
      assetAdjustment: null,
      liabilityAdjustment: null,
      netWorthAdjustment: null,
      sourceCount: null,
      label: "Household coverage changed",
    })),
    periodChange:
      history.periodChange === null
        ? null
        : { reported: history.periodChange.reported, normalized: null },
  };
}
