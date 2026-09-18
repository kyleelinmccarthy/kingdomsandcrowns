"use client";

import { villagerById } from "@/lib/realm/villagers";
import { markerFor } from "@/lib/realm/markers";
import type { VillagerPlacement } from "@/lib/realm/layout";
import type { Surfaces } from "@/lib/realm/depth";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

/**
 * How much of a plate is drawn. Eight villagers each carrying name, site and progress is a
 * wall of pills across the middle of the village — the information was right, "all of it, all
 * the time" was not. So a plate opens as it becomes relevant:
 *
 * - `pin`   — a mark over their head and nothing else. Who they are is still one hover, one
 *             Tab or one walk away, and the accessible name never changes at all.
 * - `name`  — the mark and the person's name. Near enough to be worth walking to, or the
 *             keeper of the objective, who is worth naming from anywhere in the realm.
 * - `full`  — the mark, the name, the site and its progress: today's plate, for the one
 *             villager the hero can actually talk to.
 *
 * Every string is rendered at every tier and hidden with CSS, for two reasons: the accessible
 * name and the pointer both keep the whole plate (`:hover`/`:focus-visible` open a pin right
 * back up), and a jsdom test can still read every word without a stylesheet.
 */
export type PlateDetail = "pin" | "name" | "full";

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
  detail,
  calm,
  motion,
  inReach,
  onPick,
  plateRef,
}: {
  villager: VillagerPlacement;
  surfaces: Surfaces;
  detail: PlateDetail; // how much of the plate to draw; see PlateDetail
  calm: boolean;
  motion: boolean;
  inReach: boolean; // the hero is close enough to talk; out of reach there is no talk to offer
  onPick: (id: string) => void;
  /**
   * Handed to realm-scene's frame loop, which refines `detail` by writing `data-detail` on
   * this node directly — the hero dot's trick, for the hero dot's reason: a hero walking
   * across the village must not re-render eight plates sixty times a second.
   */
  plateRef?: (el: HTMLButtonElement | null) => void;
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
      ref={plateRef}
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
      // The whole tier system, in one attribute. An attribute and not a class because the
      // frame loop overwrites it on the DOM node: `el.dataset.detail = …` is one string
      // compare and one write, where swapping a class is a list to read and rewrite.
      data-detail={detail}
      aria-label={accessibleName}
      // Out of reach there is no conversation to be had — `E` does nothing and the bubble is
      // not drawn either — so the plate stops announcing itself as an action. `aria-disabled`
      // and NOT `disabled`: `disabled` would take it out of the tab order, and the name is the
      // only place a child who cannot see the world hears who keeps which site. Silence in
      // answer to a deliberate press is the one thing a six-year-old cannot diagnose, so the
      // same flag guards the handler: unavailable here means unavailable, not quietly ignored.
      aria-disabled={inReach ? undefined : true}
      // The reach bubble does the same: a pointer that lands on a plate must never also
      // reach the canvas underneath and walk the hero somewhere vaguely nearby.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => { if (inReach) onPick(villager.id); }}
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
        {/*
          A villager with work to give but no objective and no finished site has no marker at
          all — `markerFor` returns null for them, and rightly: an inline badge on a named
          plate would be a third symbol saying nothing. Collapsed to a pin there is no name to
          carry the mark, though, and a village where five of eight people are simply absent
          from the screen is the anonymity this plate was built to end. So the dot: a quiet
          disc, drawn only at `pin`, that says someone stands here without competing with the
          one gold `!` that says where to go.
        */}
        {!marker && <span className="realm-plate-dot" aria-hidden="true" />}
        <span className="realm-plate-who">{name}</span>
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
