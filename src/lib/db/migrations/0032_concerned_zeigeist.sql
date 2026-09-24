CREATE TABLE `realm_place_found` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`place_id` text NOT NULL,
	`found_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `child`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `realm_place_found_child_place_idx` ON `realm_place_found` (`child_id`,`place_id`);