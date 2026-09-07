import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { levelFromXp } from "@/lib/utils/level";
import { spellSlots } from "@/lib/utils/spell-slots";

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
