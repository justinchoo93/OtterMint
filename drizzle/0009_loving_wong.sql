CREATE TABLE "user_net_worth_coverage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"asset_adjustment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"liability_adjustment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_coverage_events_source_unique" UNIQUE("user_id","source_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "group_net_worth_snapshots" ADD COLUMN "coverage_fingerprint" text;--> statement-breakpoint
ALTER TABLE "user_net_worth_snapshots" ADD COLUMN "coverage_fingerprint" text;--> statement-breakpoint
ALTER TABLE "user_net_worth_coverage_events" ADD CONSTRAINT "user_net_worth_coverage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_coverage_events_user_date" ON "user_net_worth_coverage_events" USING btree ("user_id","effective_date");
--> statement-breakpoint
ALTER TABLE "user_net_worth_coverage_events"
  ADD CONSTRAINT "user_coverage_events_source_type_check"
  CHECK ("source_type" IN ('plaid_account', 'manual_account'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_net_worth_coverage_events" TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "user_net_worth_coverage_events_id_seq" TO app_user;
--> statement-breakpoint
ALTER TABLE "user_net_worth_coverage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_net_worth_coverage_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_coverage_events_isolation"
  ON "user_net_worth_coverage_events"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
