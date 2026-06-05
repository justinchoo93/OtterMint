-- RLS ROLLBACK (manual use only — NOT journaled, never auto-applied).
--
-- Apply this BY HAND to revert the Row-Level Security enforcement added by
-- 0006_rls_prototype.sql and 0008_rls_full_rollout.sql, returning the database
-- to application-layer-only tenant filtering:
--
--   docker exec -i ottermint-test-db psql -U postgres -d ottermint \
--     < drizzle/0099_rls_rollback.sql
--
-- This drops every policy and every SECURITY DEFINER function, and turns OFF
-- FORCE + ROW LEVEL SECURITY on all 13 tables. It deliberately LEAVES the
-- denormalized user_id columns (added by 0007) in place — they are harmless
-- and dropping them would be destructive.
--
-- To FULLY revert in a deployed environment you must ALSO switch DATABASE_URL
-- back to the owner/superuser role; otherwise app_user will keep connecting
-- (RLS would simply be dormant once disabled here). The app_user role itself
-- is left intact (drop it manually only if you are sure nothing else uses it).
--
-- Safe to run twice: every DROP uses IF EXISTS; DISABLE/NO FORCE are no-ops
-- when already off.

-- 1. Drop all policies -------------------------------------------------------
DROP POLICY IF EXISTS sessions_isolation ON sessions;
DROP POLICY IF EXISTS share_links_isolation ON share_links;
DROP POLICY IF EXISTS user_snapshots_isolation ON user_net_worth_snapshots;
DROP POLICY IF EXISTS manual_accounts_isolation ON manual_accounts;
DROP POLICY IF EXISTS manual_accounts_group_read ON manual_accounts;
DROP POLICY IF EXISTS plaid_items_isolation ON plaid_items;
DROP POLICY IF EXISTS plaid_items_group_read ON plaid_items;
DROP POLICY IF EXISTS accounts_isolation ON accounts;
DROP POLICY IF EXISTS accounts_group_read ON accounts;
DROP POLICY IF EXISTS transactions_isolation ON transactions;
DROP POLICY IF EXISTS holdings_isolation ON holdings;
DROP POLICY IF EXISTS users_self ON users;
DROP POLICY IF EXISTS users_group_read ON users;
DROP POLICY IF EXISTS groups_member ON groups;
DROP POLICY IF EXISTS groups_insert ON groups;
DROP POLICY IF EXISTS groups_select ON groups;
DROP POLICY IF EXISTS groups_update ON groups;
DROP POLICY IF EXISTS groups_delete ON groups;
DROP POLICY IF EXISTS group_invitations_member ON group_invitations;
DROP POLICY IF EXISTS group_snapshots_member ON group_net_worth_snapshots;
DROP POLICY IF EXISTS group_members_self ON group_members;
DROP POLICY IF EXISTS group_members_group_read ON group_members;

-- 2. Drop all helper + SECURITY DEFINER functions (exact arg types) ----------
DROP FUNCTION IF EXISTS app_current_user_id();
DROP FUNCTION IF EXISTS app_user_group_ids();
DROP FUNCTION IF EXISTS app_user_shares_group_with(uuid);
DROP FUNCTION IF EXISTS lookup_session(uuid);
DROP FUNCTION IF EXISTS create_session(uuid, timestamptz, boolean);
DROP FUNCTION IF EXISTS slide_session(uuid, timestamptz);
DROP FUNCTION IF EXISTS delete_session(uuid);
DROP FUNCTION IF EXISTS record_mfa_failure(uuid, integer, timestamptz);
DROP FUNCTION IF EXISTS mark_session_authenticated(uuid, timestamptz);
DROP FUNCTION IF EXISTS lookup_mfa_secret(uuid);
DROP FUNCTION IF EXISTS consume_recovery_code(uuid, text);
DROP FUNCTION IF EXISTS lookup_user_for_login(text);
DROP FUNCTION IF EXISTS record_login_failure(uuid, integer, timestamptz);
DROP FUNCTION IF EXISTS record_login_success(uuid);
DROP FUNCTION IF EXISTS create_user(text, text, text, timestamptz);
DROP FUNCTION IF EXISTS resolve_share_link(text);
DROP FUNCTION IF EXISTS resolve_invitation(text);
DROP FUNCTION IF EXISTS accept_invitation(text, uuid);
DROP FUNCTION IF EXISTS resolve_item_owner(text);
DROP FUNCTION IF EXISTS remove_group_member(uuid, uuid, uuid);

-- 3. Turn off FORCE + ROW LEVEL SECURITY on all 13 tables --------------------
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups NO FORCE ROW LEVEL SECURITY;
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE group_invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE share_links NO FORCE ROW LEVEL SECURITY;
ALTER TABLE share_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE plaid_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE holdings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE holdings DISABLE ROW LEVEL SECURITY;
ALTER TABLE manual_accounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE manual_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_net_worth_snapshots NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_net_worth_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_net_worth_snapshots NO FORCE ROW LEVEL SECURITY;
ALTER TABLE group_net_worth_snapshots DISABLE ROW LEVEL SECURITY;
