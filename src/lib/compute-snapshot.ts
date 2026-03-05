import { db } from "@/lib/db";
import { userNetWorthSnapshots, groupNetWorthSnapshots } from "@/lib/db/schema";

export interface SnapshotData {
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  depositoryTotal: string;
  creditTotal: string;
  investmentTotal: string;
  loanTotal: string;
  manualAssetsTotal: string;
  manualLiabilitiesTotal: string;
}

interface PlaidAccount {
  type: string;
  currentBalance: string | null;
}

interface ManualAccount {
  type: string;
  balance: string;
}

function sumByType(
  accounts: PlaidAccount[],
  type: string
): number {
  return accounts
    .filter((a) => a.type === type)
    .reduce((sum, a) => sum + parseFloat(a.currentBalance ?? "0"), 0);
}

export function computeSnapshot(
  plaidAccounts: PlaidAccount[],
  manualAccounts: ManualAccount[]
): SnapshotData {
  const depositoryTotal = sumByType(plaidAccounts, "depository");
  const creditTotal = sumByType(plaidAccounts, "credit");
  const investmentTotal = sumByType(plaidAccounts, "investment");
  const loanTotal = sumByType(plaidAccounts, "loan");

  const manualAssetsTotal = manualAccounts
    .filter((a) => a.type === "asset")
    .reduce((sum, a) => sum + parseFloat(a.balance), 0);

  const manualLiabilitiesTotal = manualAccounts
    .filter((a) => a.type === "liability")
    .reduce((sum, a) => sum + parseFloat(a.balance), 0);

  const totalAssets = depositoryTotal + investmentTotal + manualAssetsTotal;
  const totalLiabilities = creditTotal + loanTotal + manualLiabilitiesTotal;
  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets: totalAssets.toFixed(2),
    totalLiabilities: totalLiabilities.toFixed(2),
    netWorth: netWorth.toFixed(2),
    depositoryTotal: depositoryTotal.toFixed(2),
    creditTotal: creditTotal.toFixed(2),
    investmentTotal: investmentTotal.toFixed(2),
    loanTotal: loanTotal.toFixed(2),
    manualAssetsTotal: manualAssetsTotal.toFixed(2),
    manualLiabilitiesTotal: manualLiabilitiesTotal.toFixed(2),
  };
}

function snapshotValues(data: SnapshotData) {
  return {
    totalAssets: data.totalAssets,
    totalLiabilities: data.totalLiabilities,
    netWorth: data.netWorth,
    depositoryTotal: data.depositoryTotal,
    creditTotal: data.creditTotal,
    investmentTotal: data.investmentTotal,
    loanTotal: data.loanTotal,
    manualAssetsTotal: data.manualAssetsTotal,
    manualLiabilitiesTotal: data.manualLiabilitiesTotal,
  };
}

export async function saveUserSnapshot(
  userId: string,
  data: SnapshotData
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  await db
    .insert(userNetWorthSnapshots)
    .values({
      userId,
      date: today,
      ...snapshotValues(data),
    })
    .onConflictDoUpdate({
      target: [userNetWorthSnapshots.userId, userNetWorthSnapshots.date],
      set: snapshotValues(data),
    });
}

export async function saveGroupSnapshot(
  groupId: string,
  data: SnapshotData
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  await db
    .insert(groupNetWorthSnapshots)
    .values({
      groupId,
      date: today,
      ...snapshotValues(data),
    })
    .onConflictDoUpdate({
      target: [groupNetWorthSnapshots.groupId, groupNetWorthSnapshots.date],
      set: snapshotValues(data),
    });
}
