/**
 * Migration 0042's data step, the record of the work (spec D13.5), pasted verbatim into
 * `migrations/0042_record_of_the_work.sql`; `record-of-work.test.ts` holds the two in step and
 * checks every building's stories and count against the catalog, so the SQL cannot drift from it.
 *
 * 1. A building that already stood is marked announced at its own date: no one is told again about
 *    a rise they watched long ago.
 * 2. A building whose stories were each finished once with a star, on a side-quest run, is completed
 *    (the new rule, D13.1–D13.2), dated by the newest such run, and left unannounced so the world
 *    plays its rise on the next visit. Its name and season stay null: no backfill (D13.9).
 * 3. The heroes who got such a building are flagged (`regraded_at`), so only they hear why.
 *
 * Step 1 runs before step 2, or it would announce the very rows step 2 completes. Seconds, never
 * milliseconds (drizzle's `mode: "timestamp"`). Drizzle applies it once; were it ever re-run, step 2
 * (`completed_at IS NULL`) and step 3 (`regraded_at IS NULL`) would change nothing, but step 1 would
 * mark the retro rows announced, since it cannot tell them from rows that stood before.
 */
export const RECORD_OF_WORK_STATEMENTS: readonly string[] = [
  `UPDATE kingdom_progress SET announced_at = completed_at
 WHERE completed_at IS NOT NULL AND announced_at IS NULL;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('well-stones','well-signs','well-water')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'well'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('well-stones','well-signs','well-water')) >= 3;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('mill-sacks','mill-ledger','mill-wheel')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'mill'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('mill-sacks','mill-ledger','mill-wheel')) >= 3;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('bridge-planks','bridge-toll')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'bridge'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('bridge-planks','bridge-toll')) >= 2;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('chapel-bell','chapel-scroll','chapel-stars')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'chapel'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('chapel-bell','chapel-scroll','chapel-stars')) >= 3;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('market-prices','market-crier')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'market'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('market-prices','market-crier')) >= 2;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('library-shelves','library-catalog','library-scribe')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'library'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('library-shelves','library-catalog','library-scribe')) >= 3;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('watchtower-height','watchtower-signals')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'watchtower'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('watchtower-height','watchtower-signals')) >= 2;`,
  `UPDATE kingdom_progress
   SET completed_at = COALESCE(
         (SELECT MAX(dr.completed_at) FROM deed_run dr
           WHERE dr.child_id = kingdom_progress.child_id
             AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
             AND dr.deed_id IN ('garden-beds','garden-bees')),
         CAST(strftime('%s','now') AS INTEGER)),
       updated_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE building_id = 'garden'
   AND completed_at IS NULL
   AND (SELECT COUNT(DISTINCT dr.deed_id) FROM deed_run dr
         WHERE dr.child_id = kingdom_progress.child_id
           AND dr.kind = 'deed' AND dr.stars >= 1 AND dr.completed_at IS NOT NULL
           AND dr.deed_id IN ('garden-beds','garden-bees')) >= 2;`,
  `UPDATE realm_settings
   SET regraded_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE regraded_at IS NULL
   AND child_id IN (SELECT child_id FROM kingdom_progress
                     WHERE completed_at IS NOT NULL AND announced_at IS NULL);`,
];

/** The statements as the migration file holds them, split where drizzle's migrator splits. */
export const RECORD_OF_WORK_SQL = RECORD_OF_WORK_STATEMENTS.join("\n--> statement-breakpoint\n");
