ALTER TABLE `quest_schedule` ADD `interval_weeks` integer;
--> statement-breakpoint
UPDATE `quest_schedule` SET `frequency` = 'weekly' WHERE `frequency` = 'specific_days';