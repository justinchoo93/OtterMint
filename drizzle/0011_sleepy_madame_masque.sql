CREATE TABLE "account_balance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"balance" numeric(14, 2) NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_balance_snapshots_account_date_unique" UNIQUE("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "holding_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"security_id" text NOT NULL,
	"ticker_symbol" text,
	"quantity" numeric(18, 8) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"cost_basis" numeric(14, 2),
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_snapshots_account_security_date_unique" UNIQUE("account_id","security_id","date")
);
--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_balance_snapshots_user_date" ON "account_balance_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_holding_snapshots_user_date" ON "holding_snapshots" USING btree ("user_id","date");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "account_balance_snapshots" TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "account_balance_snapshots_id_seq" TO app_user;
--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "account_balance_snapshots_isolation"
  ON "account_balance_snapshots"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "holding_snapshots" TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "holding_snapshots_id_seq" TO app_user;
--> statement-breakpoint
ALTER TABLE "holding_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "holding_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "holding_snapshots_isolation"
  ON "holding_snapshots"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
