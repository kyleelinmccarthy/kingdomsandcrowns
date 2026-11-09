ALTER TABLE "realm_play_ledger" ADD COLUMN "source_run_id" text;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "daily_allowance_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "minutes_per_star" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "side_quest_daily_cap_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD COLUMN "bank_cap_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "realm_play_ledger_allowance_day_idx" ON "realm_play_ledger" USING btree ("child_id","date") WHERE "realm_play_ledger"."kind" = 'allowance';--> statement-breakpoint
CREATE UNIQUE INDEX "realm_play_ledger_carried_day_idx" ON "realm_play_ledger" USING btree ("child_id","date") WHERE "realm_play_ledger"."kind" = 'carried';--> statement-breakpoint
CREATE UNIQUE INDEX "realm_play_ledger_practice_run_idx" ON "realm_play_ledger" USING btree ("source_run_id") WHERE "realm_play_ledger"."kind" = 'practice';