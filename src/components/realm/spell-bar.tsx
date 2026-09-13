"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

const FEWER = 4;
export const EMPTY_TITLE = "Make a spell in your Spellbook";
export const EMPTY_HINT = "Your spellbook has room. Make a spell to fill this page.";

/**
 * The pages the bar really draws, and therefore the number keys it really binds.
 *
 * Exported because two surfaces outside this file promise a hero which keys cast — the
 * always-on legend and the how-to-play card — and both used to say "1-4" from a literal
 * while `spellSlots(level)` hands a level-10 hero a fifth page that this bar renders a
 * keycap for and the handler below binds. One function, so the copy counts what the
 * control actually offers instead of what it offered when the sentence was written.
 *
 * Under fewer-choices, show the first four pages that hold a saved spell (never hide one
 * behind an "Empty" chip just because it lives past page four), padding with empty pages
 * only when fewer than four saved pages exist.
 */
export function shownPages(pages: SpellPageView[], fewerChoices: boolean): SpellPageView[] {
  if (!fewerChoices) return pages;
  const withSpell = pages.filter((p) => !p.empty);
  const chosen = withSpell.slice(0, FEWER);
  if (chosen.length < FEWER) {
    const empties = pages.filter((p) => p.empty);
    chosen.push(...empties.slice(0, FEWER - chosen.length));
    chosen.sort((a, b) => a.slot - b.slot); // padding can interleave with saved pages; keep book order
  }
  return chosen;
}

/** The hero's pages along the bottom of the world. A tap or keys 1–9 cast that page and select it; Escape puts it away, and a touch hero has the Put away button instead. An empty page explains where spells come from. */
export function SpellBar({
  pages,
  selectedSlot,
  mana,
  fewerChoices,
  onSelect,
  raised,
  hudScale,
  refused = false,
}: {
  pages: SpellPageView[];
  selectedSlot: number | null;
  mana: number;
  fewerChoices: boolean;
  onSelect: (slot: number | null) => void;
  raised: boolean;
  hudScale: number;
  // True for the 600 ms after a cast the hero could not pay for (§3.7). It shakes the
  // slot that was selected — never the whole bar — so the cue points at the cost.
  refused?: boolean;
}) {
  const shown = useMemo(() => shownPages(pages, fewerChoices), [fewerChoices, pages]);
  const [hint, setHint] = useState(false);
  const hintPanel = useRef<HTMLDivElement>(null);
  const hintOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (hint) hintPanel.current?.focus();
  }, [hint]);

  const closeHint = () => {
    setHint(false);
    hintOpener.current?.focus();
  };

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
      // A number key casts. It never toggles off: pressing 1 twice casts twice, which is
      // what "1 or left click" means. Escape is the way to put a spell away.
      onSelect(page.slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onSelect]);

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
                // Not aria-disabled. An empty page is the ONLY opener of the hint that says
                // where spells come from, so telling a screen-reader child it is unavailable
                // stops them reaching the one explanation they need. It is faded and it is
                // skipped by the number keys because it is not a spell — but it is pressable,
                // and its name says what pressing it is for.
                aria-label={`Empty page ${i + 1}. ${EMPTY_TITLE}.`}
                title={EMPTY_TITLE}
                onClick={(e) => {
                  hintOpener.current = e.currentTarget;
                  setHint(true);
                }}
              >
                <span className="realm-spell-key">{i + 1}</span>
                <span className="realm-spell-name">{page.name}</span>
              </button>
            );
          }
          const selected = page.slot === selectedSlot;
          const affordable = page.spell ? mana >= page.spell.manaCost : false;
          // NOT `aria-pressed`. Task 8 made a chip cast rather than toggle, so the chip is a
          // momentary action, and a toggle's promise — activate it again and it unpresses —
          // is one this button cannot keep: a screen-reader child heard "pressed", activated
          // it to unpress it, cast a second time and heard "pressed" still. The armed state
          // is real, though, so it goes where a plain button can carry it: into the name. The
          // way back out is Escape, or the Put away button a touch hero gets instead of it.
          const base = page.spell ? `${page.name}, ${page.spell.manaCost} mana` : page.name;
          const label = selected ? `${base}, chosen` : base;
          return (
            <button
              key={page.slot}
              type="button"
              className={`realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}${selected && refused ? " realm-spell--refused" : ""}`}
              style={{ borderColor: page.color }}
              aria-label={label}
              disabled={!page.spell}
              // A tap casts, exactly as the number key does — one action, one behaviour, however
              // the child reaches it. The selection simply persists; Escape puts it away, and a
              // touch hero, who has no Escape, taps Put away (realm-hud.tsx) instead.
              onClick={() => onSelect(page.slot)}
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
              closeHint();
            }
          }}
        >
          <p className="realm-spell-hint-text">{EMPTY_HINT}</p>
          <div className="realm-spell-hint-actions">
            <Link href="/spellbook" className="realm-spell-hint-link">Open the Spellbook</Link>
            <button type="button" className="realm-spell-hint-close" onClick={closeHint}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
