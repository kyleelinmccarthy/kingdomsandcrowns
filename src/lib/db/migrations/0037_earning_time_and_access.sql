CREATE TABLE `access_request` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text,
	`wants_beta` integer DEFAULT false NOT NULL,
	`notify_free` integer DEFAULT false NOT NULL,
	`notify_paid` integer DEFAULT false NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_request_email_idx` ON `access_request` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_request_ip_idx` ON `access_request` (`ip_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `deed_run` ADD `second_tries` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `deed_run` ADD `stars` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deed_run` ADD `kind` text DEFAULT 'deed' NOT NULL;--> statement-breakpoint
ALTER TABLE `deed_run` ADD `second_chances` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_play_ledger` ADD `source_run_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_allowance_day_idx` ON `realm_play_ledger` (`child_id`,`date`) WHERE "realm_play_ledger"."kind" = 'allowance';--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_carried_day_idx` ON `realm_play_ledger` (`child_id`,`date`) WHERE "realm_play_ledger"."kind" = 'carried';--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_practice_run_idx` ON `realm_play_ledger` (`source_run_id`) WHERE "realm_play_ledger"."kind" = 'practice';--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `side_quest_length` integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `second_chances` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `daily_allowance_minutes` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `minutes_per_star` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `side_quest_daily_cap_minutes` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `bank_cap_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
UPDATE deed_run SET stars = CASE
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.9 THEN 3
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.65 THEN 2
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.35 THEN 1
  ELSE 0 END
WHERE completed_at IS NOT NULL AND kind = 'deed' AND stars = 0;
