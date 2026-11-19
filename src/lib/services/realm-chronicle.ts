import { and, desc, eq, gte, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getTimezoneForChild } from "@/lib/services/family-timezone";
import { resolveMaterial, MATERIALS } from "@/lib/realm/materials";
import { addDays, todayInZone, weekStartOf } from "@/lib/utils/dates";
import { parseDrawing, hasDrawing, type Drawing } from "@/lib/utils/drawing";
import { parseSeal, type Seal } from "@/lib/utils/seals";

/** One page of the Chronicle: a finished quest the hero told in notes, a drawing, or a grown-up's seal. */
export type ChronicleEntry = {
  assignmentId: string;
  /** The day it was finished, in the family's time zone (YYYY-MM-DD). */
  date: string;
  title: string;
  subject: string | null;
  /** The colour of the material the subject's work brings. */
  materialColor: string;
  notes: string | null;
  drawing: Drawing | null;
  seal: Seal | null;
};

export type ChronicleWeek = {
  /** The Monday of the week (YYYY-MM-DD). */
  weekStart: string;
  entries: ChronicleEntry[];
};

const FALLBACK_TITLE = "A quest";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 52;

/** The weeks to read: a whole number from 1 to 52, and eight when it is not a number at all. */
function clampWeeks(weeks: number): number {
  if (Number.isNaN(weeks)) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(1, Math.floor(weeks)));
}

/**
 * The hero's Chronicle: finished quests from the last `weeks` weeks (this week counts as one) that
 * have Scribe's Notes, a drawing or a seal, grouped by Monday-start week, newest week first and
 * newest entry first.
 *
 * One query. The quest and subject are LEFT-joined, so a quest or subject that has since been
 * deleted or switched off still has its page (a missing title reads "A quest"). A stored drawing
 * or seal that no longer parses reads as null, and an entry left with nothing to show is dropped.
 */
export async function loadChronicle(
  childId: string,
  { weeks = 8, now = new Date() }: { weeks?: number; now?: Date } = {},
): Promise<ChronicleWeek[]> {
  const zone = await getTimezoneForChild(childId);
  const firstWeek = addDays(weekStartOf(todayInZone(zone, now)), -7 * (clampWeeks(weeks) - 1));
  // The week is a calendar date, the column an instant: read a day wider than any time zone can
  // shift it, then keep exactly the entries whose own date lands in the window.
  const since = new Date(new Date(`${firstWeek}T00:00:00Z`).getTime() - DAY_MS);

  const rows = await db
    .select({
      id: schema.questAssignment.id,
      completedAt: schema.questAssignment.completedAt,
      notes: schema.questAssignment.notes,
      drawing: schema.questAssignment.drawing,
      seal: schema.questAssignment.seal,
      title: schema.quest.title,
      subjectName: schema.subject.name,
      subjectMaterial: schema.subject.material,
    })
    .from(schema.questAssignment)
    .leftJoin(schema.quest, eq(schema.quest.id, schema.questAssignment.questId))
    .leftJoin(schema.subject, eq(schema.subject.id, schema.quest.subjectId))
    .where(
      and(
        eq(schema.questAssignment.childId, childId),
        eq(schema.questAssignment.status, "completed"),
        isNotNull(schema.questAssignment.completedAt),
        gte(schema.questAssignment.completedAt, since),
        or(isNotNull(schema.questAssignment.notes), isNotNull(schema.questAssignment.drawing), isNotNull(schema.questAssignment.seal)),
      ),
    )
    .orderBy(desc(schema.questAssignment.completedAt), desc(schema.questAssignment.id));

  const byWeek = new Map<string, ChronicleEntry[]>();
  for (const row of rows) {
    if (!row.completedAt) continue;
    const date = todayInZone(zone, row.completedAt);
    if (date < firstWeek) continue;
    const notes = row.notes?.trim() ? row.notes : null;
    const drawing = parseDrawing(row.drawing);
    const seal = parseSeal(row.seal);
    const kept = hasDrawing(drawing) ? drawing : null;
    if (!notes && !kept && !seal) continue;
    const entry: ChronicleEntry = {
      assignmentId: row.id,
      date,
      title: row.title?.trim() || FALLBACK_TITLE,
      subject: row.subjectName ?? null,
      materialColor: MATERIALS[row.subjectName ? resolveMaterial({ name: row.subjectName, material: row.subjectMaterial }) : "timber"].color,
      notes,
      drawing: kept,
      seal,
    };
    const weekStart = weekStartOf(date);
    const list = byWeek.get(weekStart);
    if (list) list.push(entry);
    else byWeek.set(weekStart, [entry]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekStart, entries]) => ({ weekStart, entries }));
}
