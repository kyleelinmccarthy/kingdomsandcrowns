CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'free' NOT NULL,
	`price_id` text,
	`current_period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_family_id_unique` ON `subscription` (`family_id`);