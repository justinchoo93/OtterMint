import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountsPanel } from "@/components/dashboard/AccountsPanel";
import type { AccountWithInstitution } from "@/app/api/accounts/route";
import type { ManualAccountRow } from "@/app/api/manual-accounts/route";

function manualAccount(
  overrides: Partial<ManualAccountRow> = {}
): ManualAccountRow {
  return {
    id: 1,
    name: "Home Equity",
    type: "asset",
    subtype: "real estate",
    balance: "250000.00",
    isoCurrencyCode: "USD",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function plaidAccount(
  overrides: Partial<AccountWithInstitution> = {}
): AccountWithInstitution {
  return {
    id: 1,
    accountId: "plaid-account-1",
    name: "Checking",
    officialName: null,
    type: "depository",
    subtype: "checking",
    mask: "1234",
    currentBalance: "1000.00",
    availableBalance: "900.00",
    limitAmount: null,
    isoCurrencyCode: "USD",
    lastRefreshedAt: null,
    institutionName: "Test Bank",
    errorCode: null,
    ...overrides,
  };
}

describe("AccountsPanel", () => {
  it("renders manual accounts when there are no Plaid accounts", () => {
    render(
      <AccountsPanel
        accounts={[]}
        manualAccounts={[
          manualAccount(),
          manualAccount({
            id: 2,
            name: "Private Loan",
            type: "liability",
            subtype: "personal loan",
            balance: "5000.00",
          }),
        ]}
      />
    );

    expect(screen.getByText("Manual Assets")).toBeTruthy();
    expect(screen.getByText("Home Equity")).toBeTruthy();
    expect(screen.getByText("Manual Liabilities")).toBeTruthy();
    expect(screen.getByText("Private Loan")).toBeTruthy();
    expect(screen.queryByText("No accounts connected yet.")).toBeNull();
  });

  it("renders Plaid and manual account groups together", () => {
    render(
      <AccountsPanel
        accounts={[plaidAccount()]}
        manualAccounts={[manualAccount()]}
      />
    );

    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText("Checking")).toBeTruthy();
    expect(screen.getByText("Manual Assets")).toBeTruthy();
    expect(screen.getByText("Home Equity")).toBeTruthy();
  });
});
