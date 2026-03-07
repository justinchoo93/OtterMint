# OtterFin UX Design: Auth, Profiles, Groups & Sharing

## Overview & Design Philosophy

OtterFin is evolving from a single-user personal finance dashboard to one that can support
households — couples, families, or any group of people who want a unified financial picture.

This document covers UX for three phases:
- **Phase 1 (build now)**: Individual accounts + groups with full sharing (all of a member's
  data is visible to the group by default when they join)
- **Phase 2 (future)**: Per-account sharing controls (choose which accounts are shared with
  which groups)
- **Phase 3 (future)**: Advanced features (roles, permissions, deduplication of joint accounts)

**Guiding principles**:
1. **Solo mode is the default** — the app works identically to today if you never create or
   join a group. Group UI never intrudes on users who don't want it.
2. **Explicit consent before sharing** — joining a group is a deliberate act; users are
   told clearly what data they're sharing at the moment they join.
3. **Household tab, not merged view** — your finances and the group's finances stay visually
   separate. You always know what you're looking at.
4. **Consistent dark theme** — all new screens match the existing design system.

---

## Screen Inventory

| Screen | Route | Who Sees It |
|---|---|---|
| Login | `/login` | Unauthenticated users |
| Registration | `/register` | New users |
| MFA Verification | `/auth/mfa-verify` | Users with MFA enabled, post-login |
| Dashboard — My Finances | `/` | Authenticated, always |
| Dashboard — Household | `/` (Household tab) | Group members only |
| Profile & Settings | `/settings/profile` | Authenticated, always |
| Group Settings | `/settings/group` | Authenticated, always (shows create/join if no group) |
| Sharing Settings | `/settings/sharing` | Authenticated, always |
| Accept Invite | `/invite/[token]` | Anyone with a valid invite link |
| Shared View | `/shared/[token]` | Anyone with a valid share token (no auth) |
| Privacy Policy | `/privacy` | Anyone (no auth) |

---

## Flow 1: Authentication

### 1A. Login

**Route**: `/login`

**Layout**: Centered card (max-w-sm) on `bg-primary`.

```
┌──────────────────────────────────────┐
│  otterfin                            │
│  personal finance dashboard          │
│                                      │
│  Email                               │
│  [                              ]    │
│                                      │
│  Password              Forgot?       │
│  [                              ]    │
│                                      │
│  [          Sign in          ]       │
│                                      │
│  Don't have an account? Get started  │
└──────────────────────────────────────┘
```

**Behavior**:
- POST to `/api/auth/login`
- On failure: inline error below form — "Incorrect email or password" (deliberately vague)
- After 5 failures: "Too many attempts. Try again in X minutes." (lockout, not just warning)
- On success: redirect to `/` (or originally-requested URL via `?redirect=` param)
- "Forgot?" → password reset flow (out of scope for Phase 1, but link must exist)
- "Get started" → `/register`

**No OAuth in Phase 1**. Email + password only.

### 1B. Registration

**Route**: `/register`

**Layout**: Same centered card.

```
┌──────────────────────────────────────┐
│  otterfin                            │
│  Create your account                 │
│                                      │
│  Name *                              │
│  [                              ]    │
│                                      │
│  Email *                             │
│  [                              ]    │
│                                      │
│  Password *           (min 8 chars)  │
│  [                              ]    │
│                                      │
│  Confirm password *                  │
│  [                              ]    │
│                                      │
│  [        Create account        ]    │
│                                      │
│  Already have an account? Sign in    │
└──────────────────────────────────────┘
```

**Behavior**:
- Password requirement hint appears on focus, not on page load
- On success: create session, redirect to `/` with onboarding banner active
- If URL contains `?invite=[token]`: remember token in session, post-registration redirect
  goes to `/invite/[token]` instead of `/`

---

## Flow 2: First-Run Onboarding

After registration, the dashboard is empty but immediately usable. A single dismissible
banner guides the user to connect their first account. No wizards, no modals, no tours.

**Trigger**: `onboarding_dismissed` flag on user record is false.

### 2A. Empty Dashboard State

```
┌──────────────────────────────────────────────────────────────────────┐
│  otterfin  dashboard                       [Refresh] [+ Connect] [JK▾]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Welcome to OtterFin.                                            │ │
│  │  Connect your first bank account to see your net worth.          │ │
│  │                                                                  │ │
│  │  [+ Connect Account]                            [Maybe later ×] │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌── Net Worth ──────────────────────────────────────────────────────┐ │
│  │  $0.00                                                            │ │
│  │  Assets $0.00   Liabilities $0.00                                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  (empty states for each panel below)                                   │
└──────────────────────────────────────────────────────────────────────┘
```

- Banner: `bg-secondary`, 4px left border in `accent-blue`, rounded-xl
- "+ Connect Account" opens Plaid Link (same behavior as existing header button)
- "Maybe later ×" sets `onboarding_dismissed = true`, banner never returns
- After first successful Plaid connection: banner auto-dismisses

**What is NOT shown during onboarding**: no mention of groups, sharing, or household
features. Let the user see their data first.

---

## Flow 3: Header & Navigation

The current header has: wordmark + "dashboard" label | Refresh button | Connect Account button.

New header adds a user avatar menu on the right:

```
┌──────────────────────────────────────────────────────────────────────┐
│  otterfin  dashboard               [Refresh] [+ Connect Account] [JK▾]│
└──────────────────────────────────────────────────────────────────────┘
```

When in a group with data to show, tabs appear between wordmark and action buttons:

```
┌──────────────────────────────────────────────────────────────────────┐
│  otterfin   [My Finances] [Household]         [Refresh] [+ Connect] [JK▾]│
└──────────────────────────────────────────────────────────────────────┘
```

### Avatar Dropdown [JK▾]

- "JK" = user's initials, 28px circle, `bg-tertiary`
- Dropdown (below, aligned right):
  - Profile & Settings
  - Group & Sharing
  - Sign out

"Group & Sharing" is always visible in the dropdown (not gated by a feature flag). Users
need a clear way to discover and enter the group feature.

---

## Flow 4: Profile & Settings

**Route**: `/settings/profile`

**Layout**: `max-w-2xl` centered, section cards, "← Dashboard" back link at top.

### Section: Identity
- Display name (text input) — shown to group members
- Email (read-only)
- [Save changes] button

### Section: Security
- [Change password] — expands inline:
  - Current password
  - New password
  - Confirm new password
  - [Save] [Cancel]

### Section: Two-Factor Authentication (MFA)

TOTP-based two-factor authentication using an authenticator app (Google Authenticator,
1Password, etc.).

**State: MFA disabled**:

```
┌── Two-factor authentication ──────────────────────────────────────┐
│  [Set up two-factor authentication]                                │
└────────────────────────────────────────────────────────────────────┘
```

Clicking "Set up" triggers a two-step inline flow:

**Step 1 — QR code + recovery codes**:
```
│  Scan this QR code with your authenticator app:                    │
│  [QR CODE IMAGE]                                                   │
│  Manual entry key: JBSWY3DPEHPK3PXP                               │
│                                                                    │
│  Save these recovery codes somewhere safe:                         │
│  a1b2c3d4   e5f6a7b8   c9d0e1f2   ...  (8 codes)                 │
│                                                                    │
│  Enter the 6-digit code from your app to verify:                  │
│  [      ]   [Verify & Enable]                                     │
```

- Recovery codes shown once, never retrievable again
- User must verify a code before MFA is actually enabled
- On success: MFA badge appears in section header, setup UI collapses

**State: MFA enabled**:
```
┌── Two-factor authentication ─── [Enabled] ────────────────────────┐
│  [Disable two-factor authentication]                               │
└────────────────────────────────────────────────────────────────────┘
```

- "Disable" expands inline, requires a valid TOTP code to confirm
- Prevents unauthorized removal if session is compromised

**MFA verification during login** (`/auth/mfa-verify`):

After successful email/password login, if the user has MFA enabled, they are redirected
to a standalone verification page:

```
┌──────────────────────────────────────┐
│  otterfin                            │
│  Two-factor authentication           │
│                                      │
│  Enter code from authenticator app   │
│  [                              ]    │
│                                      │
│  [          Verify             ]     │
│                                      │
│  Use a recovery code instead         │
└──────────────────────────────────────┘
```

- Toggle between authenticator code (6-digit numeric) and recovery code (8-char hex)
- Recovery codes are single-use — consumed on verification
- On success: redirects to `/` (or original `?redirect=` destination)

### Section: Account Deletion

```
┌── Danger zone ────────────────────────────────────────────────────┐
│  [Delete account]                                                  │
└────────────────────────────────────────────────────────────────────┘
```

- Confirmation required before deletion
- Revokes all Plaid access tokens before deleting user data
- Deletes all user data (accounts, transactions, holdings, manual accounts, share links,
  net worth snapshots, group memberships, sessions) via database cascades
- Clears session cookie and redirects to `/login`

### Section: Sessions
- [Sign out] — ends current session, redirects to `/login`
- [Sign out all devices] — invalidates all active sessions

---

## Flow 5: Groups

### Phase 1 Sharing Model

When a user joins a group, **all of their accounts and data are shared with the group**.
This is stated clearly at the point of joining. There are no per-account toggles in Phase 1.

The tradeoff: simpler to understand and build. The downside (some accounts you don't want
shared) is addressed in Phase 2.

### 5A. Group Settings — No Group Yet

**Route**: `/settings/group`

```
┌──────────────────────────────────────────────────────┐
│  ← Dashboard                                         │
│                                                      │
│  Group & Sharing                                     │
│  ──────────────────────────────────────────────────  │
│  See your household's full financial picture in one  │
│  place. Invite a partner, family member, or anyone   │
│  you share finances with.                            │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Create a group                              │   │
│  │  You'll be the owner. Invite others to join. │   │
│  │  [Create group]                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Join an existing group                      │   │
│  │  Have an invite link? Paste it below.        │   │
│  │  [  https://otterfin.app/invite/...  ] [Join]│   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- "Create group" → creates group immediately, transitions to Group Settings (5B)
- "Join" → validates token, goes to Invite Accept screen (5D) pre-populated

### 5B. Group Settings — Has Group

**Route**: `/settings/group`

```
┌───────────────────────────────────────────────────────────────┐
│  ← Dashboard                                                  │
│                                                               │
│  Group & Sharing                                              │
│                                                               │
│  ┌── MEMBERS ───────────────────────────────────────────────┐ │
│  │  Justin Kim   justin@...   Owner    Jan 2025             │ │
│  │  Sarah Kim    sarah@...    Member   Feb 2025   [Remove]  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌── INVITE ─────────────────────────────────────────────────┐ │
│  │  [  email address  ]           [Send invite email]        │ │
│  │                                                           │ │
│  │  Or share this link (expires in 7 days):                  │ │
│  │  https://otterfin.app/invite/abc123    [Copy] [Regenerate]│ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌── SHARED DATA ────────────────────────────────────────────┐ │
│  │  In Phase 1, joining this group means all of your         │ │
│  │  accounts and transactions are visible to other members.  │ │
│  │                                                           │ │
│  │  Per-account controls are coming in a future update.      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌── DANGER ZONE ────────────────────────────────────────────┐ │
│  │  [Leave group]    (owner sees [Disband group] instead)    │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Member roles**:
- Owner: can invite, remove members, regenerate invite link, disband group
- Member: can view group, leave group

**Remove member**: confirmation modal — "Remove Sarah Kim from the group? They'll lose
access to the household view." [Cancel] [Remove]

**Disband group** (owner only): confirmation modal — "This will remove all members and
delete the group. This cannot be undone." [Cancel] [Disband]

**Leave group**: confirmation — "You'll lose access to the household view, and your
accounts will no longer be visible to group members." [Cancel] [Leave]

**Invite link**: always shown, regenerable. Same link until regenerated or expired (7 days).
After regeneration, the old link is immediately invalid.

### 5C. Invite Accept Screen

**Route**: `/invite/[token]`

**State A — Logged in, no existing group**:

```
┌──────────────────────────────────────────────┐
│  otterfin                                    │
│                                              │
│  Justin Kim invited you to join their        │
│  household group on OtterFin.                │
│                                              │
│  By joining, all of your connected accounts  │
│  and transactions will be visible to group   │
│  members. You can leave the group at any     │
│  time from Settings.                         │
│                                              │
│  [Accept invitation]     [No thanks]         │
└──────────────────────────────────────────────┘
```

- "Accept" → joins group, redirects to `/` with Household tab now visible
- "No thanks" → redirects to `/`

**State B — Logged in, already in a group**:

```
│  You're already in a group. Leave your current group first  │
│  if you'd like to join this one.                            │
│                                                             │
│  [Go to Group Settings]     [Cancel]                        │
```

**State C — Not logged in**:

Show invite context (who invited them, the sharing disclosure), then:

```
│  Sign in or create an account to accept this invitation.  │
│  [Sign in]    [Create account]                            │
```

After auth, redirect back to `/invite/[token]` to complete the acceptance flow.

**State D — Token expired or invalid**:

```
│  This invite link has expired or is no longer valid.  │
│  Contact the person who sent it for a new one.        │
```

### 5D. Connecting Accounts in a Group Context

When a user is in a group and connects a new Plaid account or adds a manual account, the
normal flow is unchanged. No extra confirmation needed — they already consented when joining.

After connecting, a subtle inline note appears at the top of the Accounts panel:

```
  This account is visible to your household group.
```

This is informational only, not a warning. It reinforces the sharing model without being
alarming, and gives users a nudge to check Group Settings if they have second thoughts.

---

## Flow 6: The Household Dashboard Tab

Once a user is in a group, a "Household" tab appears in the header. This tab shows a
combined view of all group members' data.

### 6A. Household Tab — Net Worth Card

```
┌── Household Net Worth ──────────────────────────────────────────────┐
│  $1,847,320.42                                          3 members   │
│  Assets $2,100,000   Liabilities $252,679                           │
│                                                                      │
│  ── Member Breakdown ─────────────────────────────────────────────  │
│  Justin Kim          $1,200,000                                      │
│  Sarah Kim             $620,000                                      │
│  Alex Kim               $27,320                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Numbers are monospace, same styling as individual dashboard
- Member names link to their section in the accounts list below

### 6B. Household Tab — Accounts Panel

Accounts are grouped by member, then by type within each member's section:

```
┌── JUSTIN KIM ─────────────────────────────────────────────────────┐
│  CASH                                              $45,200         │
│    Chase Checking ····1234              Chase       $32,000        │
│    Marcus HYSA   ····5678              GS          $13,200        │
│                                                                    │
│  INVESTMENTS                                       $1,154,800      │
│    ...                                                             │
└────────────────────────────────────────────────────────────────────┘

┌── SARAH KIM ──────────────────────────────────────────────────────┐
│  ...                                                               │
└────────────────────────────────────────────────────────────────────┘
```

- Each member's section uses the same colored type headers as the individual dashboard
- No ability to connect or edit another member's accounts from this view
- If a member has no accounts, their section shows an empty state

### 6C. Household Tab — Transactions Feed

Combined transaction feed across all members, sorted by date:

```
│  [JK]  Coffee Shop         Food & Drink    -$5.40   Today   │
│  [SK]  Whole Foods          Groceries      -$87.22  Today   │
│  [JK]  Employer Direct Dep  Income        +$4,200   Today   │
```

- Small member initials badge ([JK], [SK]) prefixes each row
- All other styling identical to individual transaction feed

### 6D. Household Tab — Net Worth Chart

Single chart showing household combined net worth over time. Same Recharts component,
same 90-day window.

### 6E. Household Tab — Switching Back

"My Finances" tab is always the leftmost/default. Clicking it returns to the individual
dashboard with no state change. The tabs remember which was last active within a session.

---

## Flow 7: Adding Manual Accounts in a Group

Manual accounts behave the same as Plaid accounts — they're shared with the group.
The same subtle note appears after adding:

```
  This account is visible to your household group.
```

No change to the add/edit/delete flows themselves.

---

## Phase 2: Per-Account Sharing Controls (High-Level Sketch)

In Phase 1, joining a group means sharing everything. Phase 2 adds controls so users can
share some accounts but not others. This is the most-requested follow-on feature for
household finance apps (e.g., personal spending accounts you'd prefer to keep private).

### What Changes in Phase 2

**Group Settings** gains a new section:

```
┌── ACCOUNT SHARING ─────────────────────────────────────────────────┐
│  Control which of your accounts are visible to group members.      │
│                                                                     │
│  CASH                                                               │
│  [x] Chase Checking ····1234      [x] Marcus HYSA ····5678         │
│                                                                     │
│  CREDIT                                                             │
│  [x] Chase Sapphire ····9012      [ ] Amex Personal ····3456       │
│       (shared)                         (private)                   │
│                                                                     │
│  INVESTMENTS                                                        │
│  [x] Fidelity 401k ····7890                                        │
│                                                                     │
│  [Save preferences]                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

- Checkboxes per account, defaulting to checked (sharing on) for existing members
  to preserve Phase 1 behavior
- New accounts added after Phase 2 ships: default to checked (share with group)
- The "This account is visible to your household group" note on the dashboard
  becomes conditional per account

**Household tab**: only shows accounts the member has opted to share.

**Phase 1 → Phase 2 migration**: no data migration needed. The sharing flag defaults to
true for all existing accounts. Users can then opt specific accounts out.

### UX Constraint for Phase 1

The Phase 1 Group Settings UI must include the static "SHARED DATA" informational section
(designed above) so there's a clear location in the UI where per-account controls can be
added in Phase 2 without requiring a layout redesign.

---

## Phase 3: Advanced Features (High-Level Sketch)

Phase 3 addresses more complex household scenarios. No detailed UX design needed now,
but the Phase 1/2 design should not block these.

### Roles & Permissions

Beyond Owner/Member, potential roles:
- **View-only** — can see household data but cannot add/remove members
- **Contributor** — full member, but cannot manage the group

Phase 1 avoids hardcoding "Owner/Member" in ways that can't be extended. The member table
shows a Role column from day one (even though Phase 1 only has two values).

### Joint Account Deduplication

If Justin and Sarah both link the same Chase joint checking account, it would appear
twice in the Household view. Phase 3 needs a way to mark accounts as "joint" so they're
counted once.

**Phase 1 constraint**: the Household tab displays accounts grouped by member with no
deduplication. This is clearly a limitation, not a bug. Users should understand they may
see duplicates if both members link the same joint accounts.

A small note in the Household tab accounts panel:

```
  Note: If you and a group member share a joint account, it may appear twice.
```

### ~~External View-Only Links (Phase 3 candidate)~~ — Implemented

~~Ability to generate a read-only shareable link...~~ See Flow 8: External Share Links.

---

## Flow 8: External Share Links

**Status**: Built. Originally planned for Phase 3 but implemented early.

Read-only shareable links for financial advisors, accountants, or family members.
No OtterFin account required to view. Granular control over what data is exposed.

### 8A. Share Link Management

**Route**: `/settings/sharing`

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Dashboard                                                      │
│                                                                   │
│  Sharing                                                          │
│                                                                   │
│  ┌── CREATE NEW LINK ──────────────────────────────────────────┐ │
│  │  Label (optional)                                            │ │
│  │  [  For accountant                                      ]    │ │
│  │                                                              │ │
│  │  Include:                                                    │ │
│  │  [x] Net worth overview                                     │ │
│  │  [ ] Account balances                                       │ │
│  │  [ ] Transactions                                           │ │
│  │                                                              │ │
│  │  [Create share link]                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌── ACTIVE LINKS ─────────────────────────────────────────────┐ │
│  │  For accountant                                              │ │
│  │  [Net worth] [Balances]                   Expires: Apr 7     │ │
│  │  [Copy URL]                              [Revoke]            │ │
│  │                                                              │ │
│  │  Unnamed link                                                │ │
│  │  [Net worth]                              No expiration      │ │
│  │  [Copy URL]                              [Revoke]            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Behavior**:
- "Create share link" disabled if no data categories selected
- Each link has three independent toggles: net worth, balances, transactions
- Net worth defaults to checked; balances and transactions default to unchecked
- "Copy URL" copies `{origin}/shared/{token}` to clipboard, shows "Copied!" for 2s
- "Revoke" shows confirmation dialog; revocation is immediate and permanent (soft delete)
- Expiration is optional (null = never expires)

### 8B. Public Shared View

**Route**: `/shared/[token]` (no authentication required)

```
┌──────────────────────────────────────────────────────────────────┐
│  otterfin                                                         │
│  Justin Kim's finances  ·  For accountant                         │
│                                                                   │
│  ┌── Net Worth ────────────────────────────────────────────────┐ │
│  │  $245,320.00                                                 │ │
│  │  Assets $312,000    Liabilities $66,680                      │ │
│  │                                                              │ │
│  │  (90-day snapshot history)                                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌── Accounts ─────────────────────────────────────────────────┐ │
│  │  Chase Checking ····1234        Chase        $32,000         │ │
│  │  Marcus HYSA   ····5678        GS           $13,200         │ │
│  │  Home (manual)                               $250,000        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌── Recent Transactions ──────────────────────────────────────┐ │
│  │  (last 200 transactions, most recent first)                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Read-only view · Powered by OtterFin                             │
└──────────────────────────────────────────────────────────────────┘
```

- Sections conditionally rendered based on share link permissions
- Revoked links show "This link is no longer available"
- Expired links return 410 Gone with "This link has expired"
- Invalid tokens show 404

**Security measures**:
- Token: 256-bit cryptographically random, base64url encoded
- No sensitive data exposed (no access tokens, no full account numbers)
- Account masks show only last 4 digits
- Transactions capped at 200 most recent
- Net worth snapshots capped at 90 days
- Revocation is immediate (soft delete via `revokedAt` timestamp)
- Expiration checked on every access

---

## Flow 9: Privacy Policy

**Route**: `/privacy`

Static page documenting data practices. Accessible without authentication.

**Sections**:
1. What We Collect
2. How We Store Your Data (AES-256-GCM for Plaid tokens, bcrypt for passwords, TLS)
3. How We Use Your Data
4. Third-Party Services (Plaid)
5. Data Sharing (no selling, no third-party sharing)
6. Your Rights (access, deletion, export)
7. Data Retention (deleted on account deletion, sessions expire after 30 days)
8. Security (MFA, encryption at rest and in transit)
9. Contact

Linked from the profile/settings page.

---

## Navigation Architecture

```
/login                        ← unauthenticated entry
/register                     ← new account (or ?invite=[token] for pre-filled invite)
/auth/mfa-verify              ← MFA code entry (post-login, if MFA enabled)
/                             ← main dashboard (protected)
  └── [My Finances tab]       ← always default, current app behavior
  └── [Household tab]         ← only if user is in a group
/settings/profile             ← name, password, MFA, account deletion, sign out
/settings/group               ← group management (always accessible)
/settings/sharing             ← external share link management
/invite/[token]               ← group invite acceptance
/shared/[token]               ← public read-only shared view (no auth)
/privacy                      ← privacy policy (no auth)
```

---

## State Progression: A New User's Journey

| Milestone | Trigger | What They See |
|---|---|---|
| Account created | Registration | Empty dashboard + onboarding banner |
| First account connected | Plaid success | Dashboard with accounts, banner gone |
| Normal solo use | Ongoing | Personal dashboard only, no group UI visible |
| Enables MFA | Profile → Set up 2FA | QR code, recovery codes, verify flow |
| Logs in with MFA | Email/password success | MFA verification page before dashboard |
| Discovers group feature | Opens avatar menu → Group & Sharing | Create/join group screen |
| Creates group | Clicks Create | Group settings screen with invite link |
| Invites partner | Copies link, sends it | Partner receives link |
| Partner accepts | Clicks invite link | Partner is added, Household tab appears for both |
| Adding new account | Plaid or manual | Normal flow + "visible to group" note |
| Creates share link | Settings → Sharing | Link with granular data controls |
| Shares with advisor | Copies share link URL | Advisor sees read-only financial view |

---

## UI Patterns & Component Inventory

### Consistent with Existing App

- Card container: `rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]`
- Section labels: `text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]`
  with a 2×2 colored dot
- Numbers: JetBrains Mono, `tabular-nums`
- Hover rows: `transition-colors hover:bg-[var(--bg-hover)]`
- Error: `accent-red` / `accent-red-dim`
- Success: `accent-green` / `accent-green-dim`
- Loading skeleton: `bg-[var(--bg-tertiary)] animate-pulse-subtle`

### New Components

| Component | Where Used | Description |
|---|---|---|
| `AvatarButton` | Header | Initials circle + dropdown (Profile, Group, Sharing, Sign out) |
| `DashboardTabs` | Header | My Finances / Household tab bar; only rendered in group |
| `SettingsLayout` | `/settings/*` | Back-link + max-w-2xl + section card layout |
| `MemberRow` | Group settings | Member name, email, role badge, remove button |
| `InviteSection` | Group settings | Email input + copyable link + regenerate |
| `InviteAcceptCard` | `/invite/[token]` | Sharing disclosure + accept/decline |
| `HouseholdMemberSection` | Household tab | Collapsible member block in accounts panel |
| `MemberBadge` | Household transactions | [JK]-style initials badge per row |
| `ConfirmModal` | Remove/disband/leave/revoke | Generic "are you sure?" modal |
| `MfaSetup` | Profile settings | QR code display, recovery codes, verification input |
| `MfaVerifyPage` | `/auth/mfa-verify` | Standalone TOTP/recovery code entry |
| `ShareLinkForm` | Sharing settings | Label input + data category checkboxes + create |
| `ShareLinkRow` | Sharing settings | Active link with copy URL + revoke |
| `SharedView` | `/shared/[token]` | Public read-only financial data display |

### Form Behavior Standards

- Validate on blur, not on keystroke
- Required fields: `*` suffix on label
- Submit button: disabled (not spinning) while request in flight
- Field errors: `text-xs text-[var(--accent-red)]` below the input
- Success feedback: 2s toast, top-right, `bg-secondary` + green left border

---

## Key Design Decisions

**Why full sharing on join (Phase 1) instead of opt-in toggles?**
Simpler to reason about. "Joining the group means sharing everything" is a single clear
rule. Granular controls (Phase 2) are more useful once users have lived with the group
feature and understand what they actually want to hide. Starting with fine-grained controls
creates decision paralysis and hides the value of the household view.

**Why always show "Group & Sharing" in the avatar menu?**
Users need to be able to find the feature. Hiding it behind a feature flag means no
discoverability. If the feature is built, it should be findable.

**Why tabs instead of merging My Finances and Household?**
Clear separation prevents confusion. Seeing your partner's accounts mixed with yours
makes it hard to reason about your own financial position. The "My Finances" view
must always show only your data.

**Why member sections in the Household accounts panel (not merged by type)?**
In Phase 1 with no deduplication, merging by type creates the joint account double-count
problem with no visual signal. Grouping by member makes it obvious when duplication
is happening, and sets up the mental model for Phase 2/3 controls.

**Why were external share links built ahead of the original Phase 3 plan?**
Originally deferred due to data exposure risk. Built early with mitigations: granular
per-category controls (net worth / balances / transactions), 256-bit random tokens,
optional expiration, instant revocation, and capped data windows (90-day snapshots,
200 transactions). The risk is manageable with these controls in place.

**Why no OAuth in Phase 1?**
Adds complexity (token refresh, provider outages, account linking). Email + password
is sufficient. Add OAuth in Phase 2 or 3 if user demand justifies it.
