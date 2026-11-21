/**
 * Driving the blind pass for trail pools from a terminal. The twin of `sort-blind-pass-cli.ts`.
 *
 *   npx tsx src/lib/content/trail-blind-pass-cli.ts extract <poolId...|--all> [--force]
 *   npx tsx src/lib/content/trail-blind-pass-cli.ts compare <poolId...|--all>
 *
 * `extract` cuts `src/content/review/<poolId>.blind.md`: the village's places and every clue of the
 * pool in a shuffled order, with no key and no trail ids. An independent reader (a person, or an agent
 * that has not read the pool file) writes a place id beside every clue, `both` and the ids that also
 * fit when more than one place does, or `?` when none does. `compare` reads the filled-in sheet back
 * and reports every disagreement, every clue called ambiguous or unplaceable, and every clue nobody
 * answered. It exits non-zero while anything is outstanding.
 *
 * A flag is settled by adding an entry to `src/content/review/<poolId>.resolved.json` (the same file and
 * verdicts as a drill pool; `itemId` is `<trail id>/<clue number>` and `keyAt` is the answer's anchor
 * id). Editing a clue and running `extract --force` instead carries every unchanged answer forward and
 * blanks the edited clue's. See `src/content/review/README.md`, "Trail pools".
 *
 * `npx vitest run src/lib/content/trail-blind-pass.test.ts` runs `compare` over every trail sheet on
 * disk, so an unsettled flag fails the suite as well as this command.
 */
import { allTrailPoolIds, formatTrailReport, loadTrailPool, runTrailPool, writeTrailSheet } from "./trail-blind-pass";

const USAGE = `usage:
  npx tsx src/lib/content/trail-blind-pass-cli.ts extract <poolId...|--all> [--force]
  npx tsx src/lib/content/trail-blind-pass-cli.ts compare <poolId...|--all>`;

function main(): number {
  const args = process.argv.slice(2);
  const command = args[0];
  const force = args.includes("--force");
  const named = args.slice(1).filter((a) => !a.startsWith("--"));
  const all = args.includes("--all");
  const poolIds = all ? allTrailPoolIds() : named;

  if ((command !== "extract" && command !== "compare") || (!all && poolIds.length === 0)) {
    console.error(USAGE);
    return 2;
  }
  if (poolIds.length === 0) {
    console.log("no trail pools in src/content/trails yet");
    return 0;
  }

  if (command === "extract") {
    for (const poolId of poolIds) {
      const { path: file, written } = writeTrailSheet(loadTrailPool(poolId), force);
      console.log(written ? `wrote ${file}` : `unchanged ${file}`);
    }
    console.log("\nAnswer every clue on these sheets WITHOUT opening src/content/trails.");
    return 0;
  }

  let failed = 0;
  for (const poolId of poolIds) {
    const report = runTrailPool(poolId);
    console.log(formatTrailReport(report));
    if (!report.ok) failed++;
  }
  if (failed > 0) console.log(`\n${failed} pool(s) with something outstanding.`);
  return failed > 0 ? 1 : 0;
}

process.exit(main());
