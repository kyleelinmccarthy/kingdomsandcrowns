// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SCORING } from "@/lib/utils/deed-scoring";
import { STAR_BACKFILL_SQL } from "./star-backfill";

/**
 * Runs against a real libsql database, which is what production runs (Turso is libsql).
 * The backfill gives runs finished before stars existed the stars their first answers earn: an old
 * run has no second tries, so its points over its maximum is just correct over total.
 */
const MIGRATIONS = join(__dirname, "migrations");
const client = createClient({ url: ":memory:" });

const questions = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `q${i}` })));

async function starsOf(id: string): Promise<number> {
  const r = await client.execute({ sql: "SELECT stars FROM deed_run WHERE id = ?", args: [id] });
  return Number(r.rows[0].stars);
}

describe("star backfill", () => {
  it("is appended verbatim to the generated migration", () => {
    const file = readdirSync(MIGRATIONS).find((f) => f.startsWith("0037_") && f.endsWith(".sql"));
    expect(file).toBeDefined();
    expect(readFileSync(join(MIGRATIONS, file!), "utf8")).toContain(STAR_BACKFILL_SQL);
  });

  it("uses the thresholds the scoring rules pin", () => {
    const written = [...STAR_BACKFILL_SQL.matchAll(/>=\s*([0-9.]+)\s+THEN/g)].map((m) => Number(m[1]));
    expect(written).toEqual([...SCORING.starThresholds].reverse());
  });

  describe("against libsql", () => {
    beforeAll(async () => {
      await client.execute(`CREATE TABLE deed_run (
        id text PRIMARY KEY NOT NULL, questions text NOT NULL, correct_count integer DEFAULT 0 NOT NULL,
        stars integer DEFAULT 0 NOT NULL, kind text DEFAULT 'deed' NOT NULL, completed_at integer)`);
      const rows: [string, number, number, boolean, string][] = [
        ["all", 8, 8, true, "deed"],
        ["most", 8, 6, true, "deed"],
        ["some", 8, 3, true, "deed"],
        ["few", 8, 2, true, "deed"],
        ["open", 8, 8, false, "deed"],
        ["challenge", 3, 3, true, "challenge"],
        ["empty", 0, 0, true, "deed"],
      ];
      for (const [id, total, correct, done, kind] of rows) {
        await client.execute({
          sql: "INSERT INTO deed_run (id, questions, correct_count, kind, completed_at) VALUES (?, ?, ?, ?, ?)",
          args: [id, questions(total), correct, kind, done ? Math.floor(Date.now() / 1000) : null],
        });
      }
    });
    afterAll(() => client.close());

    it("gives finished runs 3, 2, 1 and 0 stars and leaves the rest alone", async () => {
      await client.execute(STAR_BACKFILL_SQL);
      expect(await starsOf("all")).toBe(3);
      expect(await starsOf("most")).toBe(2);
      expect(await starsOf("some")).toBe(1);
      expect(await starsOf("few")).toBe(0);
      expect(await starsOf("open")).toBe(0);
      expect(await starsOf("challenge")).toBe(0);
      expect(await starsOf("empty")).toBe(0);
    });

    it("changes nothing the second time", async () => {
      const before = await client.execute("SELECT id, stars FROM deed_run ORDER BY id");
      await client.execute(STAR_BACKFILL_SQL);
      const after = await client.execute("SELECT id, stars FROM deed_run ORDER BY id");
      expect(after.rows.map((r) => [r.id, r.stars])).toEqual(before.rows.map((r) => [r.id, r.stars]));
    });
  });
});
