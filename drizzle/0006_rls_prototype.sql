-- RLS PROTOTYPE (Milestone 1) — two tables only: manual_accounts, plaid_items.
--
-- This hand-written, idempotent migration creates a non-superuser `app_user`
-- role, grants it the minimum it needs on the two prototype tables, enables +
-- forces Row-Level Security on them, and adds per-user isolation policies keyed
-- on the transaction-scoped GUC `app.current_user_id`.
--
-- It completes for two tables what 0002_tranquil_morlocks.sql started: 0002
-- ran `ENABLE ROW LEVEL SECURITY` with no policies and no non-superuser role,
-- so RLS was inert (the app connects as the owner/superuser, which bypasses
-- RLS). The full rollout across all tables is a later milestone.
--
-- Safe to run twice: role creation is guarded; ENABLE/FORCE are no-ops when
-- already set; each policy is dropped before it is created.

-- 1. Role + grants ----------------------------------------------------------
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
GRANT SELECT, INSERT, UPDATE, DELETE ON manual_accounts, plaid_items TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;--> statement-breakpoint

-- 2. Enable + FORCE RLS (FORCE applies policies even to the table owner) -----
ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE manual_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE plaid_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 3. Per-user isolation policies --------------------------------------------
-- current_setting(..., true) returns NULL (no error) when the GUC is unset, so
-- a connection that forgot to set it matches `user_id = NULL` = NULL = deny.
-- Fail-closed by construction.
DROP POLICY IF EXISTS manual_accounts_isolation ON manual_accounts;--> statement-breakpoint
CREATE POLICY manual_accounts_isolation ON manual_accounts
  FOR ALL
  TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint

DROP POLICY IF EXISTS plaid_items_isolation ON plaid_items;--> statement-breakpoint
CREATE POLICY plaid_items_isolation ON plaid_items
  FOR ALL
  TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);
