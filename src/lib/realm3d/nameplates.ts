/**
 * NAMEPLATES — how big, how faint, and where they go when they pile up.
 *
 * The flat Realm needed none of this. Under an orthographic camera a DOM pill and the sprite
 * it labelled were the same size at every distance (villager-plate.tsx says so in its own
 * comment), the village was forty units across so nothing was ever far, and eight villagers
 * standing at eight fixed plots never queued up behind one another. All three have gone:
 * the camera divides by depth, the island is 640 units across, and the villagers cluster
 * three-deep along one road.
 *
 * So four rules, all of them functions of the projected DEPTH (`project.ts`), none of them of
 * the distance to the hero:
 *
 *   - SIZE. Full perspective scale (1/depth) makes a plate on the far hill two pixels tall;
 *     no scale at all makes the far hill a wall of text the same size as the person you are
 *     talking to. So it is perspective scale with a FLOOR: it shrinks like the world does
 *     until it reaches `minScale`, and then it stops, which keeps distance readable and keeps
 *     the words readable at the same time.
 *   - FADE. Full alpha out to `full`, then down to nothing at `fade`. Past `fade` the plate is
 *     not drawn at all, so thirty plates cost thirty `display:none` writes and no layout.
 *   - CULL. Anything behind the eye, or well off the side of the canvas, is not drawn.
 *     `projectPoint` handles the first; `onScreen` the second.
 *   - STACKING. See `declutter`.
 *
 * Nothing in here imports `three`, allocates, or knows what a villager is.
 */

import { onScreen, type ScreenPoint } from "./project";

/**
 * Three kinds of plate, because three things want naming at three scales.
 *
 * `hero` is the child's own name over their own head and never fades — it is the answer to
 * "shown as theirs", and a name that disappears is not that.
 * `villager` is a person: two units tall, worth naming from across the square and no further,
 * because a name you cannot walk to in a few seconds is noise.
 * `landmark` is a place: the thing the whole 640-unit island is for. It has to be legible from
 * far enough away to be a DECISION, so its ranges are four times the villager's and its floor
 * scale is higher.
 */
export type PlateTier = "hero" | "villager" | "landmark";

export type PlateRange = {
  /** Depth out to which the plate is at full size and full alpha. */
  full: number;
  /** Depth at which it has faded to nothing; past this it is not drawn. */
  fade: number;
  /** How small perspective is allowed to shrink it, as a fraction of full size. */
  minScale: number;
};

/**
 * `full` is 24 for the two near tiers because the camera's own boom is 21 units: at rest the
 * hero and anyone beside them sit right at the top of the no-shrink band, so a plate only ever
 * starts shrinking once its subject is genuinely further off than the child is.
 */
export const PLATE_RANGES: Record<PlateTier, PlateRange> = {
  hero: { full: 24, fade: Number.POSITIVE_INFINITY, minScale: 0.7 },
  villager: { full: 24, fade: 78, minScale: 0.62 },
  // Out to 260, which is where the fog (140 to 520) has taken enough of the picture that a
  // name is floating over haze rather than over a place.
  landmark: { full: 40, fade: 260, minScale: 0.5 },
};

/** Perspective shrink with a floor. 1 at `full` and nearer, never below `minScale`. */
export function plateScale(depth: number, range: PlateRange): number {
  if (!(depth > range.full)) return 1;
  const s = range.full / depth;
  return s < range.minScale ? range.minScale : s;
}

/** 1 out to `full`, straight down to 0 at `fade`. Infinite `fade` never fades. */
export function plateOpacity(depth: number, range: PlateRange): number {
  if (!(depth > range.full)) return 1;
  if (!(range.fade > range.full)) return 0;
  if (depth >= range.fade) return 0;
  return 1 - (depth - range.full) / (range.fade - range.full);
}

/**
 * One plate's answer for this frame. Mutated in place, one per anchor, allocated once at
 * mount — the whole reason `layoutPlates` takes an `out` array instead of returning one.
 */
export type PlateLayout = {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  depth: number;
  /** How many rows `declutter` had to lift this plate. 0 is its true position. */
  lift: number;
};

export function makePlateLayouts(n: number): PlateLayout[] {
  const out: PlateLayout[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = { visible: false, x: 0, y: 0, scale: 1, opacity: 1, depth: 0, lift: 0 };
  return out;
}

/**
 * Decides one plate from one already-projected point. `ok` is `projectPoint`'s verdict, so a
 * point behind the eye arrives here as `false` and is simply not visible — the mirrored-plate
 * bug cannot get past this line.
 */
export function placePlate(
  out: PlateLayout,
  ok: boolean,
  p: ScreenPoint,
  tier: PlateTier,
  width: number,
  height: number,
): void {
  out.lift = 0;
  if (!ok) {
    out.visible = false;
    return;
  }
  const range = PLATE_RANGES[tier];
  const opacity = plateOpacity(p.depth, range);
  if (opacity <= 0.01 || !onScreen(p, width, height, PLATE_MARGIN)) {
    out.visible = false;
    return;
  }
  out.visible = true;
  out.x = p.x;
  out.y = p.y;
  out.depth = p.depth;
  out.scale = plateScale(p.depth, range);
  out.opacity = opacity;
}

/** How far off the canvas a plate may sit before it stops being drawn. Half a plate's width. */
export const PLATE_MARGIN = 80;

/**
 * DE-STACKING. Eight villagers on one road project to eight points a few pixels apart, and
 * eight pills drawn at eight nearly-identical positions is one illegible smear — the exact
 * failure the brief names, and the one thing the flat Realm never had to solve because its
 * plots were fixed and its camera could not foreshorten them into each other.
 *
 * The rule: the NEAREST plate keeps its honest position and everything behind it climbs.
 *
 * Nearest-wins is the whole of the design. A child reads the plate over the person they are
 * about to talk to; that plate must sit on that person's head and nowhere else. Whatever is
 * further away is, by definition, not what they are doing, so it is what moves — and it moves
 * UP, into the sky, which in this world is empty, rather than down into the grass where the
 * thing it names is standing.
 *
 * `order` is a caller-owned index array, sorted here in place; nothing is allocated. O(n²) at
 * n ≈ 30 is 900 compares a frame, which is nothing, and buys an exact answer instead of a
 * bucketed approximation that lets two plates touch.
 */
export function declutter(plates: PlateLayout[], order: number[], rowH: number, xGap: number): void {
  let n = 0;
  for (let i = 0; i < plates.length; i++) if (plates[i].visible) order[n++] = i;
  // Nearest first. `|| a - b` so a tie never depends on sort stability, exactly as the
  // world generator's `claim` does — two plates at identical depth must not swap places
  // between frames, or they flicker past each other for ever.
  const byDepth = (a: number, b: number) => plates[a].depth - plates[b].depth || a - b;
  order.length = n;
  order.sort(byDepth);
  for (let i = 0; i < n; i++) {
    const me = plates[order[i]];
    // At most a few rows of climb: past that the plate is so far from its subject that the
    // line between them is a lie, and it is better for it to overlap than to float.
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (let j = 0; j < i; j++) {
        const other = plates[order[j]];
        if (Math.abs(other.x - me.x) >= xGap) continue;
        if (Math.abs(other.y - me.y) >= rowH) continue;
        me.y = other.y - rowH;
        me.lift += 1;
        hit = true;
        break;
      }
      if (!hit) break;
    }
  }
}

/** Nominal plate height in px, and how much horizontal overlap counts as a collision. */
export const PLATE_ROW_H = 30;
export const PLATE_X_GAP = 104;
