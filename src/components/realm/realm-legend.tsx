"use client";

/** The five verbs, always on screen. Not in the help card: a card you have to open is
 *  what failed the two previous times the controls were reported as unclear. */
export function RealmLegend({ showStick }: { showStick: boolean }) {
  if (showStick) return null; // touch has buttons, and no keyboard to describe
  return (
    <p className="realm-legend" data-testid="realm-legend" aria-label="Controls">
      <span className="realm-legend-key">WASD</span> move
      <span className="realm-legend-key">1-4</span> cast
      <span className="realm-legend-key">E</span> interact
      <span className="realm-legend-key">Click</span> cast
    </p>
  );
}
