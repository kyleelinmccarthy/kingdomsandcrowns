"use client";

import { villagerById } from "@/lib/realm/villagers";
import { markerFor } from "@/lib/realm/markers";
import type { VillagerPlacement } from "@/lib/realm/layout";
import type { Surfaces } from "@/lib/realm/depth";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

/**
 * One villager's nameplate: who they are, which site they keep, and whether they
 * have work for you. `buildWorldLayout` has computed all three since the world was
 * first drawn; nothing rendered them.
 *
 * Plain DOM on purpose. The drei `<Html>` that anchors this over the sprite lives in
 * realm-scene.tsx, which is the only file in this layer allowed to import three — so
 * every string below is reachable from a jsdom test, and the camera being orthographic
 * means a DOM pill and a sprite are the same size at any distance anyway.
 */
export function VillagerPlate({
  villager,
  surfaces,
  calm,
  motion,
  onPick,
}: {
  villager: VillagerPlacement;
  surfaces: Surfaces;
  calm: boolean;
  motion: boolean;
  onPick: (id: string) => void;
}) {
  const name = villagerById(villager.id)?.name ?? villager.label;
  const marker = markerFor(villager.status);
  const built = villager.status === "built";
  // `total` is 0 only when the kingdom's progress never loaded. The plate then names the
  // person and the place and claims no progress at all, rather than inventing "0 of 0".
  const hasProgress = villager.total > 0;
  const progress = `${villager.done} of ${villager.total}`;
  // Pips substitute for numerals on screen, never in the accessible name (§6).
  const countName = `${progress} ${SIDE_QUESTS_LOWER} done.`;

  const tag = built
    ? `${villager.label} · Built`
    : hasProgress && surfaces.numerals
      ? `${villager.label} · ${progress}`
      : villager.label;

  const accessibleName = built
    ? `${name}. ${villager.label}, built.`
    : hasProgress
      ? `${name}. ${villager.label}, ${countName}${villager.status === "objective" ? " Waiting for you." : ""}`
      : `${name}. ${villager.label}.`;

  const showPips = !built && hasProgress && !surfaces.numerals;

  return (
    <button
      type="button"
      className={[
        "realm-plate",
        calm ? "realm-plate--calm" : "",
        // reducedMotion's substitute for the bobbing badge: the objective plate still
        // stands out, it just does it without moving.
        marker === "quest" && !motion ? "realm-plate--outline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={accessibleName}
      // The reach bubble does the same: a pointer that lands on a plate must never also
      // reach the canvas underneath and walk the hero somewhere vaguely nearby.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onPick(villager.id)}
    >
      <span className="realm-plate-name">
        {marker && (
          <span
            className={[
              "realm-plate-badge",
              marker === "quest" ? "realm-plate-badge--quest" : "realm-plate-badge--done",
              marker === "quest" && motion ? "realm-plate-badge--bob" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {marker === "quest" ? "!" : "✓"}
          </span>
        )}
        {name}
      </span>
      <span className="realm-plate-tag">{tag}</span>
      {showPips && (
        <span className="realm-pips" role="img" aria-label={countName}>
          {Array.from({ length: villager.total }, (_, i) => (
            <span key={i} className={i < villager.done ? "realm-pip realm-pip--on" : "realm-pip"} />
          ))}
        </span>
      )}
    </button>
  );
}
