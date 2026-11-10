CREATE TABLE `schedule_block` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`day_of_week` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_block_child_day_idx` ON `schedule_block` (`child_id`,`day_of_week`);--> statement-breakpoint
ALTER TABLE `child` ADD `schedule_self_manage_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `school_days` text;