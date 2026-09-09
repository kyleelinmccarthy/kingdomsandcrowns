"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { levelFromXp } from "@/lib/utils/level";
import { spellSlots } from "@/lib/utils/spell-slots";
import { toPage, loadSpellbookPages, ensureStarterSpell } from "@/lib/services/spells";
import {
  resolveSpell,
  unlockedPartIds,
  SPELL_CATEGORY,
  type SpellUnlockContext,
} from "@/lib/utils/spell-catalog";
import { isValidSpellName } from "@/lib/utils/spell-names";
import type { SpellSchool } from "@/lib/utils/spell-schools";
import { getSchoolCounts } from "./subjects";

export type SpellRecord = {
  id: string;
  slot: number;
  elementId: string;
  formId: string;
  modifierId: string | null;
  adjective: string;
  noun: string;
};

export type SpellInput = Omit<SpellRecord, "id" | "slot">;

export type Spellbook = {
  spells: SpellRecord[];
  slots: number;
  level: number;
  /** Part ids this hero may use, decided once here so the builder never re-derives it. */
  unlocked: string[];
  schoolCounts: Record<SpellSchool, number>;
  subjectNamesBySchool: Record<SpellSchool, string[]>;
};

const SPELL_CATEGORIES = Object.values(SPELL_CATEGORY);

const toRecord = toPage;

/** Everything the unlock rules need about one hero, loaded in parallel. */
async function loadUnlockContext(childId: string) {
  const [childRows, badges, unlocks, schoolCounts, subjects] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db
      .select({ itemId: schema.childAvatarUnlock.itemId })
      .from(schema.childAvatarUnlock)
      .where(and(eq(schema.childAvatarUnlock.childId, childId), inArray(schema.childAvatarUnlock.category, SPELL_CATEGORIES))),
    getSchoolCounts(childId),
    db
      .select({ name: schema.subject.name, spellSchool: schema.subject.spellSchool })
      .from(schema.subject)
      .where(and(eq(schema.subject.childId, childId), eq(schema.subject.isActive, true)))
      .orderBy(schema.subject.sortOrder),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  const subjectNamesBySchool: Record<SpellSchool, string[]> = { element: [], form: [], modifier: [] };
  for (const s of subjects) {
    if (s.spellSchool !== "none") subjectNamesBySchool[s.spellSchool].push(s.name);
  }
  const ctx: SpellUnlockContext = {
    level,
    earnedBadgeIds: badges.map((b) => b.badgeId),
    questUnlockedIds: new Set(unlocks.map((u) => u.itemId)),
    schoolCounts,
  };
  return { level, ctx, subjectNamesBySchool };
}

/** A hero may read their own spellbook. */
export async function getSpellbook(childId: string): Promise<Spellbook> {
  await requireChildAccess(childId);
  await ensureStarterSpell(childId).catch((err: unknown) => console.error("Starter spell failed", err));
  const [{ level, ctx, subjectNamesBySchool }, spellbook] = await Promise.all([
    loadUnlockContext(childId),
    loadSpellbookPages(childId),
  ]);
  return {
    spells: spellbook.spells,
    slots: spellbook.slots,
    level,
    unlocked: [...unlockedPartIds(ctx)],
    schoolCounts: ctx.schoolCounts,
    subjectNamesBySchool,
  };
}

/**
 * Hero or grown-up. Every rule is checked again here with fresh data, because
 * the builder's view of what is unlocked can be minutes stale.
 */
export async function saveSpell(childId: string, slot: number, input: SpellInput): Promise<SpellRecord> {
  await requireChildAccess(childId, { write: true });
  const { level, ctx } = await loadUnlockContext(childId);
  if (!Number.isInteger(slot) || slot < 1 || slot > spellSlots(level)) {
    throw new Error("That page of the spellbook isn't open yet.");
  }
  const parts = { elementId: input.elementId, formId: input.formId, modifierId: input.modifierId ?? null };
  const unlocked = unlockedPartIds(ctx);
  const partsOpen =
    unlocked.has(parts.elementId) &&
    unlocked.has(parts.formId) &&
    (parts.modifierId === null || unlocked.has(parts.modifierId));
  if (!partsOpen || !resolveSpell(parts)) throw new Error("That part is still sealed.");
  if (!isValidSpellName(parts, input.adjective, input.noun)) throw new Error("Pick a name from the word bank.");

  const now = new Date();
  await db
    .insert(schema.spell)
    .values({
      id: nanoid(),
      childId,
      slot,
      elementId: parts.elementId,
      formId: parts.formId,
      modifierId: parts.modifierId,
      adjective: input.adjective,
      noun: input.noun,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.spell.childId, schema.spell.slot],
      set: {
        elementId: parts.elementId,
        formId: parts.formId,
        modifierId: parts.modifierId,
        adjective: input.adjective,
        noun: input.noun,
        updatedAt: now,
      },
    });
  const rows = await db
    .select()
    .from(schema.spell)
    .where(and(eq(schema.spell.childId, childId), eq(schema.spell.slot, slot)))
    .limit(1);
  revalidatePath("/spellbook");
  revalidatePath("/loot");
  return toRecord(rows[0]);
}

export async function clearSpell(childId: string, slot: number): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await db.delete(schema.spell).where(and(eq(schema.spell.childId, childId), eq(schema.spell.slot, slot)));
  revalidatePath("/spellbook");
  revalidatePath("/loot");
}
