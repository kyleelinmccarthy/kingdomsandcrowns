import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type InValue } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { queueLocalWrites } from "@/lib/db/local-write-queue";

/**
 * A real libsql database for the `*-db.test.ts` tests, which is what production runs (Turso is
 * libsql). A file in a fresh temp directory rather than `:memory:`, because a libsql write
 * transaction opens its own connection and every connection must see the same database. Writes,
 * the test's own `query` included, wait for an open transaction as they do on Turso
 * (`queueLocalWrites`).
 *
 * `query` takes SQLite SQL with `?1`-style parameters. A Date parameter is stored as epoch
 * seconds and a boolean as 0/1, the way drizzle's `{ mode: "timestamp" }` and
 * `{ mode: "boolean" }` columns store them.
 */
export function testDatabase(name: string) {
  const dir = mkdtempSync(path.join(tmpdir(), `${name}-`));
  const client = queueLocalWrites(createClient({ url: `file:${path.join(dir, "test.db")}` }));
  const db = drizzle(client, { schema });

  // Rows are loosely typed, as a test reads back whatever columns it asked for.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function query(sql: string, params: readonly unknown[] = []): Promise<{ rows: any[] }> {
    const r = await client.execute({ sql, args: params.map(toArg) });
    // Plain objects keyed by column name (a libsql row also carries its values by index).
    return { rows: r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c, row[c]]))) };
  }

  function close() {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }

  return { client, db, query, close };
}

function toArg(v: unknown): InValue {
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v as InValue;
}
