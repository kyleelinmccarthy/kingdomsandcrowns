CREATE TABLE `parent_alert_dismissal` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`user_id` text NOT NULL,
	`dismissed_at` integer NOT NULL,
	FOREIGN KEY (`alert_id`) REFERENCES `parent_alert`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_alert_dismissal_unique_idx` ON `parent_alert_dismissal` (`alert_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `parent_alert_dismissal_user_idx` ON `parent_alert_dismissal` (`user_id`);--> statement-breakpoint
DROP INDEX `parent_alert_family_idx`;--> statement-breakpoint
CREATE INDEX `parent_alert_family_idx` ON `parent_alert` (`family_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `parent_alert` DROP COLUMN `dismissed_at`;