# Feature Spec: Analytics Dashboard + LLM Chat

**Status**: Planning
**Date**: 2026-03-06
**Author**: Justin + Claude

## Vision

A rich, visually pleasing financial analytics dashboard with an LLM-powered natural language interface. Users can explore historical trends, understand what's driving changes in their finances, and ask ad-hoc questions about their data in plain English.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM provider | BYOK (bring your own key) | No API cost to manage, no liability for data handling, user chooses their provider |
| LLM providers supported | Anthropic + OpenAI (minimum) | Cover the two major providers; Vercel AI SDK abstracts the difference |
| LLM data access | Function calling with full results | LLM sees query results to reason about them; more capable than query-parser-only |
| LLM data security | Typed query functions, userId injected server-side | LLM never generates raw SQL, never controls user scoping |
| Feature gating | User-level flag (`isAdmin` or similar) | LLM chat is gated to admin users only; safe to launch the product without exposing the feature |
| Charting library | Recharts (existing) | Defer charting library decision to Phase 3 if Recharts hits walls |
| Projections | Deferred | Separate planning effort; not in scope for this spec |
| Static analytics | Ungated | Attribution, spending trends, ratios — no third-party data sharing, available to all users |

## Privacy & Legal

### Current approach (personal use)
- Feature-flagged to admin users only
- BYOK model means OtterMint never operates an LLM API key on behalf of users
- User explicitly configures their own API key and provider, making an informed choice to send data

### Before public launch of LLM feature
- [ ] Review Plaid developer agreement on third-party data sharing with LLM providers
- [ ] Contact Plaid developer support for explicit guidance
- [ ] Draft privacy policy disclosing LLM data flow
- [ ] Add consent UI when user first enables the chat feature
- [ ] Legal review (GLBA applicability, state privacy laws)
- [ ] Evaluate query-parser-only mode as a privacy-safe alternative

### Architectural hedge
The function-calling layer is provider-agnostic and the result-passing behavior is configurable. If privacy requirements change, we can switch to query-parser-only mode (LLM translates natural language to structured params but never sees financial data) without rebuilding the infrastructure.

## Phasing

### Phase 0: Data Quality

**Goal**: Make the data trustworthy enough for analytics.

**Why first**: Every analytics view and every LLM query sits on top of transaction data. If categories are unreliable, everything built on them is unreliable.

#### 0a. Store detailed categories
- Add `categoryDetailed` column to `transactions` table
- Store `txn.personal_finance_category?.detailed` during sync (e.g., `FOOD_AND_DRINK_RESTAURANTS` instead of just `FOOD_AND_DRINK`)
- Existing transactions need a re-sync to backfill

#### 0b. Merchant normalization (stretch)
- Plaid merchant names are inconsistent (`UBER EATS`, `UberEats`, `UBER* EATS`)
- Consider storing a normalized `merchantNameClean` column
- Can defer this if analytics are scoped to categories initially

---

### Phase 1: Static Analytics Page

**Goal**: A standalone `/analytics` page with pre-built visualizations. No LLM. Useful on its own.

#### Information Architecture
- Separate page at `/analytics`, not tabs within the dashboard
- Single scrollable page with sticky section nav pills
- Global time range selector: `1M | 3M | 6M | 1Y | ALL` (applies to all charts)
- Navigation: Add "Analytics" link in header alongside existing dashboard

#### Sections (top to bottom)

**1. Summary Strip** — KPI cards in a row (2x2 on mobile)
- Net worth change (selected period): `+$4,230 (+3.2%)`
- Savings rate (income - spending / income)
- Assets:Liabilities ratio with spark-bar
- Top spending category with amount

**2. Net Worth Trends** — Multi-line chart with area fill
- Primary line: net worth (solid, blue, gradient fill)
- Secondary lines: total assets (green, dashed), total liabilities (red, dashed)
- Data source: existing `userNetWorthSnapshots` table
- Responds to global time range selector

**3. Net Worth Attribution** — Waterfall chart
- Shows what drove net worth change: `Start NW → +Deposits → +Investment gains → -Credit spending → End NW`
- Data source: diff two snapshot rows (start vs end of period), compute deltas per category
- Recharts doesn't have native waterfall — use stacked bar with invisible base segment
- This is the unique differentiator. No competitor does this well.

**4. Asset Allocation** — Donut chart
- Outer ring: breakdown by type (depository, investment, credit, loan, manual)
- Center text: total net worth
- Data source: latest snapshot row

**5. Spending Over Time** — Stacked area chart, monthly
- X-axis: months, Y-axis: dollars
- Top 5 categories stacked, rest as "Other"
- Requires new API endpoint with server-side aggregation (GROUP BY month + category)
- Uses `categoryDetailed` for better granularity

#### New API Endpoints
- `GET /api/analytics/spending-over-time?months=12&groupId=` — monthly spending by category
- `GET /api/analytics/attribution?startDate=X&endDate=Y` — net worth deltas per category
- `GET /api/analytics/ratios` — savings rate, debt-to-asset, liquidity ratio

#### New Schema
- `monthly_spending_summaries` table (pre-computed aggregations):
  ```
  userId, yearMonth, category, categoryDetailed, totalAmount, txnCount
  UNIQUE(userId, yearMonth, category)
  ```
- `account_balance_snapshots` table (per-account history):
  ```
  accountId, date, balance
  UNIQUE(accountId, date)
  ```
- Populated via nightly cron or triggered after each Plaid sync

---

### Phase 2: LLM Chat MVP

**Goal**: Natural language interface that answers factual lookback questions. No chart generation yet. Validate the interaction model.

#### BYOK Setup
- Settings page: user enters API key + selects provider (Anthropic / OpenAI)
- Keys stored encrypted in the database (user-level)
- Provider selection determines which Vercel AI SDK adapter to use
- If no key configured, chat UI shows setup prompt

#### Feature Flag
- `users` table gets a flag column (e.g., `flags JSONB` or `isAdmin BOOLEAN`)
- `/api/chat` endpoint checks flag, returns 403 if not authorized
- Chat UI hidden entirely for non-flagged users
- API-level enforcement, not just UI hiding

#### Chat Interface
- Bottom-anchored expandable panel on the analytics page
- Collapsed: 48px input bar with placeholder "Ask about your finances..."
- Expanded: ~400px panel with conversation history + input
- Conversation is ephemeral (client-side state only, no persistence)
- Suggested prompt pills when empty: "How has my spending changed?", "What's my biggest expense this month?"

#### Function Calling Tool Catalog
```typescript
// userId injected server-side, never from LLM
getNetWorthHistory(params: { days: number })
getSpendingByCategory(params: { startDate: string; endDate: string })
getSpendingTrend(params: { category?: string; months: number })
getTopMerchants(params: { startDate: string; endDate: string; limit?: number })
searchTransactions(params: { query: string; startDate?: string; endDate?: string; limit?: number })
getAccountBalances()
getHoldingsBreakdown()
getIncomeVsExpenses(params: { months: number })
getFinancialRatios()
```

Each function:
- Takes validated, Zod-typed parameters
- Is hard-scoped to authenticated user's data
- Returns structured data, truncated to ~50 rows max before sending to LLM
- Date ranges capped at 2 years, limits capped at 500

#### API Design
```
POST /api/chat
  Body: { message: string }
  Response: Server-Sent Events (SSE) stream

  Stream events:
    { type: "text", content: "partial text..." }
    { type: "tool_call", name: "getSpendingByCategory", params: {...} }
    { type: "tool_result", data: [...] }
    { type: "done" }
```

#### Cost Controls (user's API key, but still good practice)
- Conversation length cap: last 10 exchanges
- Result truncation before sending to LLM
- Per-user rate limit: 30 requests/hour

#### Phase 2 Query Priorities
| Query Type | Example | Value |
|---|---|---|
| Spending lookback | "What did I spend on dining last month?" | High |
| Merchant search | "How much at Amazon this year?" | High |
| Category comparison | "Am I spending more on food vs last month?" | High |
| Net worth delta | "How did my net worth change in January?" | High |
| Balance summary | "What's my total credit card debt?" | Medium |
| Holdings check | "What's my largest holding?" | Medium |

---

### Phase 3: Chart Generation + Advanced Analytics

**Goal**: LLM generates interactive charts inline in the conversation. Users can pin charts to their analytics page.

#### Chart Spec Format
```typescript
interface ChartSpec {
  type: "line" | "bar" | "pie" | "area" | "stacked-bar"
  title: string
  data: Array<Record<string, string | number>>
  xKey: string
  yKeys: Array<{ key: string; label: string; color?: string }>
  xLabel?: string
  yLabel?: string
  yFormat?: "currency" | "percent" | "number"
}
```

- LLM returns chart spec alongside text response
- `<DynamicChart>` component renders it using Recharts (or replacement if needed)
- Charts are interactive (hover tooltips, etc.), not images
- "Pin to dashboard" button on each generated chart

#### Pinned Charts
- New `pinned_charts` table: `{ id, userId, chartSpec (JSON), label, createdAt }`
- Pinned charts appear in a "Your Charts" section at the top of the analytics page
- CRUD via `/api/analytics/pinned-charts`

#### Evaluate Charting Library
- If Recharts can't handle the dynamic chart rendering well, evaluate alternatives (Nivo, Observable Plot, raw SVG)
- Decision made based on Phase 2 experience

---

### Phase 4: Household + Automation (Future)

- Household analytics (all charts working for group view)
- Contribution breakdown per household member
- Proactive weekly digests (LLM-generated)
- Anomaly detection alerts
- Saved/recurring queries

---

## Technical Notes

### Stack Additions
- `ai` (Vercel AI SDK) — provider-agnostic LLM integration with streaming + tool calling
- `simple-statistics` — linear regression, moving averages (when projections are added)
- No vector database, no queue system, no RAG

### Performance
- Postgres handles concurrent reads/writes fine (not SQLite)
- Pre-aggregated summary tables keep analytics queries fast
- LLM latency (1-5s) is the bottleneck, not DB queries — streaming solves perceived latency
- Lazy-load chart sections with IntersectionObserver on analytics page

### Indexes to Add
- `(user_id, year_month)` on `monthly_spending_summaries`
- `(account_id, date)` on `account_balance_snapshots`
- Consider GIN trigram index on `transactions.merchant_name` for full-text search if needed

## Open Items
- [ ] Projections: separate planning effort (deferred)
- [ ] Category correction UI: let users override Plaid's categorization (Phase 0b/1)
- [ ] Merchant normalization strategy (Phase 0b)
- [ ] Chat persistence: currently ephemeral. Add `chat_messages` table if needed later
