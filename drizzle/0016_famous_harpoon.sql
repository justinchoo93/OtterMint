CREATE TABLE "fire_plans" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fire_plans" ADD CONSTRAINT "fire_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "fire_plans" TO app_user;
--> statement-breakpoint
ALTER TABLE "fire_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fire_plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "fire_plans_isolation"
  ON "fire_plans"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
