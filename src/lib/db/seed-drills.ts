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

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

type PoolFile = {
  poolId: string;
  band: "k1" | "g23" | "g45" | "g68" | "g912";
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
        band: pool.band,
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
