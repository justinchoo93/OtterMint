ALTER TABLE "sessions" ADD COLUMN "mfa_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mfa_locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp;--> statement-breakpoint

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plaid_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_net_worth_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_net_worth_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		EXECUTE 'REVOKE ALL ON TABLE "users" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "sessions" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "plaid_items" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "accounts" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "transactions" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "holdings" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "manual_accounts" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "user_net_worth_snapshots" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "group_net_worth_snapshots" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "groups" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "group_members" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "group_invitations" FROM anon';
		EXECUTE 'REVOKE ALL ON TABLE "share_links" FROM anon';
		EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
	END IF;

	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		EXECUTE 'REVOKE ALL ON TABLE "users" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "sessions" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "plaid_items" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "accounts" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "transactions" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "holdings" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "manual_accounts" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "user_net_worth_snapshots" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "group_net_worth_snapshots" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "groups" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "group_members" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "group_invitations" FROM authenticated';
		EXECUTE 'REVOKE ALL ON TABLE "share_links" FROM authenticated';
		EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
	END IF;
END $$;
