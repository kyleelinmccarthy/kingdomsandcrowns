/**
 * The welcome delivery: quests finished before materials shipped get the materials they would have
 * brought, once. Importable and side-effect free; `welcome-materials-run.ts` is the command-line
 * entry (see it for the runbook line).
 *
 * Idempotent: a quest that already has an earned row (from the live grant, or from an earlier run
 * of this script) is skipped, and the partial unique index on `source_assignment_id` backs that
 * up, so running it twice changes nothing.
 *
 * It applies the rule of `grantMaterialsForCompletion` (`lib/services/realm-materials.ts`) directly,
 * because that service binds the app's database and in-process lock: `materialsPerQuest` of the
 * quest's subject material, whatever `enabled` and `accessMode` say, none at 0.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { nanoid } from "nanoid";
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

/** A mistake in how the script was started: reported as a message and a usage line, not a stack trace. */
export class UsageError extends Error {}

export const WELCOME_USAGE = "Usage: welcome-materials-run.ts [--dry-run] [--days N]";

/**
 * Strict on purpose: this writes to production once, so a mistyped flag (`--dryrun`) must stop
 * the run rather than be ignored and do a real write.
 */
export function parseArgs(argv: string[]): { dryRun: boolean; days: number } {
  let dryRun = false;
  let days = DEFAULT_WELCOME_DAYS;
  const readDays = (raw: string | undefined) => {
    const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new UsageError("--days takes a whole number of days above 0, like --days 28.");
    days = n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--days") readDays(argv[++i]);
    else if (arg.startsWith("--days=")) readDays(arg.slice("--days=".length));
    else throw new UsageError(`Unknown option: ${arg}`);
  }
  return { dryRun, days };
}

