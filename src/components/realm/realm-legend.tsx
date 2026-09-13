"use client";

/**
 * The keys the ability bar really binds, as the legend's short range.
 *
 * `spellSlots(level)` is `min(MAX, 4 + floor(level/10))`, so from level 10 a hero has a
 * fifth page, the bar draws its keycap and the handler binds `5` — while this pill said
 * "1-4" from a literal. One page is not a range at all, so it is written as a single key.
 */
function castKeys(spellPages: number): string {
  return spellPages <= 1 ? "1" : `1-${spellPages}`;
}

/** The five verbs, always on screen. Not in the help card: a card you have to open is
 *  what failed the two previous times the controls were reported as unclear. */
export function RealmLegend({ showStick, spellPages }: { showStick: boolean; spellPages: number }) {
  if (showStick) return null; // touch has buttons, and no keyboard to describe
  return (
    <p className="realm-legend" data-testid="realm-legend">
      <span className="realm-legend-key">WASD</span> move{" "}
      <span className="realm-legend-key">{castKeys(spellPages)}</span> cast{" "}
      <span className="realm-legend-key">E</span> interact{" "}
      <span className="realm-legend-key">Click</span> cast
    </p>
  );
}
