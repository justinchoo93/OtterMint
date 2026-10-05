CREATE TABLE "category_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"match_key" text NOT NULL,
	"category" text NOT NULL,
	"category_detailed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_memories_user_key_unique" UNIQUE("user_id","match_key")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_category" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_category_detailed" text;--> statement-breakpoint
ALTER TABLE "category_memories" ADD CONSTRAINT "category_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "category_memories" TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "category_memories_id_seq" TO app_user;
--> statement-breakpoint
ALTER TABLE "category_memories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_memories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "category_memories_isolation"
  ON "category_memories"
  FOR ALL TO app_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
