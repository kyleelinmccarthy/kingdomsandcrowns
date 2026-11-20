/**
 * Driving the blind pass for sort pools from a terminal. The twin of `blind-pass-cli.ts`.
 *
 *   npx tsx src/lib/content/sort-blind-pass-cli.ts extract <poolId...|--all> [--force]
 *   npx tsx src/lib/content/sort-blind-pass-cli.ts compare <poolId...|--all>
 *
 * `extract` cuts `src/content/review/<poolId>.blind.md`, a key-free sheet listing each set's two bins
 * and its items in a shuffled order. An independent reader (a person, or an agent that has not read
 * the pool file) writes 0 or 1 beside every item. `compare` reads the filled-in sheet back and reports
 * every disagreement, every item called ambiguous or unplaceable, and every item nobody answered. It
 * exits non-zero while anything is outstanding.
 *
 * A flag is settled by adding an entry to `src/content/review/<poolId>.resolved.json` (the same file and
 * verdicts as a drill pool; `keyAt` is the NAME of the bin the key put the item in). See
 * `src/content/review/README.md`, "Sort pools".
 *
 * `npx vitest run src/lib/content/sort-blind-pass.test.ts` runs `compare` over every sort sheet on
 * disk, so an unsettled flag fails the suite as well as this command.
 */
import { allSortPoolIds, formatSortReport, loadSortPool, runSortPool, writeSortSheet } from "./sort-blind-pass";

const USAGE = `usage:
  npx tsx src/lib/content/sort-blind-pass-cli.ts extract <poolId...|--all> [--force]
  npx tsx src/lib/content/sort-blind-pass-cli.ts compare <poolId...|--all>`;

function main(): number {
  const args = process.argv.slice(2);
  const command = args[0];
  const force = args.includes("--force");
  const named = args.slice(1).filter((a) => !a.startsWith("--"));
  const all = args.includes("--all");
  const poolIds = all ? allSortPoolIds() : named;

  if ((command !== "extract" && command !== "compare") || (!all && poolIds.length === 0)) {
    console.error(USAGE);
    return 2;
  }
  if (poolIds.length === 0) {
    console.log("no sort pools in src/content/sorts yet");
    return 0;
  }

  if (command === "extract") {
    for (const poolId of poolIds) {
      const { path: file, written } = writeSortSheet(loadSortPool(poolId), force);
      console.log(written ? `wrote ${file}` : `unchanged ${file}`);
    }
    console.log("\nAnswer every item on these sheets WITHOUT opening src/content/sorts.");
    return 0;
  }

  let failed = 0;
  for (const poolId of poolIds) {
    const report = runSortPool(poolId);
    console.log(formatSortReport(report));
    if (!report.ok) failed++;
  }
  if (failed > 0) console.log(`\n${failed} pool(s) with something outstanding.`);
  return failed > 0 ? 1 : 0;
}

process.exit(main());
