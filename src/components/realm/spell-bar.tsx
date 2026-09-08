"use client";

import { useEffect } from "react";
import { GameIcon } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

const FEWER = 4;

/** The hero's pages along the bottom of the world. Keys 1–9 select, a second tap or Escape deselects. */
export function SpellBar({
  pages,
  selectedSlot,
  mana,
  fewerChoices,
  onSelect,
  raised,
  hudScale,
}: {
  pages: SpellPageView[];
  selectedSlot: number | null;
  mana: number;
  fewerChoices: boolean;
  onSelect: (slot: number | null) => void;
  raised: boolean;
  hudScale: number;
}) {
  const shown = fewerChoices ? pages.slice(0, FEWER) : pages;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [role='dialog']")) return;
      if (e.key === "Escape") {
        onSelect(null);
        return;
      }
      const index = Number.parseInt(e.key, 10);
      if (!Number.isInteger(index) || index < 1 || index > 9) return;
      const page = shown[index - 1];
      if (!page || !page.spell) return;
      e.preventDefault();
      onSelect(page.slot === selectedSlot ? null : page.slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedSlot, onSelect]);

  return (
    <div
      className={`realm-spellbar${raised ? " realm-spellbar--raised" : ""}`}
      style={{ fontSize: `${12 * hudScale}px` }}
      role="toolbar"
      aria-label="Spellbook"
    >
      {shown.map((page, i) => {
        const selected = page.slot === selectedSlot;
        const affordable = page.spell ? mana >= page.spell.manaCost : false;
        const label = page.spell ? `${page.name}, ${page.spell.manaCost} mana` : page.name;
        return (
          <button
            key={page.slot}
            type="button"
            className={`realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}`}
            style={{ borderColor: page.color }}
            aria-pressed={selected}
            aria-label={label}
            disabled={!page.spell}
            onClick={() => onSelect(selected ? null : page.slot)}
          >
            <span className="realm-spell-key">{i + 1}</span>
            <span className="realm-spell-swatch" style={{ background: page.color }} />
            {page.icon && <GameIcon name={page.icon} className="size-4" />}
            <span className="realm-spell-name">{page.name}</span>
            {selected && page.spell && <span className="realm-spell-cost">{page.spell.manaCost}</span>}
          </button>
        );
      })}
    </div>
  );
}
