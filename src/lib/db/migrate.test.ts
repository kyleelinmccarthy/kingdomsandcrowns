// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { join } from "node:path";
import { ADOPTABLE, loadMigrations, runMigrations } from "./migrate.mjs";

/**
 * `0034_excused_days` and `0035_upkeep_module` restate migrations that first lived on feature
 * branches as each branch's own 0021/0022. Before migrations were limited to production deploys,
 * a branch deploy could apply those to production, so a database may already hold some or all of
 * what 0034 and 0035 create. A plain run would then stop at "table already exists" and roll the
 * deploy back. These tests pin that the runner brings every such database to the same schema as
 * a fresh one, and still refuses anything it does not recognise.
 */

const all = loadMigrations(join(process.cwd(), "src/lib/db/migrations"));
const byTag = (tag: string) => all.find((m) => m.tag === tag)!;
const upTo = (tag: string) => all.slice(0, all.findIndex((m) => m.tag === tag) + 1);
const statements = (tag: string) => byTag(tag).sql.map((s) => s.trim()).filter(Boolean);

/** Newest foreign migration production is known to have held (see migrations-journal.test.ts). */
const PRODUCTION_FOREIGN_MARK = Date.parse("2026-09-07T23:27:54.605Z");

const quiet = { log: () => {} };

function freshDb(): Client {
  return createClient({ url: ":memory:" });
}

/** Applies statements the way a branch deploy did: outside this journal's bookkeeping. */
async function applyForeign(db: Client, sql: string[]) {
  for (const s of sql) await db.execute(s);
}

/** Every table, index and column, in a form two databases can be compared by. */
async function schemaOf(db: Client): Promise<string[]> {
  const objects = await db.execute(
    "select type, name from sqlite_master where name not like 'sqlite_%' and name != '__drizzle_migrations' order by type, name"
  );
  const out: string[] = [];
  for (const row of objects.rows) {
    out.push(`${row.type}:${row.name}`);
    if (row.type !== "table") continue;
    const cols = await db.execute(`select name, type, "notnull", dflt_value from pragma_table_info('${row.name}') order by name`);
    for (const c of cols.rows) out.push(`  ${row.name}.${c.name} ${c.type} notnull=${c.notnull} default=${c.dflt_value}`);
  }
  return out;
}

async function recordedCount(db: Client): Promise<number> {
  return Number((await db.execute("select count(*) n from __drizzle_migrations")).rows[0].n);
}

async function freshSchema(): Promise<string[]> {
  const db = freshDb();
  await runMigrations(db, all, quiet);
  return schemaOf(db);
}

describe("the migration runner", () => {
  it("finds the two adoptable migrations in the journal, so the rules below are not vacuous", () => {
    expect(ADOPTABLE).toEqual(["0034_excused_days", "0035_upkeep_module"]);
    for (const tag of ADOPTABLE) expect(byTag(tag), tag).toBeDefined();
  });

  it("applies every migration to an empty database and records each one", async () => {
    const db = freshDb();
    const result = await runMigrations(db, all, quiet);

    expect(result.applied).toEqual(all.map((m) => m.tag));
    expect(result.adopted).toEqual([]);
    expect(await recordedCount(db)).toBe(all.length);
    const schema = await schemaOf(db);
    for (const name of ["table:excused_day", "table:makeup_day", "table:upkeep_task", "table:wage_ledger_entry"]) {
      expect(schema).toContain(name);
    }
  });

  it("does nothing on a second run", async () => {
    const db = freshDb();
    await runMigrations(db, all, quiet);
    const result = await runMigrations(db, all, quiet);

    expect(result.applied).toEqual([]);
    expect(await recordedCount(db)).toBe(all.length);
  });

  it("applies only what is new to a database that is partly migrated", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    const result = await runMigrations(db, all, quiet);

    expect(result.applied).toEqual(["0034_excused_days", "0035_upkeep_module"]);
    expect(result.adopted).toEqual([]);
    expect(await schemaOf(db)).toEqual(await freshSchema());
  });

  it("adopts excused-days objects a branch deploy already created", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    await applyForeign(db, statements("0034_excused_days"));

    const result = await runMigrations(db, all, quiet);

    expect(result.adopted).toEqual([
      { tag: "0034_excused_days", skipped: statements("0034_excused_days").length },
    ]);
    expect(await recordedCount(db)).toBe(all.length);
    expect(await schemaOf(db)).toEqual(await freshSchema());
  });

  it("adopts both branches' objects when both were already created", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    await applyForeign(db, [...statements("0034_excused_days"), ...statements("0035_upkeep_module")]);

    const result = await runMigrations(db, all, quiet);

    expect(result.adopted.map((a) => a.tag)).toEqual(["0034_excused_days", "0035_upkeep_module"]);
    expect(await schemaOf(db)).toEqual(await freshSchema());
  });

  it("finishes a migration that is only partly in place", async () => {
    // The upkeep branch added child.upkeep_requires_approval in a second migration of its own,
    // so a database can hold everything else in 0035 without it.
    const partial = statements("0035_upkeep_module").filter((s) => !s.includes("`child` ADD `upkeep_requires_approval`"));
    expect(partial.length).toBe(statements("0035_upkeep_module").length - 1);

    const db = freshDb();
    await runMigrations(db, upTo("0034_excused_days"), quiet);
    await applyForeign(db, partial);

    const result = await runMigrations(db, all, quiet);

    expect(result.adopted).toEqual([{ tag: "0035_upkeep_module", skipped: partial.length }]);
    expect(await schemaOf(db)).toEqual(await freshSchema());
  });

  it("keeps the rows already in an adopted table", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    await applyForeign(db, statements("0034_excused_days"));
    await db.execute("PRAGMA foreign_keys=off");
    await db.execute(
      "insert into excused_day (id, child_id, date, reason, created_at, updated_at) values ('e1', 'kid', '2026-08-31', 'sick', 0, 0)"
    );

    await runMigrations(db, all, quiet);

    expect((await db.execute("select id from excused_day")).rows.map((r) => r.id)).toEqual(["e1"]);
  });

  it("migrates production's own history: foreign 0021/0022 applied over main's 0020", async () => {
    // The state the b0b8c11 fix was written for, one step further back than production is now.
    const db = freshDb();
    await runMigrations(db, all.slice(0, 21), quiet);
    await applyForeign(db, statements("0034_excused_days"));
    await db.execute({
      sql: 'insert into __drizzle_migrations ("hash", "created_at") values (?, ?)',
      args: ["foreign-0022_parallel_the_spike", PRODUCTION_FOREIGN_MARK],
    });

    const result = await runMigrations(db, all, quiet);

    expect(result.applied).toEqual(all.slice(21).map((m) => m.tag));
    expect(result.adopted.map((a) => a.tag)).toEqual(["0034_excused_days"]);
    expect(await schemaOf(db)).toEqual(await freshSchema());
  });

  it("refuses an existing table that lacks a column the migration expects, and changes nothing", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    await db.execute("create table excused_day (id text primary key not null, child_id text not null)");
    const before = await schemaOf(db);

    await expect(runMigrations(db, all, quiet)).rejects.toThrow(/excused_day[\s\S]*date/);
    expect(await schemaOf(db)).toEqual(before);
    expect(await recordedCount(db)).toBe(upTo("0033_wealthy_reptil").length);
  });

  it("refuses an existing index that is defined differently", async () => {
    const db = freshDb();
    await runMigrations(db, upTo("0033_wealthy_reptil"), quiet);
    await applyForeign(
      db,
      statements("0034_excused_days").map((s) =>
        s.startsWith("CREATE UNIQUE INDEX `excused_day_child_date_idx`")
          ? "CREATE INDEX `excused_day_child_date_idx` ON `excused_day` (`date`)"
          : s
      )
    );

    await expect(runMigrations(db, all, quiet)).rejects.toThrow(/excused_day_child_date_idx/);
  });

  it("still fails on a clash in a migration that is not adoptable", async () => {
    // Tolerance is granted to two named migrations, not to the journal as a whole.
    const db = freshDb();
    await runMigrations(db, all.slice(0, 21), quiet);
    await db.execute("create table season (id text primary key)");
    const before = await recordedCount(db);

    await expect(runMigrations(db, all, quiet)).rejects.toThrow(/season/);
    expect(await recordedCount(db)).toBe(before);
  });

  it("only knows the statement kinds the adoptable migrations actually use", () => {
    for (const tag of ADOPTABLE) {
      for (const s of statements(tag)) {
        expect(s, tag).toMatch(/^(CREATE TABLE `|CREATE (UNIQUE )?INDEX `|ALTER TABLE `\w+` ADD `)/);
      }
    }
  });
});
