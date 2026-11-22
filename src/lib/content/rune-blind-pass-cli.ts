/**
 * Driving the blind pass for rune pools from a terminal. The twin of `trail-blind-pass-cli.ts`.
 *
 *   npx tsx src/lib/content/rune-blind-pass-cli.ts extract <poolId...|--all> [--force]
 *   npx tsx src/lib/content/rune-blind-pass-cli.ts compare <poolId...|--all>
 *
 * `extract` cuts `src/content/review/<poolId>.blind.md`: every entry of the pool in a shuffled order,
 * each as its picture, its shown line, its heard line (a dictation's, or a meaning's narration) and its
 * tiles sorted A-Z, with no entry id, hint, `why` or key. An independent reader (a person, or an agent
 * that has not read the pool file) writes the word they would build beside every entry, `both` and
 * every word that fits when more than one does, or `?` when none does. At a dictation (k1, g23) the
 * reader is told the word and checks only that it can be built and that the line fits the picture.
 * `compare` reads the filled-in sheet back and reports every disagreement, every word the tiles cannot
 * build, every entry called ambiguous or unanswerable, and every entry nobody answered. It exits
 * non-zero while anything is outstanding.
 *
 * A flag is settled by adding an entry to `src/content/review/<poolId>.resolved.json` (the same file and
 * verdicts as a drill pool; `itemId` is the entry id and `keyAt` the accepted words joined with
 * commas). Editing an entry and running `extract --force` instead carries every unchanged answer
 * forward and blanks the edited entry's. See `src/content/review/README.md`, "Rune pools".
 *
 * `npx vitest run src/lib/content/rune-blind-pass.test.ts` runs `compare` over every rune sheet on
 * disk, so an unsettled flag fails the suite as well as this command.
 */
import { allRunePoolIds, formatRuneReport, loadRunePool, runRunePool, writeRuneSheet } from "./rune-blind-pass";

const USAGE = `usage:
  npx tsx src/lib/content/rune-blind-pass-cli.ts extract <poolId...|--all> [--force]
  npx tsx src/lib/content/rune-blind-pass-cli.ts compare <poolId...|--all>`;

function main(): number {
  const args = process.argv.slice(2);
  const command = args[0];
  const force = args.includes("--force");
  const named = args.slice(1).filter((a) => !a.startsWith("--"));
  const all = args.includes("--all");
  const poolIds = all ? allRunePoolIds() : named;

  if ((command !== "extract" && command !== "compare") || (!all && poolIds.length === 0)) {
    console.error(USAGE);
    return 2;
  }
  if (poolIds.length === 0) {
    console.log("no rune pools in src/content/runes yet");
    return 0;
  }

  if (command === "extract") {
    for (const poolId of poolIds) {
      const { path: file, written } = writeRuneSheet(loadRunePool(poolId), force);
      console.log(written ? `wrote ${file}` : `unchanged ${file}`);
    }
    console.log("\nAnswer every entry on these sheets WITHOUT opening src/content/runes.");
    return 0;
  }

  let failed = 0;
  for (const poolId of poolIds) {
    const report = runRunePool(poolId);
    console.log(formatRuneReport(report));
    if (!report.ok) failed++;
  }
  if (failed > 0) console.log(`\n${failed} pool(s) with something outstanding.`);
  return failed > 0 ? 1 : 0;
}

process.exit(main());
