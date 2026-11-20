import { afterEach, describe, expect, it } from "vitest";
import { testDatabase } from "./libsql-test-db";
import { applyMigrations } from "./apply-migrations";
import { REALM_WORLD_STATE_DDL } from "./realm-db-ddl";

// A hand-written copy of a table is only worth having while it is the table the migrations make.
const open: ReturnType<typeof testDatabase>[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});

async function shape(pool: ReturnType<typeof testDatabase>, table: string) {
  const columns = (await pool.query(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}') ORDER BY cid`)).rows;
  const indexes = (await pool.query(`SELECT name, "unique", partial FROM pragma_index_list('${table}') ORDER BY name`)).rows;
  const keys: Record<string, string[]> = {};
  for (const ix of indexes) keys[ix.name] = (await pool.query(`SELECT name FROM pragma_index_info('${ix.name}') ORDER BY seqno`)).rows.map((r) => r.name);
  return { columns, indexes, keys };
}

describe("the world state's test DDL", () => {
  it("builds the table migration 0044 builds", async () => {
    const real = testDatabase("ddl-real");
    const copy = testDatabase("ddl-copy");
    open.push(real, copy);
    await applyMigrations(real);
    for (const stmt of REALM_WORLD_STATE_DDL) await copy.client.execute(stmt);
    const want = await shape(real, "realm_world_state");
    expect(want.columns.map((c) => c.name)).toEqual(["id", "child_id", "object_id", "state", "updated_at"]);
    expect(await shape(copy, "realm_world_state")).toEqual(want);
  });

  it("keeps one row per hero and object", async () => {
    const pool = testDatabase("ddl-unique");
    open.push(pool);
    for (const stmt of REALM_WORLD_STATE_DDL) await pool.client.execute(stmt);
    const insert = (id: string, child: string, object: string) => pool.query(`INSERT INTO realm_world_state (id, child_id, object_id, state, updated_at) VALUES (?1, ?2, ?3, 'open', 0)`, [id, child, object]);
    await insert("a", "c1", "chest:west-lane");
    await insert("b", "c2", "chest:west-lane");
    await expect(insert("c", "c1", "chest:west-lane")).rejects.toThrow(/UNIQUE/i);
  });
});
