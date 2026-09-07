import { findElement, findForm, resolveSpell, type SpellDefinition } from "@/lib/utils/spell-catalog";
import type { SpellPage } from "@/lib/services/spells";
import type { GameIconName } from "@/components/game-icon";

export const FADED_PAGE = "This page is faded.";

export type SpellPageView = { slot: number; name: string; spell: SpellDefinition | null; color: string; icon: GameIconName | null };

/** Pages the bar and the scene share: resolved once, sorted by slot, faded when a part is gone from the catalog. */
export function resolvePages(spells: SpellPage[], slots: number): SpellPageView[] {
  return spells
    .filter((s) => s.slot < slots)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => {
      const spell = resolveSpell({ elementId: s.elementId, formId: s.formId, modifierId: s.modifierId });
      if (!spell) return { slot: s.slot, name: FADED_PAGE, spell: null, color: "#6b7280", icon: null };
      return { slot: s.slot, name: `${s.adjective} ${s.noun}`, spell, color: findElement(s.elementId)!.color, icon: findForm(s.formId)!.icon };
    });
}
