import { readFileSync } from "node:fs";
import path from "node:path";
import type { testDatabase } from "./libsql-test-db";

/**
 * Build the whole schema from the real drizzle migrations, for a `*-db.test.ts` that would
 * otherwise hand-write DDL for many wide tables. Foreign keys are switched off afterwards, so a
 * test seeds only the rows the code under test reads.
 */
export async function applyMigrations(pool: ReturnType<typeof testDatabase>): Promise<void> {
  const dir = path.join(process.cwd(), "src/lib/db/migrations");
  const journal = JSON.parse(readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const sql = readFileSync(path.join(dir, `${tag}.sql`), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pool.client.execute(stmt);
    }
  }
  await pool.client.execute("PRAGMA foreign_keys = OFF");
}
