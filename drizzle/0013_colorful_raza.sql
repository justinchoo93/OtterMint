ALTER TABLE "holding_snapshots" ADD COLUMN "security_type" text;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD COLUMN "is_cash_equivalent" boolean;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "security_type" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "is_cash_equivalent" boolean;