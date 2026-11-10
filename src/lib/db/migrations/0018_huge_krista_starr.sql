CREATE TABLE `parent_alert` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`type` text NOT NULL,
	`quest_assignment_id` text,
	`child_name` text NOT NULL,
	`quest_title` text NOT NULL,
	`subject_name` text,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`dismissed_at` integer,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quest_assignment_id`) REFERENCES `quest_assignment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `parent_alert_family_idx` ON `parent_alert` (`family_id`,`dismissed_at`,`created_at`);--> statement-breakpoint
ALTER TABLE `child` ADD `skip_quests_enabled` integer DEFAULT false NOT NULL;