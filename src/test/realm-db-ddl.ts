/**
 * The Realm's play tables as the migrations make them, for the real-database tests (`*-db.test.ts`),
 * each of which runs them in its own temporary libsql database. Foreign keys are left out: no child or family rows
 * are needed to prove the ledger's arithmetic. The partial unique indexes ARE kept — they are what
 * make "once a day" and "once a run" hold under two tabs at once.
 */
export const REALM_SETTINGS_DDL = [
  `CREATE TABLE realm_settings (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL UNIQUE,
    enabled integer DEFAULT true NOT NULL, access_mode text DEFAULT 'earned' NOT NULL,
    earned_minutes_per_quest integer DEFAULT 5 NOT NULL, off_hours_enabled integer DEFAULT false NOT NULL,
    daily_cap_minutes integer DEFAULT 30 NOT NULL, tone_mode text DEFAULT 'gentle' NOT NULL,
    help_seen_at integer, starter_spell_at integer, depth_override text DEFAULT 'auto' NOT NULL,
    tutorial_step integer DEFAULT 0 NOT NULL, trouble_bonus_cap_minutes integer DEFAULT 5 NOT NULL,
    side_quest_length integer DEFAULT 8 NOT NULL, second_chances integer DEFAULT true NOT NULL,
    daily_allowance_minutes integer DEFAULT 10 NOT NULL, minutes_per_star integer DEFAULT 1 NOT NULL,
    side_quest_daily_cap_minutes integer DEFAULT 15 NOT NULL, bank_cap_minutes integer DEFAULT 30 NOT NULL,
    sound text, mechanics text, materials_per_quest integer DEFAULT 1 NOT NULL,
    show_minutes_on_quests integer DEFAULT false NOT NULL, pinned_plan text, delivery_seen_at integer, regraded_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL)`,
];

export const REALM_LEDGER_DDL = [
  `CREATE TABLE realm_play_ledger (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, kind text NOT NULL,
    minutes integer NOT NULL, source_assignment_id text, source_run_id text, created_at integer NOT NULL)`,
  `CREATE INDEX realm_play_ledger_child_date_idx ON realm_play_ledger (child_id, date)`,
  `CREATE UNIQUE INDEX realm_play_ledger_allowance_day_idx ON realm_play_ledger (child_id, date) WHERE "realm_play_ledger"."kind" = 'allowance'`,
  `CREATE UNIQUE INDEX realm_play_ledger_carried_day_idx ON realm_play_ledger (child_id, date) WHERE "realm_play_ledger"."kind" = 'carried'`,
  `CREATE UNIQUE INDEX realm_play_ledger_practice_run_idx ON realm_play_ledger (source_run_id) WHERE "realm_play_ledger"."kind" = 'practice'`,
];

export const REALM_TROUBLE_CLEAR_DDL = [
  `CREATE TABLE realm_trouble_clear (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, date text NOT NULL, home_id text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX realm_trouble_clear_paid_unique_idx ON realm_trouble_clear (child_id, date, home_id) WHERE "realm_trouble_clear"."minutes" > 0`,
];

/** What an access answer reads beside the ledger (`services/realm-access-scene.ts`): the day's schedule and the school calendar. */
export const REALM_ACCESS_DDL = [
  `CREATE TABLE schedule_block (id text PRIMARY KEY, child_id text NOT NULL, day_of_week text NOT NULL, start_time text NOT NULL, end_time text NOT NULL)`,
  `CREATE TABLE recess_block (id text PRIMARY KEY, child_id text NOT NULL, day_of_week text NOT NULL, start_time text NOT NULL, end_time text NOT NULL)`,
  `CREATE TABLE child (id text PRIMARY KEY, family_id text, school_days text, display_name text)`,
  `CREATE TABLE school_break (id text PRIMARY KEY, family_id text NOT NULL, start_date text NOT NULL, end_date text NOT NULL)`,
];

/** The materials ledger (migration 0041). The partial unique index is what makes "a quest mints once" hold under two tabs. */
export const REALM_MATERIAL_DDL = [
  `CREATE TABLE realm_material (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, material_id text NOT NULL, amount integer NOT NULL,
    kind text NOT NULL, origin text DEFAULT 'quest' NOT NULL, source_assignment_id text, improvement_id text,
    level integer, created_at integer NOT NULL)`,
  `CREATE INDEX realm_material_child_created_idx ON realm_material (child_id, created_at)`,
  `CREATE UNIQUE INDEX realm_material_earned_assignment_idx ON realm_material (source_assignment_id) WHERE "realm_material"."kind" = 'earned'`,
];

/** The built levels of improvements (migration 0041). The unique index is what makes "two tabs build a level once" hold. */
export const REALM_IMPROVEMENT_DDL = [
  `CREATE TABLE realm_improvement (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, improvement_id text NOT NULL, level integer NOT NULL,
    stars integer NOT NULL, season_id text, built_by_name text NOT NULL, sources text NOT NULL, built_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX realm_improvement_child_level_idx ON realm_improvement (child_id, improvement_id, level)`,
];

/** How far a hero has raised each kingdom building, with its migration-0041 columns (announced, raised by). */
export const KINGDOM_PROGRESS_DDL = [
  `CREATE TABLE kingdom_progress (
    id text PRIMARY KEY NOT NULL, child_id text NOT NULL, building_id text NOT NULL,
    deeds_done integer DEFAULT 0 NOT NULL, completed_at integer, announced_at integer,
    raised_by_name text, raised_season_id text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
  `CREATE UNIQUE INDEX kingdom_progress_child_building_idx ON kingdom_progress (child_id, building_id)`,
];

/**
 * What a plaque reads at the moment a level is built (`finishBuild`): the quests that paid for it
 * (assignment, quest, subject) and the hero's open season. Only the columns those reads use.
 */
export const REALM_PLAQUE_DDL = [
  `CREATE TABLE quest_assignment (id text PRIMARY KEY NOT NULL, quest_id text NOT NULL, child_id text NOT NULL, date text NOT NULL)`,
  `CREATE TABLE quest (id text PRIMARY KEY NOT NULL, title text NOT NULL, subject_id text)`,
  `CREATE TABLE subject (id text PRIMARY KEY NOT NULL, name text NOT NULL, material text)`,
  `CREATE TABLE season (id text PRIMARY KEY NOT NULL, child_id text NOT NULL, ordinal integer DEFAULT 1 NOT NULL, start_date text NOT NULL, completed_at integer)`,
];
