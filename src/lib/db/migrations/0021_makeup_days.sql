CREATE TABLE `makeup_day` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `makeup_day_child_date_idx` ON `makeup_day` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `makeup_day_child_idx` ON `makeup_day` (`child_id`);--> statement-breakpoint
ALTER TABLE `child` ADD `makeup_mode` text DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `makeup_days` text;