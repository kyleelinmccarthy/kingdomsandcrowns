import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { levelFromXp } from "@/lib/utils/level";
import { spellSlots } from "@/lib/utils/spell-slots";
import { loadRealmFlags } from "./realm-play";

/** One saved page of a hero's spellbook: catalog ids plus the chosen name. */
export type SpellPage = {
  id: string;
  slot: number;
  elementId: string;
  formId: string;
  modifierId: string | null;
  adjective: string;
  noun: string;
};

export function toPage(row: typeof schema.spell.$inferSelect): SpellPage {
  return { id: row.id, slot: row.slot, elementId: row.elementId, formId: row.formId, modifierId: row.modifierId, adjective: row.adjective, noun: row.noun };
}

/** The pages and slot count the Realm and the Spellbook page both read. Unlock rules live in the action. */
export async function loadSpellbookPages(childId: string): Promise<{ spells: SpellPage[]; slots: number; level: number }> {
  const [childRows, rows] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select().from(schema.spell).where(eq(schema.spell.childId, childId)).orderBy(schema.spell.slot),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  return { spells: rows.map(toPage), slots: spellSlots(level), level };
}

/** Every hero's first page: two free parts, so the bar is never empty on a first visit. */
export const STARTER_SPELL = { slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" } as const;

export type StarterDecision = "seed" | "mark" | "none";

/** Seed once, never twice; a hero who already built spells is only marked. */
export function starterSpellDecision(hasSpells: boolean, starterSpellAt: Date | null): StarterDecision {
  if (starterSpellAt) return "none";
  return hasSpells ? "mark" : "seed";
}

export async function ensureStarterSpell(childId: string): Promise<StarterDecision> {
  const flags = await loadRealmFlags(childId);
  const existing = await db.select({ id: schema.spell.id }).from(schema.spell).where(eq(schema.spell.childId, childId)).limit(1);
  const decision = starterSpellDecision(existing.length > 0, flags.starterSpellAt);
  if (decision === "none") return decision;
  const now = new Date();
  if (decision === "seed") {
    await db.insert(schema.spell).values({ id: nanoid(), childId, ...STARTER_SPELL, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }
  await db.update(schema.realmSettings).set({ starterSpellAt: now, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
  return decision;
}
