-- Custom SQL migration file, put your code below! --
UPDATE kingdom_progress SET announced_at = completed_at
 WHERE completed_at IS NOT NULL AND announced_at IS NULL;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('well-stones','well-signs','well-water')) >= 3;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('mill-sacks','mill-ledger','mill-wheel')) >= 3;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('bridge-planks','bridge-toll')) >= 2;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('chapel-bell','chapel-scroll','chapel-stars')) >= 3;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('market-prices','market-crier')) >= 2;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('library-shelves','library-catalog','library-scribe')) >= 3;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('watchtower-height','watchtower-signals')) >= 2;
--> statement-breakpoint
UPDATE kingdom_progress
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
           AND dr.deed_id IN ('garden-beds','garden-bees')) >= 2;
--> statement-breakpoint
UPDATE realm_settings
   SET regraded_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE regraded_at IS NULL
   AND child_id IN (SELECT child_id FROM kingdom_progress
                     WHERE completed_at IS NOT NULL AND announced_at IS NULL);
