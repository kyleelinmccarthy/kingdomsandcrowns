CREATE TABLE `realm_visitor_sound` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sound` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `realm_settings` DROP COLUMN `visitor_sound`;