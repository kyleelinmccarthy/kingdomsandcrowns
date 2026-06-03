CREATE TABLE `family_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`family_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`child_ids` text,
	`invited_by_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_invite_token_unique` ON `family_invite` (`token`);--> statement-breakpoint
CREATE INDEX `family_invite_email_idx` ON `family_invite` (`email`);--> statement-breakpoint
CREATE INDEX `family_invite_family_idx` ON `family_invite` (`family_id`);--> statement-breakpoint
CREATE TABLE `family_member` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`permission` text NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_member_unique_idx` ON `family_member` (`family_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `family_member_user_idx` ON `family_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `family_member_family_idx` ON `family_member` (`family_id`);--> statement-breakpoint
CREATE TABLE `family_member_child` (
	`id` text PRIMARY KEY NOT NULL,
	`family_member_id` text NOT NULL,
	`child_id` text NOT NULL,
	FOREIGN KEY (`family_member_id`) REFERENCES `family_member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_member_child_unique_idx` ON `family_member_child` (`family_member_id`,`child_id`);--> statement-breakpoint
CREATE INDEX `family_member_child_child_idx` ON `family_member_child` (`child_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_family` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_user_id` text,
	`family_name` text NOT NULL,
	`timezone` text DEFAULT 'America/Denver' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_family`("id", "parent_user_id", "family_name", "timezone", "created_at", "updated_at") SELECT "id", "parent_user_id", "family_name", "timezone", "created_at", "updated_at" FROM `family`;--> statement-breakpoint
DROP TABLE `family`;--> statement-breakpoint
ALTER TABLE `__new_family` RENAME TO `family`;--> statement-breakpoint
PRAGMA foreign_keys=ON;