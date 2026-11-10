ALTER TABLE `quest_assignment` ADD `status_reason` text;--> statement-breakpoint
-- Skip and "I'm stuck" reasons used to be filed in `notes`, alongside Scribe's
-- Notes. Move the ones already on the record across so no existing reason
-- disappears from a card the moment the UI starts reading the new column.
UPDATE `quest_assignment` SET `status_reason` = `notes`, `notes` = NULL WHERE `status` IN ('skipped', 'stuck') AND `notes` IS NOT NULL;
