-- RLS FULL ROLLOUT (Milestones 4-6 / Task 6B-2).
--
-- This hand-written, idempotent migration is the SINGLE SOURCE OF TRUTH for
-- the application's Row-Level Security: the non-superuser `app_user` role,
-- every grant it holds, ENABLE + FORCE RLS on all 13 application tables, every
-- per-user / group-aware policy, and every SECURITY DEFINER function used by
-- the pre-auth and public-token paths.
--
-- It SUPERSEDES:
--   * 0002_tranquil_morlocks.sql, which ran `ENABLE ROW LEVEL SECURITY` with
--     NO policies and no non-superuser role (so RLS was inert), and
--   * 0006_rls_prototype.sql, which added isolation policies on just two tables
--     (manual_accounts, plaid_items). Those two policies are re-declared here.
--
-- WARNING: RLS policies, the app_user role, and these functions are NOT modeled
-- by Drizzle. NEVER run `npm run db:push` once this has been applied — it would
-- silently DROP every policy and function below. All RLS DDL lives only in
-- hand-written, journaled migrations.
--
-- Safe to run twice: role creation is guarded; ENABLE/FORCE are no-ops when
-- already set; every policy is dropped before it is created; functions use
-- CREATE OR REPLACE; grants are idempotent by nature.
--
-- NOTE: every function signature uses `timestamptz`, matching the schema
-- (every timestamp column is declared withTimezone).

-- ===========================================================================
-- A. Role + grants
-- ===========================================================================
-- NOTE: 'app_user_local_pw' is a LOCAL DEVELOPMENT password ONLY. The
-- production credential is deploy-gated, provisioned/rotated at deploy time,
-- and must NOT be committed for prod.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'app_user_local_pw';
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, groups, group_members, group_invitations, share_links,
  plaid_items, accounts, transactions, holdings, manual_accounts,
  user_net_worth_snapshots, group_net_worth_snapshots
  TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;--> statement-breakpoint

-- ===========================================================================
-- B. Enable + FORCE RLS on all 13 tables.
--    FORCE makes the policies apply even to the table owner, so a stray
--    owner/superuser connection in development is also protected.
-- ===========================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE groups FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_invitations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE share_links FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE plaid_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE holdings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE manual_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE user_net_worth_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE user_net_worth_snapshots FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_net_worth_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE group_net_worth_snapshots FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ===========================================================================
-- B2. Group-membership helpers (SECURITY DEFINER, bypass RLS).
--     A policy on `group_members` whose subquery itself scans `group_members`
--     triggers "infinite recursion detected in policy for relation
--     group_members". The same recursion reaches any policy whose subquery
--     scans group_members (accounts/manual_accounts/plaid_items/groups/...).
--     These definer helpers read group_members WITHOUT RLS, so referencing
--     them from a policy does NOT re-trigger any policy. Every group-aware
--     policy below is written in terms of these helpers.
-- ===========================================================================
CREATE OR REPLACE FUNCTION app_user_group_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT group_id FROM group_members
  WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_user_group_ids() FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_group_ids() TO app_user;--> statement-breakpoint

-- True when the GUC user shares any group with p_other_user_id.
CREATE OR REPLACE FUNCTION app_user_shares_group_with(p_other_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = p_other_user_id
      AND group_id IN (SELECT app_user_group_ids())
  );
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_user_shares_group_with(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_shares_group_with(uuid) TO app_user;--> statement-breakpoint

-- ===========================================================================
-- C. Per-user isolation policies (FOR ALL; USING = WITH CHECK on user_id).
--    NULLIF(current_setting(..., true), '')::uuid yields NULL when the GUC is
--    unset OR has been reset to '' (a pooled connection that previously set it
--    leaves the custom GUC as '' rather than truly unset). Either way the
--    predicate `user_id = NULL` is NULL = deny. Fail-closed by construction.
-- ===========================================================================
DROP POLICY IF EXISTS sessions_isolation ON sessions;--> statement-breakpoint
CREATE POLICY sessions_isolation ON sessions
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS share_links_isolation ON share_links;--> statement-breakpoint
CREATE POLICY share_links_isolation ON share_links
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS user_snapshots_isolation ON user_net_worth_snapshots;--> statement-breakpoint
CREATE POLICY user_snapshots_isolation ON user_net_worth_snapshots
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS manual_accounts_isolation ON manual_accounts;--> statement-breakpoint
CREATE POLICY manual_accounts_isolation ON manual_accounts
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS plaid_items_isolation ON plaid_items;--> statement-breakpoint
CREATE POLICY plaid_items_isolation ON plaid_items
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS accounts_isolation ON accounts;--> statement-breakpoint
CREATE POLICY accounts_isolation ON accounts
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS transactions_isolation ON transactions;--> statement-breakpoint
CREATE POLICY transactions_isolation ON transactions
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS holdings_isolation ON holdings;--> statement-breakpoint
CREATE POLICY holdings_isolation ON holdings
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

-- ===========================================================================
-- D. users: self (full access to own row) + group-read (fellow members).
--    Multiple policies for the same command combine with OR.
-- ===========================================================================
DROP POLICY IF EXISTS users_self ON users;--> statement-breakpoint
CREATE POLICY users_self ON users
  FOR ALL TO app_user
  USING (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS users_group_read ON users;--> statement-breakpoint
CREATE POLICY users_group_read ON users
  FOR SELECT TO app_user
  USING (app_user_shares_group_with(users.id));--> statement-breakpoint

-- ===========================================================================
-- E. Group-aware FOR SELECT read policies for shared financial tables.
--    A member may read fellow members' accounts / manual_accounts (for the
--    household view) and plaid_items (for institution names).
-- ===========================================================================
DROP POLICY IF EXISTS accounts_group_read ON accounts;--> statement-breakpoint
CREATE POLICY accounts_group_read ON accounts
  FOR SELECT TO app_user
  USING (app_user_shares_group_with(accounts.user_id));--> statement-breakpoint

DROP POLICY IF EXISTS manual_accounts_group_read ON manual_accounts;--> statement-breakpoint
CREATE POLICY manual_accounts_group_read ON manual_accounts
  FOR SELECT TO app_user
  USING (app_user_shares_group_with(manual_accounts.user_id));--> statement-breakpoint

DROP POLICY IF EXISTS plaid_items_group_read ON plaid_items;--> statement-breakpoint
CREATE POLICY plaid_items_group_read ON plaid_items
  FOR SELECT TO app_user
  USING (app_user_shares_group_with(plaid_items.user_id));--> statement-breakpoint

-- ===========================================================================
-- F. Group-owned tables: access for members of the group.
-- ===========================================================================
DROP POLICY IF EXISTS groups_member ON groups;--> statement-breakpoint
CREATE POLICY groups_member ON groups
  FOR ALL TO app_user
  USING (groups.id IN (SELECT app_user_group_ids()))
  WITH CHECK (
    -- creating a group: created_by must be the current user; once members
    -- exist, membership also satisfies the check (for updates).
    created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR groups.id IN (SELECT app_user_group_ids())
  );--> statement-breakpoint

DROP POLICY IF EXISTS group_invitations_member ON group_invitations;--> statement-breakpoint
CREATE POLICY group_invitations_member ON group_invitations
  FOR ALL TO app_user
  USING (group_invitations.group_id IN (SELECT app_user_group_ids()))
  WITH CHECK (
    invited_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );--> statement-breakpoint

DROP POLICY IF EXISTS group_snapshots_member ON group_net_worth_snapshots;--> statement-breakpoint
CREATE POLICY group_snapshots_member ON group_net_worth_snapshots
  FOR ALL TO app_user
  USING (group_net_worth_snapshots.group_id IN (SELECT app_user_group_ids()))
  WITH CHECK (group_net_worth_snapshots.group_id IN (SELECT app_user_group_ids()));--> statement-breakpoint

-- ===========================================================================
-- G. group_members: self (own membership row) + group-read (list members).
--    A member must read ALL rows of their own group, not just their own row,
--    so both policies are needed (combined with OR for SELECT). The group-read
--    policy uses the SECURITY DEFINER helper to avoid recursing into itself.
-- ===========================================================================
DROP POLICY IF EXISTS group_members_self ON group_members;--> statement-breakpoint
CREATE POLICY group_members_self ON group_members
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS group_members_group_read ON group_members;--> statement-breakpoint
CREATE POLICY group_members_group_read ON group_members
  FOR SELECT TO app_user
  USING (group_members.group_id IN (SELECT app_user_group_ids()));--> statement-breakpoint

-- ===========================================================================
-- H. SECURITY DEFINER functions.
--    These run with the privileges of the table owner (the migration runner),
--    so they can perform the few operations that have no "current user" yet
--    (pre-auth login/session lookups, public token reads, the Plaid webhook)
--    or that legitimately act across an RLS boundary (an owner removing
--    another group member). Each pins search_path = public, revokes PUBLIC
--    execute, and grants EXECUTE only to app_user.
-- ===========================================================================

-- Session lookup (read + slide) for getUserId() and the MFA pending flow.
CREATE OR REPLACE FUNCTION lookup_session(p_session_id uuid)
RETURNS TABLE(
  user_id uuid,
  expires_at timestamptz,
  mfa_pending boolean,
  mfa_failed_attempts integer,
  mfa_locked_until timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, expires_at, mfa_pending, mfa_failed_attempts, mfa_locked_until
  FROM sessions WHERE id = p_session_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_session(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_session(uuid) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION create_session(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_mfa_pending boolean
)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO sessions (user_id, expires_at, mfa_pending)
  VALUES (p_user_id, p_expires_at, p_mfa_pending)
  RETURNING id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION create_session(uuid, timestamptz, boolean) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION create_session(uuid, timestamptz, boolean) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION slide_session(p_session_id uuid, p_new_expiry timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sessions SET expires_at = p_new_expiry WHERE id = p_session_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION slide_session(uuid, timestamptz) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION slide_session(uuid, timestamptz) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION delete_session(p_session_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM sessions WHERE id = p_session_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_session(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_session(uuid) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_mfa_failure(
  p_session_id uuid,
  p_failed_attempts integer,
  p_locked_until timestamptz
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sessions
  SET mfa_failed_attempts = p_failed_attempts,
      mfa_locked_until = p_locked_until
  WHERE id = p_session_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION record_mfa_failure(uuid, integer, timestamptz) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION record_mfa_failure(uuid, integer, timestamptz) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mark_session_authenticated(
  p_session_id uuid,
  p_new_expiry timestamptz
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sessions
  SET mfa_pending = false,
      mfa_failed_attempts = 0,
      mfa_locked_until = NULL,
      expires_at = p_new_expiry
  WHERE id = p_session_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mark_session_authenticated(uuid, timestamptz) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mark_session_authenticated(uuid, timestamptz) TO app_user;--> statement-breakpoint

-- MFA secret lookup for the pre-auth MFA verify flow (no broad users read).
CREATE OR REPLACE FUNCTION lookup_mfa_secret(p_user_id uuid)
RETURNS TABLE(user_id uuid, totp_secret text, recovery_codes text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, totp_secret, recovery_codes FROM users WHERE id = p_user_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_mfa_secret(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_mfa_secret(uuid) TO app_user;--> statement-breakpoint

-- Remove a single used recovery code (pre-auth, identified by user id).
CREATE OR REPLACE FUNCTION consume_recovery_code(p_user_id uuid, p_codes text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET recovery_codes = p_codes, updated_at = now()
  WHERE id = p_user_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION consume_recovery_code(uuid, text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION consume_recovery_code(uuid, text) TO app_user;--> statement-breakpoint

-- Login: look up a user by email before any user context exists.
CREATE OR REPLACE FUNCTION lookup_user_for_login(p_email text)
RETURNS TABLE(
  id uuid,
  password_hash text,
  display_name text,
  email text,
  mfa_enabled boolean,
  failed_login_attempts integer,
  locked_until timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, password_hash, display_name, email, mfa_enabled,
         failed_login_attempts, locked_until
  FROM users WHERE email = p_email;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_user_for_login(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_user_for_login(text) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_login_failure(
  p_user_id uuid,
  p_failed_attempts integer,
  p_locked_until timestamptz
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users
  SET failed_login_attempts = p_failed_attempts,
      locked_until = p_locked_until,
      updated_at = now()
  WHERE id = p_user_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION record_login_failure(uuid, integer, timestamptz) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION record_login_failure(uuid, integer, timestamptz) TO app_user;--> statement-breakpoint

CREATE OR REPLACE FUNCTION record_login_success(p_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users
  SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE id = p_user_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION record_login_success(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION record_login_success(uuid) TO app_user;--> statement-breakpoint

-- Register: create a user, raising EMAIL_TAKEN on the unique-email violation.
CREATE OR REPLACE FUNCTION create_user(
  p_email text,
  p_password_hash text,
  p_display_name text,
  p_consent_given_at timestamptz
)
RETURNS TABLE(id uuid, email text, display_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    INSERT INTO users (email, password_hash, display_name, consent_given_at)
    VALUES (p_email, p_password_hash, p_display_name, p_consent_given_at)
    RETURNING users.id, users.email, users.display_name;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'EMAIL_TAKEN';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION create_user(text, text, text, timestamptz) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION create_user(text, text, text, timestamptz) TO app_user;--> statement-breakpoint

-- Public share-link read: resolve the owning user + share flags from a token.
CREATE OR REPLACE FUNCTION resolve_share_link(p_token text)
RETURNS TABLE(
  user_id uuid,
  label text,
  include_net_worth boolean,
  include_balances boolean,
  include_transactions boolean,
  expires_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, label, include_net_worth, include_balances,
         include_transactions, expires_at
  FROM share_links
  WHERE token = p_token
    AND revoked_at IS NULL;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_share_link(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_share_link(text) TO app_user;--> statement-breakpoint

-- Public invite read: safe public fields for a (possibly accepted/expired)
-- non-revoked invitation. The route maps no-row -> 404 and the timestamps to
-- 410 (accepted/expired). LEFT JOIN users so a deleted inviter still resolves.
CREATE OR REPLACE FUNCTION resolve_invitation(p_token text)
RETURNS TABLE(
  group_id uuid,
  group_name text,
  inviter_name text,
  accepted_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT gi.group_id,
         g.name,
         COALESCE(u.display_name, 'Someone'),
         gi.accepted_at,
         gi.expires_at
  FROM group_invitations gi
  JOIN groups g ON g.id = gi.group_id
  LEFT JOIN users u ON u.id = gi.invited_by
  WHERE gi.token = p_token
    AND gi.revoked_at IS NULL;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_invitation(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_invitation(text) TO app_user;--> statement-breakpoint

-- Accept an invitation atomically: validate, insert membership, mark accepted.
-- The accepting user is not yet a group member, so the group_members /
-- group_invitations policies cannot permit this bootstrap; the definer does it
-- with typed errors the route maps to status codes.
CREATE OR REPLACE FUNCTION accept_invitation(p_token text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invitation group_invitations%ROWTYPE;
  v_user_email text;
BEGIN
  SELECT * INTO v_invitation
  FROM group_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED';
  END IF;
  IF v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'REVOKED';
  END IF;
  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'EXPIRED';
  END IF;

  IF v_invitation.invited_email IS NOT NULL THEN
    SELECT email INTO v_user_email FROM users WHERE id = p_user_id;
    IF lower(v_user_email) <> lower(v_invitation.invited_email) THEN
      RAISE EXCEPTION 'EMAIL_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM group_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'ALREADY_IN_GROUP';
  END IF;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_invitation.group_id, p_user_id, 'member');

  UPDATE group_invitations SET accepted_at = now() WHERE id = v_invitation.id;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION accept_invitation(text, uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION accept_invitation(text, uuid) TO app_user;--> statement-breakpoint

-- Plaid webhook: resolve the owning user from Plaid's item_id (no user cookie).
CREATE OR REPLACE FUNCTION resolve_item_owner(p_item_id text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM plaid_items WHERE item_id = p_item_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_item_owner(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_item_owner(text) TO app_user;--> statement-breakpoint

-- Remove a group member. group_members_self only lets a caller delete their
-- OWN membership row, so an owner removing ANOTHER member is otherwise denied.
-- Allowed if the caller is removing themselves (self-leave) OR the caller is
-- the owner of the group; otherwise NOT_OWNER.
CREATE OR REPLACE FUNCTION remove_group_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_caller_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_caller_id <> p_target_user_id
     AND NOT EXISTS (
       SELECT 1 FROM group_members
       WHERE group_id = p_group_id
         AND user_id = p_caller_id
         AND role = 'owner'
     ) THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  DELETE FROM group_members
  WHERE group_id = p_group_id AND user_id = p_target_user_id;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION remove_group_member(uuid, uuid, uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION remove_group_member(uuid, uuid, uuid) TO app_user;
