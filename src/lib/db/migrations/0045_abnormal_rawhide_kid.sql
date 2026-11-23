CREATE TABLE `realm_visitor_keybinds` (
	`user_id` text PRIMARY KEY NOT NULL,
	`keybinds` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `realm_settings` ADD `keybinds` text;