/**
 * The welcome delivery: quests finished before materials shipped get the materials they would have
 * brought, once. Run it by hand after deploying the release that introduced materials:
 *
 *   npm run db:backup
 *   npx tsx --env-file=.env.prod src/lib/db/welcome-materials.ts --dry-run
 *   npx tsx --env-file=.env.prod src/lib/db/welcome-materials.ts
 *
 * Idempotent: a quest that already has an earned row (from the live grant, or from an earlier run
 * of this script) is skipped, and the partial unique index on `source_assignment_id` backs that
 * up, so running it twice changes nothing. Options: `--dry-run` prints without writing, and
 * `--days N` sets how far back to look (default 28).
 *
 * It applies the rule of `grantMaterialsForCompletion` (`lib/services/realm-materials.ts`) directly,
 * because that service binds the app's database and in-process lock: `materialsPerQuest` of the
 * quest's subject material, whatever `enabled` and `accessMode` say, none at 0.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { nanoid } from "nanoid";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { resolveMaterial } from "../realm/materials";
import { settingsFromRow } from "../utils/realm-settings";

export const DEFAULT_WELCOME_DAYS = 28;

export type WelcomeResult = { perChild: Record<string, number>; total: number };

/**
 * Mints a welcome earning for every quest completed in the last `days` days that has no earned
 * row yet. `perChild` counts the earnings written (or, in a dry run, the ones that would be).
 */
export async function welcomeMaterials(
  db: LibSQLDatabase<typeof schema>,
  { now, days = DEFAULT_WELCOME_DAYS, dryRun = false }: { now: Date; days?: number; dryRun?: boolean },
): Promise<WelcomeResult> {
  const A = schema.questAssignment;
  const M = schema.realmMaterial;
  const since = new Date(Math.floor(now.getTime() / 1000) * 1000 - days * 86_400 * 1000);

  const pending = await db
    .select({ id: A.id, childId: A.childId, name: schema.subject.name, material: schema.subject.material })
    .from(A)
    .innerJoin(schema.quest, eq(A.questId, schema.quest.id))
    .leftJoin(schema.subject, eq(schema.quest.subjectId, schema.subject.id))
    .where(
      and(
        eq(A.status, "completed"),
        gte(A.completedAt, since),
        sql`NOT EXISTS (SELECT 1 FROM ${M} WHERE ${M.sourceAssignmentId} = ${A.id} AND ${M.kind} = 'earned')`,
      ),
    )
    .orderBy(A.completedAt, A.id);

  const perChild: Record<string, number> = {};
  if (pending.length === 0) return { perChild, total: 0 };

  // Only the amount is read: a missing settings row gives the defaults.
  const childIds = [...new Set(pending.map((p) => p.childId))];
  const settingRows = await db
    .select({ childId: schema.realmSettings.childId, materialsPerQuest: schema.realmSettings.materialsPerQuest })
    .from(schema.realmSettings)
    .where(inArray(schema.realmSettings.childId, childIds));
  const amountFor = new Map(settingRows.map((r) => [r.childId, settingsFromRow(r).materialsPerQuest]));

  let total = 0;
  for (const p of pending) {
    const amount = amountFor.get(p.childId) ?? settingsFromRow(null).materialsPerQuest;
    if (amount <= 0) continue;
    if (!dryRun) {
      const minted = await db
        .insert(M)
        .values({
          id: nanoid(),
          childId: p.childId,
          // A quest with no subject (or a deleted one) brings timber, like any unmatched name.
          materialId: resolveMaterial({ name: p.name ?? "", material: p.material ?? null }),
          amount,
          kind: "earned",
          origin: "welcome",
          sourceAssignmentId: p.id,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: M.id });
      if (minted.length === 0) continue;
    }
    perChild[p.childId] = (perChild[p.childId] ?? 0) + 1;
    total += 1;
  }
  return { perChild, total };
}

function parseDays(argv: string[]): number {
  const i = argv.indexOf("--days");
  if (i === -1) return DEFAULT_WELCOME_DAYS;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0) throw new Error("--days takes a whole number of days, like --days 28.");
  return n;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const days = parseDays(process.argv);
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    const db = drizzle(client, { schema });
    const { perChild, total } = await welcomeMaterials(db, { now: new Date(), days, dryRun });
    const prefix = dryRun ? "[dry-run] " : "";
    for (const [childId, n] of Object.entries(perChild)) {
      console.log(`${prefix}${childId}: ${n} quest(s)`);
    }
    console.log(`${total} quest(s) ${dryRun ? "would bring" : "brought"} materials (last ${days} days).`);
  } finally {
    client.close();
  }
}

// Run only when started as a script, never when a test imports `welcomeMaterials`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
