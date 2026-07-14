# Plaid Pricing

Plaid rates for OtterMint's production account. All rates are **per connected account, per month**
(not per Item/institution). An account is a single checking/savings/brokerage account; one linked
institution (Item) can expose several accounts, each billed separately.

## Rate card

| Product | Rate | Notes |
|---|---|---|
| **Transactions** | $0.30 / connected account / month | Required at link (`products: [Transactions]`) |
| **Investments — Holdings** | $0.18 / connected account / month | Enabled via `optional_products: [Investments]` |
| **Investments — Transactions** | $0.35 / connected account / month | Separate from Holdings; only billed if `/investments/transactions/*` is called |
| **Liabilities** | $0.20 / connected account / month | Not currently used |

These are subscription products: an account keeps accruing its monthly fee for as long as the Item
exists, regardless of how often it's synced. Sync frequency does not affect cost.

## What OtterMint uses today

Link config: `src/app/api/plaid/create-link-token/route.ts`

- **Transactions** — required. $0.30/account/month on every connected account.
- **Investments (Holdings)** — `optional_products`, attached only when the institution supports it.
  $0.18/account/month on investment accounts.

OtterMint does **not** use Investments Transactions ($0.35) or Liabilities ($0.20).

## Cost hygiene

When an account/institution is unlinked in the app, call Plaid `/item/remove` so the Item stops
existing — otherwise its accounts keep accruing monthly subscription fees.

## Source of truth

Live rates and current Item/account counts: [Plaid Dashboard → Billing](https://dashboard.plaid.com/).
Rates above are from the account's rate sheet as of 2026-07.
