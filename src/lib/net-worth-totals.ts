import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

export interface NetWorthTotals {
  assets: number;
  liabilities: number;
  netWorth: number;
  accountCount: number;
}

/**
 * Current totals from live account balances. Depository and investment
 * balances are assets; credit and loan balances are liabilities (absolute
 * value); manual accounts count by their asset or liability type. The
 * Dashboard card and the Analytics hero both use this so they always agree.
 */
export function computeNetWorthTotals(
  accounts: Pick<AccountWithInstitution, "type" | "currentBalance">[],
  manualAccounts: Pick<ManualAccountRow, "type" | "balance">[]
): NetWorthTotals {
  const plaidAssets = accounts
    .filter((a) => a.type === "depository" || a.type === "investment")
    .reduce((sum, a) => sum + parseFloat(a.currentBalance ?? "0"), 0);
  const plaidLiabilities = accounts
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((sum, a) => sum + Math.abs(parseFloat(a.currentBalance ?? "0")), 0);
  const manualAssets = manualAccounts
    .filter((a) => a.type === "asset")
    .reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const manualLiabilities = manualAccounts
    .filter((a) => a.type === "liability")
    .reduce((sum, a) => sum + Math.abs(parseFloat(a.balance)), 0);

  const assets = plaidAssets + manualAssets;
  const liabilities = plaidLiabilities + manualLiabilities;
  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    accountCount: accounts.length + manualAccounts.length,
  };
}
