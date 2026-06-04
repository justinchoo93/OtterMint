# Devil's Advocate Review: Auth, Profiles, Groups & Sharing

**Reviewer role**: Devil's advocate — looking for gaps, contradictions, over-engineering, and YAGNI violations.

**Documents reviewed**: ux-design.md, architecture.md, SPEC.md, BUGS.md, schema.ts

---

## Summary Judgment

Both documents are solid. The architect did real work and the UX designer clearly thought about progressive disclosure. But they diverge on a few important points, and one of those divergences has a correct answer that neither document fully commits to. There are also several YAGNI violations and a few places where the design papers over genuine complexity without resolving it.

---

## Critical Issues

### C1: The Auth Model Divergence Is Unresolved (Architecture wins, but incompletely)

**The conflict**: UX says Supabase Auth. Architect says custom JWT (because postgres.js can't run in Edge middleware).

**The architect is right** that postgres.js doesn't run in the Edge runtime, which means you cannot do a DB-round-trip session validation in middleware. But the architect's recommended solution — JWT with a blocklist in Redis for revocation — introduces a dependency (Redis) that this project doesn't have, for a feature (instant revocation) that a household finance tool barely needs.

The UX's "Supabase Auth" suggestion also isn't fully thought through: Supabase Auth issues its own JWTs, but the middleware still can't call Supabase's auth API from Edge runtime without using their `@supabase/ssr` package and their specific middleware pattern. This is a real integration concern that was waved away.

**What's missing from both documents**: A clear, committed answer to the following question:

> Will middleware run in Edge runtime or Node.js runtime?

If Node.js runtime: you can use DB sessions with postgres.js, no JWT complexity. Slightly slower cold starts on Vercel, but this is a household app, not a high-traffic API.

If Edge runtime: you need JWTs. The architect's approach is correct but the Redis revocation complexity is overkill for this use case. Accept the tradeoff: logout clears the cookie, sessions expire in 30 days, true forced-revocation isn't needed.

**Action required before implementation**: Decide on runtime, write it down, eliminate the ambiguity.

---

### C2: The Sharing Model Has a Phase 1 / Phase 2 Split That Neither Document Implements Correctly

**User's stated requirement**: Phase 1 = all accounts shared with group by default. Phase 2 = per-account sharing controls.

**UX design**: Implements Phase 2 (per-user, per-data-type toggles: net worth / balances / transactions) with everything defaulting OFF. This is the future-state design, not Phase 1.

**Architecture**: Implements no sharing toggles at all — just aggregates all group members' data for group snapshots. This is closer to Phase 1 but doesn't acknowledge the Phase 2 path.

**The problem**: These are in direct conflict. The schema doesn't have a `sharing_preferences` table or any columns to track what a user has chosen to share. The architect's group net worth query (`inArray(plaidItems.userId, memberIds)`) just pulls everything from all members — there's no filter for "only members who have opted in."

If you build the UX's toggle UI but there's no schema support for it, the toggles are fake. If you build the schema for sharing preferences but ship Phase 1 first (all-shared), you're building schema you won't use yet.

**Recommendation**: Pick one and be explicit about it. Phase 1 = no toggles, all shared, mark a TODO for Phase 2. The schema does NOT need a `sharing_preferences` table in Phase 1. The UX should not show toggles in Phase 1. Add a comment in the code where Phase 2 hooks would go.

---

### C3: External Share Links Are a Significant Feature With Zero Schema Support

**The UX** proposes a full external sharing system (Flow 5): public URLs, per-share config (what data is included), expiry dates, a management UI, revocation. This is a non-trivial feature.

**The architecture** doesn't mention it at all. No `share_links` table, no `/api/share-links` routes, no `/shared/[token]` route handler.

The UX flags this behind a `SHARING_ENABLED` feature flag, which partially papers over the gap, but a feature flag doesn't make the missing implementation disappear.

**Assessment**: This is either out of scope for this design phase (correct) or it's in scope and the architect dropped it (a problem). The team needs to decide. If it's in scope, the schema needs a `share_links` table and the architecture needs to address how the public `/shared/[token]` route works without authentication.

If it's out of scope for now: the UX should mark it clearly as "Phase 2+ only" rather than designing it in detail and hiding it behind a flag. The current design gives the impression it's imminent.

---

## Major Issues

### M1: The `households`/Profiles Concept vs. Direct User Ownership

**UX** refers to "household group" as the organizing concept. **Architecture** uses direct user-to-data ownership (users own plaid_items and manual_accounts).

These aren't in conflict — the UX is describing the UX metaphor, not the data model. But the UX design uses the word "household" in user-visible strings throughout (`/settings/group` heading is "Household Group", the household tab, etc.), implying a stronger concept than the architecture actually implements.

**The concern**: If "household" becomes a first-class concept in the UX vocabulary, users will expect it to behave like a household — e.g., "why can't my household own an account?" The architecture's model is "users own data, groups just aggregate." That's the right model for Phase 1, but the UX copy should match the actual behavior.

**Recommendation**: Soften "Household" to "Group" in user-visible strings, or make sure the product is comfortable explaining the distinction when users ask why they can't add a joint account to the household.

---

### M2: Group Net Worth Snapshot Computation Is Underspecified

**The architecture's `computeSnapshot` for groups** just pulls all plaid accounts and manual accounts for all member user IDs and aggregates them. This works in Phase 1 (all shared) but has a correctness problem in Phase 2 when sharing toggles exist: the aggregation ignores sharing preferences and always includes everything.

More immediately: the `group_net_worth_snapshots` table will hold the same data as the sum of `user_net_worth_snapshots` for all members. **This is redundant data.** The group snapshot could be computed on-the-fly by summing the user snapshots, which avoids double-writing and the consistency problem of "what if one user's snapshot hasn't been computed yet today?"

**Question neither document answers**: When is the group snapshot computed? During each user's refresh? After all members refresh? What if only one member refreshed today — is the group snapshot for today valid?

---

### M3: The UX Sharing Toggles Are Per-User-Per-Data-Type, But The Architecture Has No Granularity

**UX toggles**: net worth / account balances / transactions (three independent toggles per user).

**Architecture**: One group net worth snapshot that includes... everything? The architect doesn't model what "I share my net worth but not my balances" means at the data layer.

If someone shares net worth but not balances, the group snapshot can show their contribution to total net worth, but the member breakdown on the Household tab shouldn't show their account names. The architecture's group snapshot schema has no way to represent "this member's data is included at the summary level only."

This is a Phase 2 problem (Phase 1 = all shared), but if the schema is being designed now, it should at least have a comment about where this hook would go, or it'll require a schema change later.

---

### M4: Feature Flags Are Environment Variables — This Is Wrong for Multi-User

**UX design**: `GROUPS_ENABLED` and `SHARING_ENABLED` as environment variables.

**The problem**: Environment variables are process-wide. When this app has multiple users, you can't enable groups for some users and not others using env vars. This is fine for "we're not launching groups yet" but breaks as soon as you want to roll out groups gradually or control access per-user or per-deployment.

**For Phase 1**: env vars are fine and simple. But the name `GROUPS_ENABLED` implies a future where you'd want per-user control, which env vars can't provide.

**Recommendation**: Use env vars for now, but name them something that signals they're deployment-level flags, not user-level (e.g., `FEATURE_GROUPS`, `FEATURE_SHARING`). Don't design the UX as if these are per-user toggles — they're global.

---

### M5: The `onboarding_completed` Flag Has No Schema Support

**UX design**: Tracks onboarding state via an `onboarding_completed` flag on the user record.

**Architecture schema**: The `users` table has no such field.

This is a small gap but it's a gap. Either add it to the schema or track it differently (e.g., "onboarding is complete if the user has at least one linked plaid_item"). The implicit approach (detect from data state) is actually more robust and doesn't require a migration, but it's not articulated anywhere.

---

## Minor Issues

### m1: The UX Invites Both Email and Link, But the Schema Only Tracks Email

**Architecture schema**: `group_invitations.invited_email` is `notNull()`. But the UX shows both email invitations and shareable link invitations, where the link invite has no specific email target.

If someone generates a link and shares it via SMS, `invited_email` needs to be nullable (or you store a placeholder, which is worse).

**Fix**: Make `invited_email` nullable in `group_invitations`.

---

### m2: Password Reset Is a Dead End in Both Documents

**UX**: "Forgot password?" link exists on the login screen. The design says: "not designed here, but the link must exist to avoid dead ends."

**Architecture**: No password reset flow, no `password_reset_tokens` table, no route for it.

Password reset requires either: (a) an email sending infrastructure, or (b) an admin-reset mechanism. This app has no email infrastructure designed anywhere. The link will go to a dead end unless this is addressed.

**Recommendation**: If email infra is out of scope for Phase 1, don't show the "Forgot password?" link at all, or show it disabled with a note. A link that goes nowhere is worse than no link. Add a `password_reset_tokens` table to the schema backlog.

---

### m3: "Sign Out All Devices" Requires Server-Side Sessions, But JWT Architecture Complicates It

**UX**: "Sign out all devices" in profile settings.

**Architecture**: If using JWTs stored in HttpOnly cookies, "sign out all devices" is not straightforward. JWTs are stateless — you can't revoke them from the server without a blocklist. The architect notes this ("for true revocation, maintain a short blocklist in Redis") but frames it as optional.

"Sign out all devices" implies you can actually revoke all active sessions. If the JWT approach is used without a blocklist, this button can't work as described. The UX should either remove it or note that it's only available if the session store supports it.

---

### m4: Groups Table Has a `name` Field That The UX Never Uses

**Architecture schema**: `groups.name` is `notNull()`.

**UX**: Creating a group has no name input. The user clicks "Create group" and it's created. There's no field for naming the group.

Where does the name come from? Presumably auto-generated ("Justin's Household"?) or defaulted to the owner's display name. This is a minor gap but the schema enforces non-null, so something needs to supply a value at creation time.

---

### m5: The Household Tab Visibility Condition Is Fragile

**UX**: The Household tab is shown when "user is in a group AND at least one other member has shared at least one data type."

**Architecture**: No sharing preferences exist in Phase 1 — all data is always shared. So the condition "at least one other member has shared at least one data type" is either always true (once there's another member) or undefined (because sharing preferences don't exist yet).

This is a Phase 1 vs. Phase 2 confusion bleeding into the UX logic. In Phase 1, the simpler rule is: "show Household tab if user is in a group with at least one other member."

---

## What The Designs Get Right

To be balanced: both documents get the important things right.

- **The auth stack choice** (custom JWT + bcrypt + HttpOnly cookies) is the correct call for this app. Supabase Auth would add dependency complexity without meaningful benefit.
- **Direct user ownership** (users own plaid_items, not groups) is the right data model. Groups as aggregation views, not ownership containers, is architecturally sound.
- **Progressive disclosure in UX** is well-thought-out. The solo-user experience being untouched by group features is important.
- **Migration strategy** in the architecture is careful and correct — nullable column, backfill, then NOT NULL constraint.
- **The invite expiry and external share link UX** are well-considered from a security standpoint.
- **Phase 5 deferral of groups** in the architecture migration plan is the right call — ship auth first, groups later.

---

---

## Additional Concerns: Plaid, Security, Performance, Edge Cases, Cost

### Security: Can Group Members Access Each Other's Plaid Tokens?

**Short answer**: Not with the proposed architecture — but only because the API routes filter by `userId`. There is no column-level security or row-level security in the schema itself.

**The risk**: All Plaid access tokens live in `plaid_items.access_token_encrypted`, owned by individual users. The group net worth computation query (`inArray(plaidItems.userId, memberIds)`) touches financial balances for all members. It does NOT touch the access tokens directly, so group members cannot extract tokens through the designed API.

**However**: This security property is maintained entirely by application-layer filtering. There's no database-level enforcement. A bug in any group-related route (e.g., accidentally joining the wrong table or missing a WHERE clause) could expose one user's data to another.

**Recommendation**: Add Postgres row-level security (RLS) on `plaid_items` scoped to `user_id`. Supabase supports this natively. Belt-and-suspenders, but for financial data with real access tokens it's worth it.

---

### Plaid-Specific: `client_user_id` Strategy Under Multi-User

Plaid's `client_user_id` is currently set to the hardcoded string "justin" in the existing `create-link-token` route. In a multi-user world, this must become the authenticated user's UUID.

More importantly: Plaid uses `client_user_id` for identity linking across institutions in their risk models. If all users share the same `client_user_id` (or if it's not set per-user), Plaid may treat all linked accounts as belonging to one person, which affects their fraud detection and may violate their terms of service.

**What competitors do**: Monarch Money and Copilot both issue one Plaid Link session per user with that user's ID as `client_user_id`. There is no concept of "household-level" Plaid items — each person re-links their own accounts.

**Implication for joint accounts**: If Justin and Sarah both have access to the same joint checking account and both connect it through Plaid, you will have **two separate Plaid items pointing to the same underlying account**. Plaid will sync the same transactions twice. The architecture has no deduplication strategy for this. The `accounts.account_id` is Plaid's identifier — it will be the same for the same underlying account if both users link the same institution. The UNIQUE constraint on `accounts.account_id` will cause the second insert to fail.

**This is a real Phase 1 bug waiting to happen.** Two people in a household connecting the same bank will hit a FK/unique violation on `accounts.account_id`. The migration needs a plan for this.

---

### Plaid-Specific: Rate Limits and Refresh Costs

The current refresh pipeline calls Plaid for every user's items independently. In a group of two people, a "Refresh" click on the Household tab could trigger Plaid API calls for all members' items — potentially 2x or more the API calls.

Plaid's production pricing is per-item, per-month. More users = more Plaid items = more cost. This is expected, but it means the group refresh should be careful not to double-refresh items that were recently refreshed by the owner. The existing 2-hour staleness check (`last_refreshed_at`) already handles this per-item, but it needs to hold across users, not just per-user refresh cycles.

**Recommendation**: The staleness check is on `accounts.last_refreshed_at` (per-account, not per-user). This already prevents double-refresh within 2 hours regardless of who triggers it. This is fine — but it should be documented as intentional.

---

### Edge Case: What Happens When a Member Leaves a Group?

**Architecture**: `DELETE /api/groups/:groupId/members/:userId` removes the member row. The member's `plaid_items` and financial data are unaffected (correct — they own their data directly).

**What's not specified**: Does the group snapshot history remain? If Sarah was in a group with Justin for 3 months and then leaves, the `group_net_worth_snapshots` for those 3 months still include her contributions. The Household tab history will show inflated numbers for the period she was a member.

**Options**:
1. Leave history as-is (her past data stays in the group snapshot). Simple, but potentially confusing.
2. Delete group snapshots on member removal and recompute. Expensive and potentially impossible for old dates (Plaid data may have been deleted).
3. Store per-member contribution in snapshots so it can be removed. Significant schema change.

**Recommendation**: Option 1 with a UI note. "Historical data may include members who have since left." Don't recompute. Mark it as a known limitation.

---

### Edge Case: What Happens to a User's Data When They Delete Their Account?

Neither document addresses account deletion. The `users` table has `ON DELETE CASCADE` on `plaid_items` and `manual_accounts`, which means deleting a user deletes all their financial data.

**If the user is a group owner**: `groups.created_by_user_id` references `users.id` but does NOT have `ON DELETE CASCADE`. Deleting the owner user will fail with a foreign key violation. The group won't be deleted automatically.

**Fix needed**: Either add `ON DELETE SET NULL` on `groups.created_by_user_id` (then handle ownerless groups) or add application-layer logic to transfer ownership or disband the group before account deletion.

---

### Edge Case: Invite Accepted by Someone Already in a Group

The architecture's invitation acceptance route adds the user to the group. But the UX says "a user can be in at most one group." What happens if someone accepts an invite when they're already in a group?

The `group_members` table has a unique constraint on `(group_id, user_id)` but not a unique constraint on `user_id` alone. There's nothing preventing a user from being in multiple groups at the database level. The "one group per user" constraint is purely application-layer, and it's not mentioned in the architecture.

---

### Performance: Group Query Complexity

The architect's group net worth computation does three separate queries: one for members, one for plaid accounts (with join), one for manual accounts. For a small household (2-4 people) this is fine.

The `group_net_worth_snapshots` table addresses the "don't recompute on every page load" concern — the refresh pipeline computes and stores the snapshot. But the architecture is vague on when this computation happens: "group net worth aggregation to refresh pipeline" is mentioned in Phase 5 of the migration but not explained. Does every user's refresh trigger a group snapshot recompute? What if members refresh at different times?

**The stale group snapshot problem**: User A refreshes at 9am. User B refreshes at 2pm. The group snapshot from 9am includes User A's new data but User B's old data. By 2pm, User B's refresh should update the group snapshot — but only if the refresh pipeline knows to do this.

**Recommendation**: On each user's refresh completion, recompute the group snapshot if the user is a group member. This is simple and correct. Document it explicitly.

---

### YAGNI: What Can Be Cut Entirely From Phase 1?

The team said "Phase 1 simplified: all accounts shared with group by default." Given that, what is genuinely needed for Phase 1 vs. what's future work?

**Genuinely needed for Phase 1**:
- `users`, `sessions` tables
- Auth routes (register, login, logout, me)
- JWT middleware
- `userId` FK on `plaid_items`, `manual_accounts`
- `user_net_worth_snapshots` (replaces ownerless snapshots)
- `groups`, `group_members`, `group_invitations` tables
- Group create/invite/accept/leave routes
- Household tab showing aggregate net worth

**Not needed until Phase 2** (and adding them now is YAGNI):
- Sharing preference toggles and their schema
- External share links (`share_links` table, `/shared/[token]` routes)
- `group_net_worth_snapshots` with per-type breakdowns — in Phase 1 you can compute group net worth on-the-fly from user snapshots
- "Sign out all devices" (requires more session infrastructure than the JWT approach supports cleanly)

**Borderline** (useful but deferrable):
- `onboarding_completed` flag (can infer from plaid_items count)
- Per-member visibility in Household tab breakdown (can show all members' net worth since all is shared in Phase 1)

---

### Cost: More Users = More Plaid Items = More Money

Plaid charges per linked item, per month. Current single-user setup: Justin's items, one bill. With groups:

- Each person links their own accounts separately — each person's items are their own
- A household of 2 people each with 3 institutions = 6 Plaid items vs. the current ~3
- This is expected and correct — but it means the app's Plaid costs scale linearly with users

No mitigation needed; just important to note that multi-user isn't "free." The Plaid sandbox won't surface this, but production billing will.

---

### Competitive Context: How Monarch Money and Others Handle This

**Monarch Money**: Full household model. One subscription, both partners connect their own accounts. Joint accounts can be "synced" — Monarch detects duplicate transactions from joint accounts and offers to merge them. Per-account sharing controls exist. This is the Phase 2 model the UX is aiming for.

**Copilot**: Individual-first. Household sharing was added later. Each user maintains their own account; sharing is opt-in.

**YNAB**: Built around the household from day one — one shared budget that multiple people can access. Very different model (budget-first vs. net-worth-first).

**Takeaway**: OtterMint's proposed model (individual-first, groups as optional overlay) is the right call for a personal finance dashboard. The risk is that users who know Monarch will expect Monarch-level sophistication (joint account deduplication, per-account sharing) and be disappointed by Phase 1. Set expectations appropriately.

The joint account deduplication problem that Monarch solves is genuinely hard and should be explicitly out of scope for Phase 1 with a note in the spec.

---

## Recommended Resolution Actions (Priority Order)

1. **[Critical]** Decide: Edge runtime or Node.js runtime for middleware. Document the choice. Adjust JWT vs. DB session approach accordingly.
2. **[Critical]** Reconcile Phase 1 vs. Phase 2 sharing model. Remove sharing toggles from Phase 1 UX. Mark Phase 2 hooks in code comments, not schema.
3. **[Critical]** Decide if external share links are in scope for this implementation phase. If not, remove from UX spec or clearly label as out-of-scope future work.
4. **[Critical]** Fix the joint account deduplication problem: the UNIQUE constraint on `accounts.account_id` will cause a FK violation when two group members link the same financial institution. The architecture needs a strategy (skip duplicate, warn user, or merge).
5. **[Critical]** Fix `groups.created_by_user_id` — needs `ON DELETE SET NULL` or `ON DELETE CASCADE` plus application logic to handle group ownership when a user deletes their account. As written, deleting a user who owns a group will fail.
6. **[Major]** Fix `group_invitations.invited_email` to nullable (link-only invites have no email).
7. **[Major]** Add `onboarding_completed` to the users table schema, or document the implicit "has at least one plaid_item" approach.
8. **[Major]** Specify the group snapshot computation timing: trigger recompute on each member's refresh. Document this explicitly.
9. **[Major]** Remove or disable "Forgot password?" until email infrastructure is designed.
10. **[Major]** Add application-layer enforcement of "one group per user" constraint — the schema does not enforce this.
11. **[Major]** Add Postgres RLS on `plaid_items` scoped to `user_id` as belt-and-suspenders for access token security.
12. **[Minor]** Specify how `groups.name` gets populated at creation time (auto-generate or prompt).
13. **[Minor]** Simplify Household tab visibility condition to match Phase 1 reality (show if in group with at least one other member).
14. **[Minor]** Rename env flags to `FEATURE_GROUPS` / `FEATURE_SHARING` to signal deployment-level scope.
15. **[Minor]** Document joint account deduplication as explicitly out of scope for Phase 1. Set user expectations.
16. **[Minor]** Document group snapshot history retention policy when a member leaves (keep as-is with UI note).
