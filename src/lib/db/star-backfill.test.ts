// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SCORING } from "@/lib/utils/deed-scoring";
import { STAR_BACKFILL_SQL } from "./star-backfill";

/**
 * Runs in its own schema so it can share a Postgres server with the other real-database tests.
 * The backfill gives runs finished before stars existed the stars their first answers earn: an old
 * run has no second tries, so its points over its maximum is just correct over total.
 */
const SCHEMA = "test_star_backfill";
const MIGRATIONS = join(__dirname, "migrations");
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
});

const questions = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `q${i}` })));

async function starsOf(id: string): Promise<number> {
  const r = await client.query("SELECT stars FROM deed_run WHERE id = $1", [id]);
  return r.rows[0].stars;
}

describe("star backfill", () => {
  it("is appended verbatim to the generated migration", () => {
    const file = readdirSync(MIGRATIONS).find((f) => f.startsWith("0002_") && f.endsWith(".sql"));
    expect(file).toBeDefined();
    expect(readFileSync(join(MIGRATIONS, file!), "utf8")).toContain(STAR_BACKFILL_SQL);
  });

  it("uses the thresholds the scoring rules pin", () => {
    const written = [...STAR_BACKFILL_SQL.matchAll(/>=\s*([0-9.]+)\s+THEN/g)].map((m) => Number(m[1]));
    expect(written).toEqual([...SCORING.starThresholds].reverse());
  });

  describe("against Postgres", () => {
    beforeAll(async () => {
      await client.connect();
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await client.query(`CREATE SCHEMA "${SCHEMA}"`);
      await client.query(`SET search_path TO "${SCHEMA}"`);
      await client.query(`CREATE TABLE deed_run (
        id text PRIMARY KEY NOT NULL, questions text NOT NULL, correct_count integer DEFAULT 0 NOT NULL,
        stars integer DEFAULT 0 NOT NULL, kind text DEFAULT 'deed' NOT NULL, completed_at timestamptz)`);
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
        await client.query("INSERT INTO deed_run (id, questions, correct_count, kind, completed_at) VALUES ($1, $2, $3, $4, $5)", [
          id,
          questions(total),
          correct,
          kind,
          done ? new Date() : null,
        ]);
      }
    });
    afterAll(async () => {
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await client.end();
    });

    it("gives finished runs 3, 2, 1 and 0 stars and leaves the rest alone", async () => {
      await client.query(STAR_BACKFILL_SQL);
      expect(await starsOf("all")).toBe(3);
      expect(await starsOf("most")).toBe(2);
      expect(await starsOf("some")).toBe(1);
      expect(await starsOf("few")).toBe(0);
      expect(await starsOf("open")).toBe(0);
      expect(await starsOf("challenge")).toBe(0);
      expect(await starsOf("empty")).toBe(0);
    });

    it("changes nothing the second time", async () => {
      const before = await client.query("SELECT id, stars FROM deed_run ORDER BY id");
      await client.query(STAR_BACKFILL_SQL);
      const after = await client.query("SELECT id, stars FROM deed_run ORDER BY id");
      expect(after.rows).toEqual(before.rows);
    });
  });
});
