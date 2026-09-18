/**
 * THE MAP OF THE ISLAND.
 *
 * Re-derived, not ported. The flat Realm's `src/lib/realm/minimap.ts` is 423 lines, and the
 * two biggest ideas in it both exist because of the orthographic tabletop camera, and both are
 * gone here:
 *
 *   - `MAP_TILT`, a quarter turn applied to the whole world group. The tabletop camera's
 *     screen axes were the world axes rotated 45°, so a map drawn in world axes came out
 *     diagonal and had to be turned back. The 3D camera orbits the child on a boom in the
 *     world's own x/z, and the map here is NORTH-UP: world +x is map right, world +z is map
 *     down, one to one, no basis change at all. `mapPoint` is therefore a subtraction and a
 *     divide, where the old `worldToMap` was a rotation.
 *   - `mapDegrees`, which mirrored east and west because the ground ring's angle and a map's
 *     angle disagreed about handedness under that camera. The hero's facing here is
 *     `atan2(dx, dz)` in the same world axes the map is drawn in, so `headingDegrees` is one
 *     honest identity (see its note) rather than a correction.
 *
 * What the 640-unit island adds instead is that the map is ALWAYS a window. The old map had
 * two modes — the whole 40-unit world at rest, or a panning window once it outgrew 60 units —
 * and a `follows` flag threaded through the view to say which. There is no point in the first
 * mode any more: 640 units at a legible scale will never fit, so the map pans, always, and the
 * two-mode branch and its flag are deleted.
 *
 * No `three`, no DOM, no allocation in the per-frame functions.
 */

import type { Vec2 } from "@/lib/realm/layout";

/**
 * How many world units the map shows across.
 *
 * The single number that decides the map's character, so: the rendered map is about 190 CSS
 * pixels across, which at 240 units is 0.79 px per unit. The village square is 40 units, so it
 * lands as a 32px block — big enough to read as a place with roads leaving it. Landmarks are
 * spaced 78 units apart at the closest (`LANDMARK_SPACING`), which is 62px, so two neighbours
 * never collide. Going wider (the whole 640-unit island at 0.3 px/unit) turns the village into
 * a five-pixel smudge and the roads into dust; going narrower shows the child no landmark they
 * have not already walked to, which is the one job this map has.
 */
export const MAP_WINDOW = 240;

/** A point on the map square as a fraction: 0 is the left/top edge, 1 the right/bottom. */
export type MapPoint = { x: number; y: number };

export function makeMapPoint(): MapPoint {
  return { x: 0, y: 0 };
}

/**
 * World → map fraction, north up, centred on `cx, cz`. Writes into `out`; allocates nothing.
 * The result is NOT clamped — off-map points come back outside 0..1 on purpose, because
 * `rimMark` needs the true direction to point an arrow along.
 */
export function mapPoint(out: MapPoint, x: number, z: number, cx: number, cz: number, window: number = MAP_WINDOW): MapPoint {
  out.x = 0.5 + (x - cx) / window;
  out.y = 0.5 + (z - cz) / window;
  return out;
}

/** True when a fraction pair is inside the map square, inset by `inset` fractions. */
export function insideMap(p: MapPoint, inset = 0): boolean {
  return p.x >= inset && p.x <= 1 - inset && p.y >= inset && p.y <= 1 - inset;
}

/**
 * The hero arrow's rotation, in SVG degrees, for a body facing of `atan2(dx, dz)`.
 *
 * The scene's facing is measured from world +z (south on this map, because the camera sits at
 * +z and looks toward -z, so -z is the direction "away" and therefore north). The arrow glyph
 * is drawn pointing UP the map, i.e. north, i.e. -z. So a facing of 0 — walking due south —
 * must turn the glyph a half turn, and turning further must go the same way round the map as
 * it does in the world. Both are satisfied by 180 - facing:
 *
 *   facing 0     (+z, south) → 180°  (arrow points down)   ✔
 *   facing +π/2  (+x, east)  →  90°  (arrow points right)  ✔  (SVG rotates clockwise)
 *   facing -π/2  (-x, west)  → 270°                        ✔
 *
 * Note there is no mirror in it. `mapDegrees` in the flat Realm is `180 - deg` too, but it got
 * there by cancelling the tabletop camera's handedness against the map's; here east on the map
 * is east in the world because the map has no basis change, and the identity is just the one
 * half-turn between "facing +z" and "glyph points -z".
 */
export function headingDegrees(facing: number): number {
  return 180 - (facing * 180) / Math.PI;
}

/** An arrow pinned to the map's rim, pointing at something off the window. */
export type RimMark = { x: number; y: number; angle: number; off: boolean };

export function makeRimMark(): RimMark {
  return { x: 0, y: 0, angle: 0, off: false };
}

/**
 * Clamps an off-window point to the rim and gives the heading from the map's centre to its
 * TRUE position, so the arrow points at the real place rather than at the corner it was
 * squashed into. `off` is false when the point is comfortably on the map and no arrow is
 * wanted. `angle` is SVG degrees for a glyph drawn pointing up, to match `headingDegrees`.
 */
export function rimMark(out: RimMark, p: MapPoint, inset: number): RimMark {
  if (insideMap(p, inset)) {
    out.off = false;
    return out;
  }
  out.off = true;
  const dx = p.x - 0.5;
  const dy = p.y - 0.5;
  // Push out along the true direction to the rim radius, so the arrows sit on a circle —
  // which is the shape this map is, unlike the flat Realm's square one.
  const len = Math.hypot(dx, dy) || 1;
  const r = 0.5 - inset;
  out.x = 0.5 + (dx / len) * r;
  out.y = 0.5 + (dy / len) * r;
  out.angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return out;
}

/* ------------------------------------------------------------------- discovery */

/**
 * DISCOVERY: every named place is on the map from the first frame, drawn hollow, and fills in
 * once the child has stood in it.
 *
 * The alternative — a black map that opens up as you walk — was considered and rejected, and
 * the reason is the brief's own sentence: the map is what turns 640 units of grass into
 * somewhere a child CHOOSES to go. A hidden map cannot do that. It only rewards a child who
 * has already decided to wander, and for the eight-year-old it does the opposite of its job:
 * she opens the map to find out where to go and it tells her nothing, so she walks in a
 * straight line until the game gets boring.
 *
 * Shown from the start, the map asks a question instead. There is a ring in the north-west
 * eleven seconds away and she does not know what it is; that is the whole engine of going
 * there. The collecting pleasure that fog-of-war is actually for survives in the hollow → full
 * change, which is also the language the flat Realm's map already taught for its five places
 * (hollow = not yet, filled = found), so neither child has a new rule to learn.
 *
 * `visited` is therefore about the mark's SECOND state, never about whether it is drawn.
 */
export type Visited = ReadonlySet<string>;

/**
 * How far past a landmark's radius the hero carries it before it counts as left, mirroring
 * `PLACE_LEAVE` in the flat Realm for the same reason: a child shuffling on the rim of a
 * clearing must not re-arrive forty times a second.
 */
export const LEAVE_FACTOR = 1.33;

/**
 * Which named place the hero is standing in, given the one they were in last frame. Pure; the
 * caller keeps the memory in a ref and speaks only when the answer changes.
 */
export function placeAt(
  hero: Vec2,
  places: readonly { id: string; position: Vec2; radius: number }[],
  current: string | null,
): string | null {
  let best: { id: string; d: number } | null = null;
  for (const p of places) {
    const d = Math.hypot(hero.x - p.position.x, hero.z - p.position.z);
    const limit = p.id === current ? p.radius * LEAVE_FACTOR : p.radius;
    if (d > limit) continue;
    if (!best || d < best.d) best = { id: p.id, d };
  }
  return best?.id ?? null;
}

/* ------------------------------------------------------------ the land, baked */

/**
 * The map's land layer is BAKED, once, into a small bitmap, because the alternative does not
 * exist: the island's ground is a noise field with no polygons to draw, so there is no list of
 * rectangles for the map to trace the way the flat Realm's map traced `layout.terrain`. The
 * only honest map of a generated surface is a picture of the surface.
 *
 * `BAKE_N` cells across the whole island. 160 over 640 units is four units per cell, and the
 * map window shows 240 units — 60 cells stretched across ~190px, so a little over three pixels
 * per cell, which smoothing turns into a painted map rather than a grid of squares. Every cell
 * costs one `biomeAt`, which the generator warns is about six height queries, so this is
 * twenty-five thousand cells' worth of noise and must never happen during a frame: the caller
 * paints it in bands off the frame loop.
 */
export const BAKE_N = 160;

/** The map's own palette: the ground's own biome colours, darkened so marks read on top. */
export function mapShade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
