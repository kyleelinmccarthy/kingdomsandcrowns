CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`duration_minutes` integer,
	`started_at` integer,
	`ended_at` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`client_id` text,
	`quest_assignment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_log_client_id_unique` ON `activity_log` (`client_id`);--> statement-breakpoint
CREATE INDEX `activity_child_date_idx` ON `activity_log` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `activity_child_subject_date_idx` ON `activity_log` (`child_id`,`subject_id`,`date`);--> statement-breakpoint
CREATE TABLE `badge` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`category` text NOT NULL,
	`criteria` text NOT NULL,
	`xp_reward` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `child` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`display_name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`birth_year` integer NOT NULL,
	`age_mode` text NOT NULL,
	`avatar_config` text,
	`current_xp` integer DEFAULT 0 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_active_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `child_badge` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`badge_id` text NOT NULL,
	`earned_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`badge_id`) REFERENCES `badge`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_badge_unique_idx` ON `child_badge` (`child_id`,`badge_id`);--> statement-breakpoint
CREATE TABLE `family` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_user_id` text NOT NULL,
	`family_name` text NOT NULL,
	`timezone` text DEFAULT 'America/Denver' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_parent_user_id_unique` ON `family` (`parent_user_id`);--> statement-breakpoint
CREATE TABLE `missed_subject` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`schedule` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quest` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`estimated_minutes` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quest_child_subject_idx` ON `quest` (`child_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `quest_child_active_idx` ON `quest` (`child_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `quest_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`activity_log_id` text,
	`completed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quest`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_log_id`) REFERENCES `activity_log`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assignment_child_date_idx` ON `quest_assignment` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `assignment_quest_date_idx` ON `quest_assignment` (`quest_id`,`date`);--> statement-breakpoint
CREATE INDEX `assignment_status_idx` ON `quest_assignment` (`child_id`,`status`,`date`);--> statement-breakpoint
CREATE TABLE `quest_reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`type` text NOT NULL,
	`time_of_day` text,
	`channel` text DEFAULT 'push' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quest_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text,
	`subject_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`details` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quest`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resource_quest_idx` ON `quest_resource` (`quest_id`);--> statement-breakpoint
CREATE INDEX `resource_subject_idx` ON `quest_resource` (`subject_id`);--> statement-breakpoint
CREATE TABLE `quest_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`frequency` text NOT NULL,
	`days_of_week` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_schedule_quest_id_unique` ON `quest_schedule` (`quest_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `subject` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subject_child_active_idx` ON `subject` (`child_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `teacher_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`teacher_name` text,
	`feedback_text` text NOT NULL,
	`draft_response` text,
	`response_copied_at` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `weekly_summary` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`week_end_date` text NOT NULL,
	`generated_text` text NOT NULL,
	`edited_text` text,
	`copied_at` integer,
	`checklist` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `summary_child_week_idx` ON `weekly_summary` (`child_id`,`week_start_date`);