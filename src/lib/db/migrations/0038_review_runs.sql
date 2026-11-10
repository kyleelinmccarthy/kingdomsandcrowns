DROP INDEX "access_request_email_idx";--> statement-breakpoint
DROP INDEX "access_request_ip_idx";--> statement-breakpoint
DROP INDEX "activity_log_client_id_unique";--> statement-breakpoint
DROP INDEX "activity_child_date_idx";--> statement-breakpoint
DROP INDEX "activity_child_subject_date_idx";--> statement-breakpoint
DROP INDEX "castle_child_id_unique";--> statement-breakpoint
DROP INDEX "castle_child_idx";--> statement-breakpoint
DROP INDEX "child_email_idx";--> statement-breakpoint
DROP INDEX "child_auth_user_idx";--> statement-breakpoint
DROP INDEX "child_avatar_unlock_unique_idx";--> statement-breakpoint
DROP INDEX "child_avatar_unlock_child_idx";--> statement-breakpoint
DROP INDEX "child_badge_unique_idx";--> statement-breakpoint
DROP INDEX "child_consent_child_idx";--> statement-breakpoint
DROP INDEX "child_login_link_token_unique";--> statement-breakpoint
DROP INDEX "child_login_link_token_idx";--> statement-breakpoint
DROP INDEX "child_login_link_child_idx";--> statement-breakpoint
DROP INDEX "child_pin_attempt_unique_idx";--> statement-breakpoint
DROP INDEX "deed_run_child_completed_idx";--> statement-breakpoint
DROP INDEX "drill_item_pool_idx";--> statement-breakpoint
DROP INDEX "excused_day_child_date_idx";--> statement-breakpoint
DROP INDEX "excused_day_child_idx";--> statement-breakpoint
DROP INDEX "family_login_code_idx";--> statement-breakpoint
DROP INDEX "family_invite_token_unique";--> statement-breakpoint
DROP INDEX "family_invite_email_idx";--> statement-breakpoint
DROP INDEX "family_invite_family_idx";--> statement-breakpoint
DROP INDEX "family_member_unique_idx";--> statement-breakpoint
DROP INDEX "family_member_user_idx";--> statement-breakpoint
DROP INDEX "family_member_family_idx";--> statement-breakpoint
DROP INDEX "family_member_child_unique_idx";--> statement-breakpoint
DROP INDEX "family_member_child_child_idx";--> statement-breakpoint
DROP INDEX "feedback_user_idx";--> statement-breakpoint
DROP INDEX "feedback_status_idx";--> statement-breakpoint
DROP INDEX "kingdom_progress_child_building_idx";--> statement-breakpoint
DROP INDEX "learning_profile_child_id_unique";--> statement-breakpoint
DROP INDEX "makeup_day_child_date_idx";--> statement-breakpoint
DROP INDEX "makeup_day_child_idx";--> statement-breakpoint
DROP INDEX "parent_alert_family_idx";--> statement-breakpoint
DROP INDEX "parent_alert_dismissal_unique_idx";--> statement-breakpoint
DROP INDEX "parent_alert_dismissal_user_idx";--> statement-breakpoint
DROP INDEX "quest_child_subject_idx";--> statement-breakpoint
DROP INDEX "quest_child_active_idx";--> statement-breakpoint
DROP INDEX "assignment_child_date_idx";--> statement-breakpoint
DROP INDEX "assignment_quest_date_idx";--> statement-breakpoint
DROP INDEX "assignment_status_idx";--> statement-breakpoint
DROP INDEX "assignment_child_quest_date_idx";--> statement-breakpoint
DROP INDEX "resource_quest_idx";--> statement-breakpoint
DROP INDEX "resource_subject_idx";--> statement-breakpoint
DROP INDEX "quest_schedule_quest_id_unique";--> statement-breakpoint
DROP INDEX "realm_place_found_child_place_idx";--> statement-breakpoint
DROP INDEX "realm_play_ledger_child_date_idx";--> statement-breakpoint
DROP INDEX "realm_play_ledger_allowance_day_idx";--> statement-breakpoint
DROP INDEX "realm_play_ledger_carried_day_idx";--> statement-breakpoint
DROP INDEX "realm_play_ledger_practice_run_idx";--> statement-breakpoint
DROP INDEX "realm_recess_record_child_id_unique";--> statement-breakpoint
DROP INDEX "realm_settings_child_id_unique";--> statement-breakpoint
DROP INDEX "realm_trouble_clear_child_date_idx";--> statement-breakpoint
DROP INDEX "realm_trouble_clear_paid_unique_idx";--> statement-breakpoint
DROP INDEX "recess_block_child_day_idx";--> statement-breakpoint
DROP INDEX "schedule_block_child_day_idx";--> statement-breakpoint
DROP INDEX "school_break_family_idx";--> statement-breakpoint
DROP INDEX "season_child_idx";--> statement-breakpoint
DROP INDEX "season_open_unique_idx";--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "skill_mastery_child_skill_idx";--> statement-breakpoint
DROP INDEX "spell_child_slot_idx";--> statement-breakpoint
DROP INDEX "spell_child_idx";--> statement-breakpoint
DROP INDEX "subject_child_active_idx";--> statement-breakpoint
DROP INDEX "subscription_family_id_unique";--> statement-breakpoint
DROP INDEX "upkeep_task_child_active_idx";--> statement-breakpoint
DROP INDEX "upkeep_assignment_child_task_date_idx";--> statement-breakpoint
DROP INDEX "upkeep_assignment_child_date_idx";--> statement-breakpoint
DROP INDEX "upkeep_assignment_child_status_idx";--> statement-breakpoint
DROP INDEX "upkeep_task_schedule_task_id_unique";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "wage_ledger_child_idx";--> statement-breakpoint
DROP INDEX "wage_ledger_assignment_idx";--> statement-breakpoint
DROP INDEX "summary_child_week_idx";--> statement-breakpoint
ALTER TABLE `deed_run` ALTER COLUMN "deed_id" TO "deed_id" text;--> statement-breakpoint
CREATE INDEX `access_request_email_idx` ON `access_request` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_request_ip_idx` ON `access_request` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_log_client_id_unique` ON `activity_log` (`client_id`);--> statement-breakpoint
CREATE INDEX `activity_child_date_idx` ON `activity_log` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `activity_child_subject_date_idx` ON `activity_log` (`child_id`,`subject_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `castle_child_id_unique` ON `castle` (`child_id`);--> statement-breakpoint
CREATE INDEX `castle_child_idx` ON `castle` (`child_id`);--> statement-breakpoint
CREATE INDEX `child_email_idx` ON `child` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_auth_user_idx` ON `child` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_avatar_unlock_unique_idx` ON `child_avatar_unlock` (`child_id`,`category`,`item_id`);--> statement-breakpoint
CREATE INDEX `child_avatar_unlock_child_idx` ON `child_avatar_unlock` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_badge_unique_idx` ON `child_badge` (`child_id`,`badge_id`);--> statement-breakpoint
CREATE INDEX `child_consent_child_idx` ON `child_consent` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_login_link_token_unique` ON `child_login_link` (`token`);--> statement-breakpoint
CREATE INDEX `child_login_link_token_idx` ON `child_login_link` (`token`);--> statement-breakpoint
CREATE INDEX `child_login_link_child_idx` ON `child_login_link` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `child_pin_attempt_unique_idx` ON `child_pin_attempt` (`child_id`,`ip_address`);--> statement-breakpoint
CREATE INDEX `deed_run_child_completed_idx` ON `deed_run` (`child_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `drill_item_pool_idx` ON `drill_item` (`pool_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `excused_day_child_date_idx` ON `excused_day` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `excused_day_child_idx` ON `excused_day` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_login_code_idx` ON `family` (`login_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_invite_token_unique` ON `family_invite` (`token`);--> statement-breakpoint
CREATE INDEX `family_invite_email_idx` ON `family_invite` (`email`);--> statement-breakpoint
CREATE INDEX `family_invite_family_idx` ON `family_invite` (`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_member_unique_idx` ON `family_member` (`family_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `family_member_user_idx` ON `family_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `family_member_family_idx` ON `family_member` (`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_member_child_unique_idx` ON `family_member_child` (`family_member_id`,`child_id`);--> statement-breakpoint
CREATE INDEX `family_member_child_child_idx` ON `family_member_child` (`child_id`);--> statement-breakpoint
CREATE INDEX `feedback_user_idx` ON `feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_status_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `kingdom_progress_child_building_idx` ON `kingdom_progress` (`child_id`,`building_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_profile_child_id_unique` ON `learning_profile` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `makeup_day_child_date_idx` ON `makeup_day` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `makeup_day_child_idx` ON `makeup_day` (`child_id`);--> statement-breakpoint
CREATE INDEX `parent_alert_family_idx` ON `parent_alert` (`family_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `parent_alert_dismissal_unique_idx` ON `parent_alert_dismissal` (`alert_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `parent_alert_dismissal_user_idx` ON `parent_alert_dismissal` (`user_id`);--> statement-breakpoint
CREATE INDEX `quest_child_subject_idx` ON `quest` (`child_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `quest_child_active_idx` ON `quest` (`child_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `assignment_child_date_idx` ON `quest_assignment` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `assignment_quest_date_idx` ON `quest_assignment` (`quest_id`,`date`);--> statement-breakpoint
CREATE INDEX `assignment_status_idx` ON `quest_assignment` (`child_id`,`status`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_child_quest_date_idx` ON `quest_assignment` (`child_id`,`quest_id`,`date`);--> statement-breakpoint
CREATE INDEX `resource_quest_idx` ON `quest_resource` (`quest_id`);--> statement-breakpoint
CREATE INDEX `resource_subject_idx` ON `quest_resource` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quest_schedule_quest_id_unique` ON `quest_schedule` (`quest_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_place_found_child_place_idx` ON `realm_place_found` (`child_id`,`place_id`);--> statement-breakpoint
CREATE INDEX `realm_play_ledger_child_date_idx` ON `realm_play_ledger` (`child_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_allowance_day_idx` ON `realm_play_ledger` (`child_id`,`date`) WHERE "realm_play_ledger"."kind" = 'allowance';--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_carried_day_idx` ON `realm_play_ledger` (`child_id`,`date`) WHERE "realm_play_ledger"."kind" = 'carried';--> statement-breakpoint
CREATE UNIQUE INDEX `realm_play_ledger_practice_run_idx` ON `realm_play_ledger` (`source_run_id`) WHERE "realm_play_ledger"."kind" = 'practice';--> statement-breakpoint
CREATE UNIQUE INDEX `realm_recess_record_child_id_unique` ON `realm_recess_record` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_settings_child_id_unique` ON `realm_settings` (`child_id`);--> statement-breakpoint
CREATE INDEX `realm_trouble_clear_child_date_idx` ON `realm_trouble_clear` (`child_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `realm_trouble_clear_paid_unique_idx` ON `realm_trouble_clear` (`child_id`,`date`,`home_id`) WHERE "realm_trouble_clear"."minutes" > 0;--> statement-breakpoint
CREATE INDEX `recess_block_child_day_idx` ON `recess_block` (`child_id`,`day_of_week`);--> statement-breakpoint
CREATE INDEX `schedule_block_child_day_idx` ON `schedule_block` (`child_id`,`day_of_week`);--> statement-breakpoint
CREATE INDEX `school_break_family_idx` ON `school_break` (`family_id`);--> statement-breakpoint
CREATE INDEX `season_child_idx` ON `season` (`child_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `season_open_unique_idx` ON `season` (`child_id`) WHERE "season"."completed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_mastery_child_skill_idx` ON `skill_mastery` (`child_id`,`skill_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `spell_child_slot_idx` ON `spell` (`child_id`,`slot`);--> statement-breakpoint
CREATE INDEX `spell_child_idx` ON `spell` (`child_id`);--> statement-breakpoint
CREATE INDEX `subject_child_active_idx` ON `subject` (`child_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_family_id_unique` ON `subscription` (`family_id`);--> statement-breakpoint
CREATE INDEX `upkeep_task_child_active_idx` ON `upkeep_task` (`child_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `upkeep_assignment_child_task_date_idx` ON `upkeep_task_assignment` (`child_id`,`task_id`,`date`);--> statement-breakpoint
CREATE INDEX `upkeep_assignment_child_date_idx` ON `upkeep_task_assignment` (`child_id`,`date`);--> statement-breakpoint
CREATE INDEX `upkeep_assignment_child_status_idx` ON `upkeep_task_assignment` (`child_id`,`status`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `upkeep_task_schedule_task_id_unique` ON `upkeep_task_schedule` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `wage_ledger_child_idx` ON `wage_ledger_entry` (`child_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wage_ledger_assignment_idx` ON `wage_ledger_entry` (`task_assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `summary_child_week_idx` ON `weekly_summary` (`child_id`,`week_start_date`);--> statement-breakpoint
ALTER TABLE `deed_run` ADD `source_ref` text;