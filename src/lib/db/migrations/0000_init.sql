CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_minutes" integer,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"client_id" text,
	"quest_assignment_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_log_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "badge" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"category" text NOT NULL,
	"criteria" text NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "castle" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"type" text DEFAULT 'campsite' NOT NULL,
	"name" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "castle_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "child" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"display_name" text NOT NULL,
	"pin_hash" text,
	"birth_year" integer,
	"grade" text,
	"age_mode" text NOT NULL,
	"avatar_config" text,
	"current_xp" integer DEFAULT 0 NOT NULL,
	"bonus_xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"show_on_leaderboard" boolean DEFAULT false NOT NULL,
	"last_active_date" text,
	"email" text,
	"auth_user_id" text,
	"pin_enabled" boolean DEFAULT true NOT NULL,
	"email_login_enabled" boolean DEFAULT false NOT NULL,
	"google_login_enabled" boolean DEFAULT false NOT NULL,
	"schedule_self_manage_enabled" boolean DEFAULT false NOT NULL,
	"skip_quests_enabled" boolean DEFAULT false NOT NULL,
	"school_days" text,
	"streak_optional_days" text,
	"schooling_mode" text DEFAULT 'unstructured' NOT NULL,
	"schooling_mode_overrides" text,
	"makeup_mode" text DEFAULT 'always' NOT NULL,
	"makeup_days" text,
	"upkeep_enabled" boolean DEFAULT true NOT NULL,
	"upkeep_xp" integer DEFAULT 0 NOT NULL,
	"upkeep_requires_approval" boolean,
	"banished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_avatar_unlock" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"category" text NOT NULL,
	"item_id" text NOT NULL,
	"source" text DEFAULT 'quest_reward' NOT NULL,
	"source_quest_id" text,
	"unlocked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_badge" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"consented_by_user_id" text,
	"methods" text NOT NULL,
	"consent_version" text NOT NULL,
	"ip_address" text,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_login_link" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"child_id" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "child_login_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "child_pin_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"ip_address" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deed_run" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"deed_id" text NOT NULL,
	"skill_ids" text NOT NULL,
	"band" text NOT NULL,
	"questions" text NOT NULL,
	"responses" text DEFAULT '[]' NOT NULL,
	"mastery_start" text DEFAULT '{}' NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"flawless" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_item" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"band" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"distractors" text NOT NULL,
	"read_aloud" text,
	"level" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "excused_day" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_user_id" text,
	"family_name" text NOT NULL,
	"timezone" text DEFAULT 'America/Denver' NOT NULL,
	"login_code" text,
	"upkeep_enabled" boolean DEFAULT false NOT NULL,
	"upkeep_requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"family_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"child_ids" text,
	"invited_by_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "family_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "family_member" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_member_child" (
	"id" text PRIMARY KEY NOT NULL,
	"family_member_id" text NOT NULL,
	"child_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"page_url" text,
	"user_agent" text,
	"viewport" text,
	"app_version" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kingdom_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"building_id" text NOT NULL,
	"deeds_done" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"reading_font" boolean DEFAULT false NOT NULL,
	"larger_text" boolean DEFAULT false NOT NULL,
	"extra_spacing" boolean DEFAULT false NOT NULL,
	"read_aloud" boolean DEFAULT false NOT NULL,
	"untimed" boolean DEFAULT false NOT NULL,
	"session_minutes" integer,
	"fewer_choices" boolean DEFAULT false NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"low_stimulus" boolean DEFAULT false NOT NULL,
	"predictable_routine" boolean DEFAULT false NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"input_mode" text DEFAULT 'auto' NOT NULL,
	"math_offset" integer DEFAULT 0 NOT NULL,
	"reading_offset" integer DEFAULT 0 NOT NULL,
	"language_offset" integer DEFAULT 0 NOT NULL,
	"science_offset" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "learning_profile_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "makeup_day" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missed_subject" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"child_id" text NOT NULL,
	"type" text NOT NULL,
	"quest_assignment_id" text,
	"child_name" text NOT NULL,
	"quest_title" text NOT NULL,
	"subject_name" text,
	"date" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_alert_dismissal" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"user_id" text NOT NULL,
	"dismissed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer,
	"reward_xp" integer,
	"reward_description" text,
	"reward_avatar_item" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"include_in_learning_log" boolean DEFAULT true NOT NULL,
	"require_notes" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"quest_id" text NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"original_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"activity_log_id" text,
	"completed_at" timestamp with time zone,
	"notes" text,
	"status_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"quest_id" text NOT NULL,
	"type" text NOT NULL,
	"time_of_day" text,
	"channel" text DEFAULT 'push' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"quest_id" text,
	"subject_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"details" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"quest_id" text NOT NULL,
	"frequency" text NOT NULL,
	"days_of_week" text,
	"interval_weeks" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quest_schedule_quest_id_unique" UNIQUE("quest_id")
);
--> statement-breakpoint
CREATE TABLE "realm_place_found" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"place_id" text NOT NULL,
	"found_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realm_play_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"minutes" integer NOT NULL,
	"source_assignment_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realm_recess_record" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"total_gleams" integer DEFAULT 0 NOT NULL,
	"laps" integer DEFAULT 0 NOT NULL,
	"best_lap_ms" integer,
	"best_mounted_lap_ms" integer,
	"course_id" text DEFAULT 'island-ring-1' NOT NULL,
	"last_lap_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "realm_recess_record_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "realm_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"access_mode" text DEFAULT 'earned' NOT NULL,
	"earned_minutes_per_quest" integer DEFAULT 5 NOT NULL,
	"off_hours_enabled" boolean DEFAULT false NOT NULL,
	"daily_cap_minutes" integer DEFAULT 30 NOT NULL,
	"tone_mode" text DEFAULT 'gentle' NOT NULL,
	"help_seen_at" timestamp with time zone,
	"starter_spell_at" timestamp with time zone,
	"depth_override" text DEFAULT 'auto' NOT NULL,
	"tutorial_step" integer DEFAULT 0 NOT NULL,
	"trouble_bonus_cap_minutes" integer DEFAULT 5 NOT NULL,
	"sound" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "realm_settings_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "realm_trouble_clear" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"home_id" text NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realm_visitor_sound" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sound" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recess_block" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_block" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_break" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"grade" text NOT NULL,
	"ordinal" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"completed_at" timestamp with time zone,
	"crown_id" text,
	"ceremony_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "skill_mastery" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"recent_results" text DEFAULT '[]' NOT NULL,
	"correct_total" integer DEFAULT 0 NOT NULL,
	"attempt_total" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spell" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"slot" integer NOT NULL,
	"element_id" text NOT NULL,
	"form_id" text NOT NULL,
	"modifier_id" text,
	"adjective" text NOT NULL,
	"noun" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"spell_school" text DEFAULT 'none' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'free' NOT NULL,
	"price_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "subscription_family_id_unique" UNIQUE("family_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"teacher_name" text,
	"feedback_text" text NOT NULL,
	"draft_response" text,
	"response_copied_at" timestamp with time zone,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upkeep_task" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"value_cents" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"reward_xp" integer,
	"estimated_minutes" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upkeep_task_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"child_id" text NOT NULL,
	"date" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" text,
	"notes" text,
	"status_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upkeep_task_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"frequency" text NOT NULL,
	"days_of_week" text,
	"interval_weeks" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "upkeep_task_schedule_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wage_ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"task_assignment_id" text,
	"task_title" text,
	"date" text NOT NULL,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"week_start_date" text NOT NULL,
	"week_end_date" text NOT NULL,
	"generated_text" text NOT NULL,
	"edited_text" text,
	"copied_at" timestamp with time zone,
	"checklist" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "castle" ADD CONSTRAINT "castle_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_avatar_unlock" ADD CONSTRAINT "child_avatar_unlock_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_avatar_unlock" ADD CONSTRAINT "child_avatar_unlock_source_quest_id_quest_id_fk" FOREIGN KEY ("source_quest_id") REFERENCES "public"."quest"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_badge" ADD CONSTRAINT "child_badge_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_badge" ADD CONSTRAINT "child_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_consent" ADD CONSTRAINT "child_consent_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_consent" ADD CONSTRAINT "child_consent_consented_by_user_id_user_id_fk" FOREIGN KEY ("consented_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_login_link" ADD CONSTRAINT "child_login_link_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_login_link" ADD CONSTRAINT "child_login_link_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_pin_attempt" ADD CONSTRAINT "child_pin_attempt_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deed_run" ADD CONSTRAINT "deed_run_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excused_day" ADD CONSTRAINT "excused_day_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family" ADD CONSTRAINT "family_parent_user_id_user_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_child" ADD CONSTRAINT "family_member_child_family_member_id_family_member_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_child" ADD CONSTRAINT "family_member_child_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kingdom_progress" ADD CONSTRAINT "kingdom_progress_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_profile" ADD CONSTRAINT "learning_profile_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeup_day" ADD CONSTRAINT "makeup_day_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missed_subject" ADD CONSTRAINT "missed_subject_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missed_subject" ADD CONSTRAINT "missed_subject_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_alert" ADD CONSTRAINT "parent_alert_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_alert" ADD CONSTRAINT "parent_alert_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_alert" ADD CONSTRAINT "parent_alert_quest_assignment_id_quest_assignment_id_fk" FOREIGN KEY ("quest_assignment_id") REFERENCES "public"."quest_assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_alert_dismissal" ADD CONSTRAINT "parent_alert_dismissal_alert_id_parent_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."parent_alert"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_assignment" ADD CONSTRAINT "quest_assignment_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_assignment" ADD CONSTRAINT "quest_assignment_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_assignment" ADD CONSTRAINT "quest_assignment_activity_log_id_activity_log_id_fk" FOREIGN KEY ("activity_log_id") REFERENCES "public"."activity_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_reminder" ADD CONSTRAINT "quest_reminder_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_resource" ADD CONSTRAINT "quest_resource_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_resource" ADD CONSTRAINT "quest_resource_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_schedule" ADD CONSTRAINT "quest_schedule_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_place_found" ADD CONSTRAINT "realm_place_found_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_play_ledger" ADD CONSTRAINT "realm_play_ledger_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_recess_record" ADD CONSTRAINT "realm_recess_record_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_settings" ADD CONSTRAINT "realm_settings_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_trouble_clear" ADD CONSTRAINT "realm_trouble_clear_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realm_visitor_sound" ADD CONSTRAINT "realm_visitor_sound_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recess_block" ADD CONSTRAINT "recess_block_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_break" ADD CONSTRAINT "school_break_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell" ADD CONSTRAINT "spell_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upkeep_task" ADD CONSTRAINT "upkeep_task_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upkeep_task_assignment" ADD CONSTRAINT "upkeep_task_assignment_task_id_upkeep_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."upkeep_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upkeep_task_assignment" ADD CONSTRAINT "upkeep_task_assignment_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upkeep_task_schedule" ADD CONSTRAINT "upkeep_task_schedule_task_id_upkeep_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."upkeep_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_ledger_entry" ADD CONSTRAINT "wage_ledger_entry_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_ledger_entry" ADD CONSTRAINT "wage_ledger_entry_task_assignment_id_upkeep_task_assignment_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."upkeep_task_assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_summary" ADD CONSTRAINT "weekly_summary_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_child_date_idx" ON "activity_log" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "activity_child_subject_date_idx" ON "activity_log" USING btree ("child_id","subject_id","date");--> statement-breakpoint
CREATE INDEX "castle_child_idx" ON "castle" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_email_idx" ON "child" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "child_auth_user_idx" ON "child" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_avatar_unlock_unique_idx" ON "child_avatar_unlock" USING btree ("child_id","category","item_id");--> statement-breakpoint
CREATE INDEX "child_avatar_unlock_child_idx" ON "child_avatar_unlock" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_badge_unique_idx" ON "child_badge" USING btree ("child_id","badge_id");--> statement-breakpoint
CREATE INDEX "child_consent_child_idx" ON "child_consent" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_login_link_token_idx" ON "child_login_link" USING btree ("token");--> statement-breakpoint
CREATE INDEX "child_login_link_child_idx" ON "child_login_link" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_pin_attempt_unique_idx" ON "child_pin_attempt" USING btree ("child_id","ip_address");--> statement-breakpoint
CREATE INDEX "deed_run_child_completed_idx" ON "deed_run" USING btree ("child_id","completed_at");--> statement-breakpoint
CREATE INDEX "drill_item_pool_idx" ON "drill_item" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "excused_day_child_date_idx" ON "excused_day" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "excused_day_child_idx" ON "excused_day" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_login_code_idx" ON "family" USING btree ("login_code");--> statement-breakpoint
CREATE INDEX "family_invite_email_idx" ON "family_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "family_invite_family_idx" ON "family_invite" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_member_unique_idx" ON "family_member" USING btree ("family_id","user_id");--> statement-breakpoint
CREATE INDEX "family_member_user_idx" ON "family_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "family_member_family_idx" ON "family_member" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_member_child_unique_idx" ON "family_member_child" USING btree ("family_member_id","child_id");--> statement-breakpoint
CREATE INDEX "family_member_child_child_idx" ON "family_member_child" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kingdom_progress_child_building_idx" ON "kingdom_progress" USING btree ("child_id","building_id");--> statement-breakpoint
CREATE UNIQUE INDEX "makeup_day_child_date_idx" ON "makeup_day" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "makeup_day_child_idx" ON "makeup_day" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "parent_alert_family_idx" ON "parent_alert" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_alert_dismissal_unique_idx" ON "parent_alert_dismissal" USING btree ("alert_id","user_id");--> statement-breakpoint
CREATE INDEX "parent_alert_dismissal_user_idx" ON "parent_alert_dismissal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quest_child_subject_idx" ON "quest" USING btree ("child_id","subject_id");--> statement-breakpoint
CREATE INDEX "quest_child_active_idx" ON "quest" USING btree ("child_id","is_active");--> statement-breakpoint
CREATE INDEX "assignment_child_date_idx" ON "quest_assignment" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "assignment_quest_date_idx" ON "quest_assignment" USING btree ("quest_id","date");--> statement-breakpoint
CREATE INDEX "assignment_status_idx" ON "quest_assignment" USING btree ("child_id","status","date");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_child_quest_date_idx" ON "quest_assignment" USING btree ("child_id","quest_id","date");--> statement-breakpoint
CREATE INDEX "resource_quest_idx" ON "quest_resource" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX "resource_subject_idx" ON "quest_resource" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "realm_place_found_child_place_idx" ON "realm_place_found" USING btree ("child_id","place_id");--> statement-breakpoint
CREATE INDEX "realm_play_ledger_child_date_idx" ON "realm_play_ledger" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "realm_trouble_clear_child_date_idx" ON "realm_trouble_clear" USING btree ("child_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "realm_trouble_clear_paid_unique_idx" ON "realm_trouble_clear" USING btree ("child_id","date","home_id") WHERE "realm_trouble_clear"."minutes" > 0;--> statement-breakpoint
CREATE INDEX "recess_block_child_day_idx" ON "recess_block" USING btree ("child_id","day_of_week");--> statement-breakpoint
CREATE INDEX "schedule_block_child_day_idx" ON "schedule_block" USING btree ("child_id","day_of_week");--> statement-breakpoint
CREATE INDEX "school_break_family_idx" ON "school_break" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "season_child_idx" ON "season" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_open_unique_idx" ON "season" USING btree ("child_id") WHERE "season"."completed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_mastery_child_skill_idx" ON "skill_mastery" USING btree ("child_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spell_child_slot_idx" ON "spell" USING btree ("child_id","slot");--> statement-breakpoint
CREATE INDEX "spell_child_idx" ON "spell" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "subject_child_active_idx" ON "subject" USING btree ("child_id","is_active");--> statement-breakpoint
CREATE INDEX "upkeep_task_child_active_idx" ON "upkeep_task" USING btree ("child_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "upkeep_assignment_child_task_date_idx" ON "upkeep_task_assignment" USING btree ("child_id","task_id","date");--> statement-breakpoint
CREATE INDEX "upkeep_assignment_child_date_idx" ON "upkeep_task_assignment" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "upkeep_assignment_child_status_idx" ON "upkeep_task_assignment" USING btree ("child_id","status","date");--> statement-breakpoint
CREATE INDEX "wage_ledger_child_idx" ON "wage_ledger_entry" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE INDEX "wage_ledger_assignment_idx" ON "wage_ledger_entry" USING btree ("task_assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "summary_child_week_idx" ON "weekly_summary" USING btree ("child_id","week_start_date");