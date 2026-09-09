"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

const FEWER = 4;
export const EMPTY_TITLE = "Make a spell in your Spellbook";
export const EMPTY_HINT = "Your spellbook has room. Make a spell to fill this page.";

/** The hero's pages along the bottom of the world. Keys 1–9 select, a second tap or Escape deselects; an empty page explains where spells come from. */
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
  const [hint, setHint] = useState(false);
  const hintPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hint) hintPanel.current?.focus();
  }, [hint]);

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
      if (!page || !page.spell) return; // faded and empty pages are not spells
      e.preventDefault();
      onSelect(page.slot === selectedSlot ? null : page.slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedSlot, onSelect]);

  return (
    <>
      <div
        className={`realm-spellbar${raised ? " realm-spellbar--raised" : ""}`}
        style={{ fontSize: `${12 * hudScale}px` }}
        role="toolbar"
        aria-label="Spellbook"
      >
        {shown.map((page, i) => {
          if (page.empty) {
            return (
              <button
                key={page.slot}
                type="button"
                className="realm-spell realm-spell--empty"
                aria-disabled="true"
                aria-label={`Empty page ${i + 1}`}
                title={EMPTY_TITLE}
                onClick={() => setHint(true)}
              >
                <span className="realm-spell-key">{i + 1}</span>
                <span className="realm-spell-name">{page.name}</span>
              </button>
            );
          }
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
      {hint && (
        <div
          ref={hintPanel}
          className={`realm-spell-hint${raised ? " realm-spell-hint--raised" : ""}`}
          role="dialog"
          aria-label="Empty page"
          tabIndex={-1}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setHint(false);
            }
          }}
        >
          <p className="realm-spell-hint-text">{EMPTY_HINT}</p>
          <div className="realm-spell-hint-actions">
            <Link href="/spellbook" className="realm-spell-hint-link">Open the Spellbook</Link>
            <button type="button" className="realm-spell-hint-close" onClick={() => setHint(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
