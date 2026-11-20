import path from "node:path";
import { loadMigrations } from "@/lib/db/migrate.mjs";
import type { testDatabase } from "./libsql-test-db";

/**
 * Build the whole schema from the real drizzle migrations, for a `*-db.test.ts` that would
 * otherwise hand-write DDL for many wide tables. Foreign keys are switched off afterwards, so a
 * test seeds only the rows the code under test reads.
 */
export async function applyMigrations(pool: ReturnType<typeof testDatabase>): Promise<void> {
  const migrations = loadMigrations(path.join(process.cwd(), "src/lib/db/migrations"));
  for (const { sql } of migrations) {
    for (const stmt of sql) {
      if (stmt.trim()) await pool.client.execute(stmt);
    }
  }
  await pool.client.execute("PRAGMA foreign_keys = OFF");
}
