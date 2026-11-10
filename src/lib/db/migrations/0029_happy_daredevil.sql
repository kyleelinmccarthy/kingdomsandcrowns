CREATE TABLE `realm_trouble_clear` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`home_id` text NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `realm_trouble_clear_child_date_idx` ON `realm_trouble_clear` (`child_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_trouble_clear_paid_unique_idx` ON `realm_trouble_clear` (`child_id`,`date`,`home_id`) WHERE "realm_trouble_clear"."minutes" > 0;--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `trouble_bonus_cap_minutes` integer DEFAULT 5 NOT NULL;