CREATE TABLE `excused_day` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `excused_day_child_date_idx` ON `excused_day` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `excused_day_child_idx` ON `excused_day` (`child_id`);--> statement-breakpoint
ALTER TABLE `quest_assignment` ADD `original_date` text;