CREATE TABLE "investment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"investment_transaction_id" text NOT NULL,
	"security_id" text,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"quantity" numeric(18, 8),
	"price" numeric(12, 4),
	"iso_currency_code" text DEFAULT 'USD',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_transactions_investment_transaction_id_unique" UNIQUE("investment_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_investment_transactions_user_date" ON "investment_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_investment_transactions_account_date" ON "investment_transactions" USING btree ("account_id","date");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "investment_transactions" TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "investment_transactions_id_seq" TO app_user;
--> statement-breakpoint
ALTER TABLE "investment_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "investment_transactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "investment_transactions_isolation"
  ON "investment_transactions"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
