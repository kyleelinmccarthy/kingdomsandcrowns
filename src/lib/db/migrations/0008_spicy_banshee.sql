CREATE TABLE `child_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`consented_by_user_id` text,
	`methods` text NOT NULL,
	`consent_version` text NOT NULL,
	`ip_address` text,
	`consented_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consented_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `child_consent_child_idx` ON `child_consent` (`child_id`);--> statement-breakpoint
CREATE TABLE `child_login_link` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`child_id` text NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_login_link_token_unique` ON `child_login_link` (`token`);--> statement-breakpoint
CREATE INDEX `child_login_link_token_idx` ON `child_login_link` (`token`);--> statement-breakpoint
CREATE INDEX `child_login_link_child_idx` ON `child_login_link` (`child_id`);--> statement-breakpoint
CREATE TABLE `child_pin_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`ip_address` text NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_pin_attempt_unique_idx` ON `child_pin_attempt` (`child_id`,`ip_address`);--> statement-breakpoint
ALTER TABLE `child` ALTER COLUMN "pin_hash" TO "pin_hash" text;--> statement-breakpoint
ALTER TABLE `child` ADD `email` text;--> statement-breakpoint
ALTER TABLE `child` ADD `auth_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `child` ADD `pin_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `email_login_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `child` ADD `google_login_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `family` ADD `login_code` text;--> statement-breakpoint
CREATE INDEX `child_email_idx` ON `child` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_auth_user_idx` ON `child` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_login_code_idx` ON `family` (`login_code`);
