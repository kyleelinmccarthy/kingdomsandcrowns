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
    sound text, created_at integer NOT NULL, updated_at integer NOT NULL)`,
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
  `CREATE TABLE child (id text PRIMARY KEY, family_id text, school_days text)`,
  `CREATE TABLE school_break (id text PRIMARY KEY, family_id text NOT NULL, start_date text NOT NULL, end_date text NOT NULL)`,
];
