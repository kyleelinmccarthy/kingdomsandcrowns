CREATE TABLE `deed_run` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`deed_id` text NOT NULL,
	`skill_ids` text NOT NULL,
	`band` text NOT NULL,
	`questions` text NOT NULL,
	`responses` text DEFAULT '[]' NOT NULL,
	`mastery_start` text DEFAULT '{}' NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`flawless` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deed_run_child_completed_idx` ON `deed_run` (`child_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `drill_item` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`band` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`distractors` text NOT NULL,
	`read_aloud` text,
	`level` integer DEFAULT 2 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drill_item_pool_idx` ON `drill_item` (`pool_id`);--> statement-breakpoint
CREATE TABLE `kingdom_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`building_id` text NOT NULL,
	`deeds_done` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kingdom_progress_child_building_idx` ON `kingdom_progress` (`child_id`,`building_id`);--> statement-breakpoint
CREATE TABLE `skill_mastery` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`recent_results` text DEFAULT '[]' NOT NULL,
	`correct_total` integer DEFAULT 0 NOT NULL,
	`attempt_total` integer DEFAULT 0 NOT NULL,
	`last_practiced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_mastery_child_skill_idx` ON `skill_mastery` (`child_id`,`skill_id`);