/**
 * Loads every pool in src/content/drills into drill_item, upserting by item
 * id so content edits propagate. Never deletes: a retired item simply stops
 * being drawn once its skill no longer references the pool.
 *
 * Idempotent. Run with:
 *   npx tsx --env-file=.env.prod src/lib/db/seed-drills.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { skillForPool } from "../utils/skills";
import { bandForGrade, type Grade } from "../utils/grade-levels";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

/**
 * A pool is authored for ONE grade — `docs/content/ela-science-skill-map.md` says which — and
 * the file says so itself rather than naming the band it used to sit in.
 */
type PoolFile = {
  poolId: string;
  grade: Grade;
  items: { id: string; prompt: string; answer: string; distractors: string[]; readAloud?: string; level?: number }[];
};

async function main() {
  const dir = path.join(process.cwd(), "src/content/drills");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const file of files) {
    const pool = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as PoolFile;
    const skill = skillForPool(pool.poolId);
    if (!skill) {
      console.warn(`Skipping ${pool.poolId}: no skill references it.`);
      continue;
    }
    for (const item of pool.items) {
      const row = {
        id: item.id,
        poolId: pool.poolId,
        skillId: skill.id,
        // The `band` COLUMN stays so the schema needs no migration, but it is derived from
        // the grade now and is no longer an axis: nothing chooses content by it. Write it
        // from the grade rather than from the file, so the two can never disagree.
        band: bandForGrade(pool.grade),
        prompt: item.prompt,
        answer: item.answer,
        distractors: JSON.stringify(item.distractors),
        readAloud: item.readAloud ?? null,
        level: item.level ?? 2,
        updatedAt: new Date(),
      };
      await db.insert(schema.drillItem).values(row).onConflictDoUpdate({ target: schema.drillItem.id, set: row });
      count += 1;
    }
  }
  console.log(`Seeded ${count} drill items from ${files.length} pools.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
