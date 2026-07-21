import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  groupMembers,
  manualAccounts,
} from "@/lib/db/schema";
import {
  computeSnapshot,
  saveGroupSnapshot,
  saveUserSnapshot,
  type SnapshotData,
} from "@/lib/compute-snapshot";
import {
  computeGroupCoverageFingerprint,
  computeUserCoverageFingerprint,
} from "@/lib/net-worth-history";
import type { DbExecutor } from "@/lib/db/with-user";

export async function recomputeUserNetWorthSnapshot(
  userId: string,
  executor: DbExecutor
): Promise<SnapshotData> {
  const plaidAccounts = await executor
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const userManualAccounts = await executor
    .select()
    .from(manualAccounts)
    .where(eq(manualAccounts.userId, userId));

  const snapshot = computeSnapshot(plaidAccounts, userManualAccounts);
  const coverageFingerprint = computeUserCoverageFingerprint(
    plaidAccounts.map((account) => account.accountId),
    userManualAccounts.map((account) => account.id)
  );
  await saveUserSnapshot(userId, snapshot, coverageFingerprint, executor);
  return snapshot;
}

export async function recomputeGroupNetWorthSnapshot(
  groupId: string,
  executor: DbExecutor
): Promise<SnapshotData | null> {
  const members = await executor
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  const memberIds = members.map((member) => member.userId);
  if (memberIds.length === 0) return null;

  const plaidAccounts = await executor
    .select()
    .from(accounts)
    .where(inArray(accounts.userId, memberIds));
  const groupManualAccounts = await executor
    .select()
    .from(manualAccounts)
    .where(inArray(manualAccounts.userId, memberIds));

  const snapshot = computeSnapshot(plaidAccounts, groupManualAccounts);
  const coverageFingerprint = computeGroupCoverageFingerprint(
    memberIds,
    plaidAccounts.map((account) => account.accountId),
    groupManualAccounts.map((account) => account.id)
  );
  await saveGroupSnapshot(groupId, snapshot, coverageFingerprint, executor);
  return snapshot;
}

export async function recomputeGroupNetWorthSnapshotsForUser(
  userId: string,
  executor: DbExecutor
): Promise<void> {
  const memberships = await executor
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  for (const { groupId } of memberships) {
    await recomputeGroupNetWorthSnapshot(groupId, executor);
  }
}
