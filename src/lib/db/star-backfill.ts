/**
 * Appended verbatim to migration 0037. A deed run finished before stars existed had no second
 * tries, so its points over its maximum is just correct over total; the thresholds are
 * `SCORING.starThresholds` (a test keeps the two in step). Re-running changes nothing: it only
 * touches finished deeds still at 0 stars, and a run that earns 0 stars stays at 0.
 */
export const STAR_BACKFILL_SQL = `UPDATE deed_run SET stars = CASE
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.9 THEN 3
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.65 THEN 2
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions), 0) >= 0.35 THEN 1
  ELSE 0 END
WHERE completed_at IS NOT NULL AND kind = 'deed' AND stars = 0;`;
