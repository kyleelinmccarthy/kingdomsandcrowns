/**
 * Applies the committed migrations. This is what `npm run db:migrate` runs, locally and in the
 * production build.
 *
 * It does what drizzle's libsql migrator does (same journal, same `__drizzle_migrations` table,
 * same hashes, one atomic batch), with one addition: for the migrations named in ADOPTABLE,
 * a statement whose table, index or column is already in the database is skipped rather than
 * run.
 *
 * Why those two. `0034_excused_days` and `0035_upkeep_module` restate migrations that first
 * lived on feature branches, as each branch's own 0021/0022. Before migrations were limited to
 * production deploys, a branch deploy could apply them to the production database, so it may
 * already hold some or all of what they create. SQLite has no `ADD COLUMN IF NOT EXISTS`, so the
 * SQL alone cannot be made safe to repeat; the check has to happen here. With it, a database
 * that has none, some or all of those objects ends at the same schema, with both migrations
 * recorded.
 *
 * Skipping is not forgiving. An existing table must have every column the migration declares,
 * and an existing index must be defined the same way; otherwise the run stops before anything
 * is changed. No other migration gets this treatment: a clash anywhere else still fails.
 *
 * Plain .mjs so the production build can run it with node alone.
 */
import { createClient } from "@libsql/client";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Migrations whose objects a database may already hold. See the note above. */
export const ADOPTABLE = ["0034_excused_days", "0035_upkeep_module"];

const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * @typedef {{ tag: string, sql: string[], hash: string, folderMillis: number }} Migration
 */

/**
 * The journal's migrations in order, each with its tag.
 * @param {string} migrationsFolder
 * @returns {Migration[]}
 */
export function loadMigrations(migrationsFolder) {
  const files = readMigrationFiles({ migrationsFolder });
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"));
  return files.map((file, i) => ({
    tag: journal.entries[i].tag,
    sql: file.sql,
    hash: file.hash,
    folderMillis: file.folderMillis,
  }));
}

/** @param {string} sql */
function normalize(sql) {
  return sql.replace(/[`"'\s;]/g, "").toLowerCase();
}

/**
 * What one statement of an adoptable migration creates.
 * @param {string} statement
 */
function parse(statement) {
  const table = /^CREATE TABLE `(\w+)` \(/.exec(statement);
  if (table) {
    const columns = [...statement.matchAll(/^\s+`(\w+)` /gm)].map((m) => m[1]);
    return { kind: /** @type {const} */ ("table"), name: table[1], columns };
  }
  const index = /^CREATE (?:UNIQUE )?INDEX `(\w+)` ON `(\w+)`/.exec(statement);
  if (index) return { kind: /** @type {const} */ ("index"), name: index[1], table: index[2] };
  const column = /^ALTER TABLE `(\w+)` ADD `(\w+)` /.exec(statement);
  if (column) return { kind: /** @type {const} */ ("column"), name: column[2], table: column[1] };
  return null;
}

/**
 * The statements of an adoptable migration that still need to run against this database.
 * Throws, before anything is changed, when an object that already exists is not the one the
 * migration would have made.
 *
 * @param {import("@libsql/client").Client} client
 * @param {Migration} migration
 * @returns {Promise<{ statements: string[], skipped: number }>}
 */
async function pendingStatements(client, migration) {
  const existing = await client.execute("select type, name, sql from sqlite_master where type in ('table', 'index')");
  const tables = new Set(existing.rows.filter((r) => r.type === "table").map((r) => String(r.name)));
  const indexes = new Map(existing.rows.filter((r) => r.type === "index").map((r) => [String(r.name), String(r.sql ?? "")]));

  /** @type {Map<string, Set<string>>} */
  const columnCache = new Map();
  /** @param {string} table */
  async function columnsOf(table) {
    let columns = columnCache.get(table);
    if (!columns) {
      const info = await client.execute(`select name from pragma_table_info('${table}')`);
      columns = new Set(info.rows.map((r) => String(r.name)));
      columnCache.set(table, columns);
    }
    return columns;
  }

  const statements = [];
  let skipped = 0;

  for (const raw of migration.sql) {
    const statement = raw.trim();
    if (!statement) continue;
    const target = parse(statement);
    if (!target) {
      throw new Error(`${migration.tag}: cannot tell what this statement creates, so cannot check for it:\n${statement}`);
    }

    if (target.kind === "table") {
      if (!tables.has(target.name)) {
        statements.push(raw);
        continue;
      }
      const have = await columnsOf(target.name);
      const missing = target.columns.filter((c) => !have.has(c));
      if (missing.length > 0) {
        throw new Error(
          `${migration.tag}: table ${target.name} already exists but lacks ${missing.join(", ")}. ` +
            "It is not the table this migration creates; nothing was changed."
        );
      }
      skipped++;
    } else if (target.kind === "index") {
      const have = indexes.get(target.name);
      if (have === undefined) {
        statements.push(raw);
        continue;
      }
      if (normalize(have) !== normalize(statement)) {
        throw new Error(
          `${migration.tag}: index ${target.name} already exists with a different definition ` +
            `(${have}). Nothing was changed.`
        );
      }
      skipped++;
    } else {
      // A column on a table this same migration creates is covered by the table check above.
      if (tables.has(target.table) && (await columnsOf(target.table)).has(target.name)) skipped++;
      else statements.push(raw);
    }
  }

  return { statements, skipped };
}

/**
 * Brings a database up to the given migrations.
 *
 * @param {import("@libsql/client").Client} client
 * @param {Migration[]} migrations
 * @param {{ log?: (line: string) => void }} [options]
 * @returns {Promise<{ applied: string[], adopted: { tag: string, skipped: number }[] }>}
 */
export async function runMigrations(client, migrations, options = {}) {
  const log = options.log ?? console.log;

  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );
  const last = await client.execute(`SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`);
  // drizzle keeps one high-water mark: everything dated after it is pending.
  const mark = last.rows.length > 0 ? Number(last.rows[0].created_at) : null;

  /** @type {import("@libsql/client").InStatement[]} */
  const batch = [];
  const applied = [];
  const adopted = [];

  for (const migration of migrations) {
    if (mark !== null && mark >= migration.folderMillis) continue;

    if (ADOPTABLE.includes(migration.tag)) {
      const { statements, skipped } = await pendingStatements(client, migration);
      batch.push(...statements);
      if (skipped > 0) adopted.push({ tag: migration.tag, skipped });
    } else {
      batch.push(...migration.sql);
    }
    batch.push({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`,
      args: [migration.hash, migration.folderMillis],
    });
    applied.push(migration.tag);
  }

  if (batch.length > 0) await client.migrate(batch);

  for (const { tag, skipped } of adopted) {
    log(`${tag}: ${skipped} statement(s) were already in place and were left as they are.`);
  }
  log(applied.length > 0 ? `Applied ${applied.length} migration(s): ${applied.join(", ")}` : "No migrations to apply.");

  return { applied, adopted };
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  try {
    await runMigrations(client, loadMigrations(join(dirname(fileURLToPath(import.meta.url)), "migrations")));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
