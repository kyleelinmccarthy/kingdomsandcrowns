/**
 * Runs the welcome delivery (`welcome-materials.ts`). After deploying the release that introduced
 * materials:
 *
 *   npm run db:backup
 *   npx tsx --env-file=.env.prod src/lib/db/welcome-materials-run.ts --dry-run
 *   npx tsx --env-file=.env.prod src/lib/db/welcome-materials-run.ts
 *
 * Options: `--dry-run` prints without writing; `--days N` sets how far back to look (default 28).
 * Anything else is refused. Safe to run twice.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { parseArgs, UsageError, welcomeMaterials, WELCOME_USAGE } from "./welcome-materials";

async function main() {
  const { dryRun, days } = parseArgs(process.argv.slice(2));
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    const db = drizzle(client, { schema });
    const { perChild, total } = await welcomeMaterials(db, { now: new Date(), days, dryRun });
    const prefix = dryRun ? "[dry-run] " : "";
    for (const [childId, n] of Object.entries(perChild)) {
      console.log(`${prefix}${childId}: ${n} quest(s)`);
    }
    console.log(`${total} quest(s) ${dryRun ? "would bring" : "brought"} materials (last ${days} days).`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  if (err instanceof UsageError) {
    console.error(err.message);
    console.error(WELCOME_USAGE);
  } else {
    console.error(err);
  }
  process.exit(1);
});
