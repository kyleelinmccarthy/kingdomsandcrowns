CREATE TABLE `learning_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`reading_font` integer DEFAULT false NOT NULL,
	`larger_text` integer DEFAULT false NOT NULL,
	`extra_spacing` integer DEFAULT false NOT NULL,
	`read_aloud` integer DEFAULT false NOT NULL,
	`untimed` integer DEFAULT false NOT NULL,
	`session_minutes` integer,
	`fewer_choices` integer DEFAULT false NOT NULL,
	`reduced_motion` integer DEFAULT false NOT NULL,
	`low_stimulus` integer DEFAULT false NOT NULL,
	`predictable_routine` integer DEFAULT false NOT NULL,
	`sound_enabled` integer DEFAULT true NOT NULL,
	`input_mode` text DEFAULT 'auto' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_profile_child_id_unique` ON `learning_profile` (`child_id`);--> statement-breakpoint
CREATE TABLE `realm_play_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`minutes` integer NOT NULL,
	`source_assignment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `realm_play_ledger_child_date_idx` ON `realm_play_ledger` (`child_id`,`date`);--> statement-breakpoint
CREATE TABLE `realm_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`access_mode` text DEFAULT 'earned' NOT NULL,
	`earned_minutes_per_quest` integer DEFAULT 5 NOT NULL,
	`off_hours_enabled` integer DEFAULT false NOT NULL,
	`daily_cap_minutes` integer DEFAULT 30 NOT NULL,
	`tone_mode` text DEFAULT 'gentle' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realm_settings_child_id_unique` ON `realm_settings` (`child_id`);--> statement-breakpoint
CREATE TABLE `recess_block` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`day_of_week` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recess_block_child_day_idx` ON `recess_block` (`child_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `season` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`grade` text NOT NULL,
	`ordinal` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`completed_at` integer,
	`crown_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `season_child_idx` ON `season` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `season_open_unique_idx` ON `season` (`child_id`) WHERE "season"."completed_at" IS NULL;