CREATE TABLE `upkeep_task` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`value_cents` integer,
	`is_required` integer DEFAULT true NOT NULL,
	`reward_xp` integer,
	`estimated_minutes` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upkeep_task_child_active_idx` ON `upkeep_task` (`child_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `upkeep_task_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`child_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` integer,
	`completed_by_user_id` text,
	`approved_at` integer,
	`approved_by_user_id` text,
	`notes` text,
	`status_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `upkeep_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upkeep_assignment_child_task_date_idx` ON `upkeep_task_assignment` (`child_id`,`task_id`,`date`);--> statement-breakpoint
CREATE INDEX `upkeep_assignment_child_date_idx` ON `upkeep_task_assignment` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `upkeep_assignment_child_status_idx` ON `upkeep_task_assignment` (`child_id`,`status`,`date`);--> statement-breakpoint
CREATE TABLE `upkeep_task_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`frequency` text NOT NULL,
	`days_of_week` text,
	`interval_weeks` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `upkeep_task`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upkeep_task_schedule_task_id_unique` ON `upkeep_task_schedule` (`task_id`);--> statement-breakpoint
CREATE TABLE `wage_ledger_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`task_assignment_id` text,
	`task_title` text,
	`date` text NOT NULL,
	`note` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_assignment_id`) REFERENCES `upkeep_task_assignment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wage_ledger_child_idx` ON `wage_ledger_entry` (`child_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wage_ledger_assignment_idx` ON `wage_ledger_entry` (`task_assignment_id`);--> statement-breakpoint
ALTER TABLE `child` ADD `upkeep_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `upkeep_xp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `upkeep_requires_approval` integer;--> statement-breakpoint
ALTER TABLE `family` ADD `upkeep_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `family` ADD `upkeep_requires_approval` integer DEFAULT false NOT NULL;