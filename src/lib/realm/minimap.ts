import { WORLD_SIZE, type Prop, type TerrainKind, type Vec2, type WorldLayout } from "./layout";
import type { Facing } from "./movement";
import type { Surfaces } from "./depth";
import { facingAngle } from "./markers";

export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
/** A point on the map, as a fraction of the map square: 0 is its left/top edge, 1 its right/bottom. */
export type MinimapPoint = { x: number; y: number };

/**
 * The land itself, drawn as shapes rather than implied by dots.
 *
 * All but one are the world's own `TerrainKind`, so the map cannot drift from the ground:
 * the same rectangles the scene paints are the ones drawn here. "forest" is the map's alone —
 * the world has no forest, it has four hundred trees, and a map that drew four hundred trees
 * would be a map of nothing.
 *
 * Nothing else is the map's alone. A drawn village square was tried and cut: the ground has no
 * such edge, so on the map it was a rectangle a child would have had to be told the meaning of,
 * and the castle, the sites and the cobbled road already say "village" without being explained.
 */
export type MinimapAreaKind = TerrainKind | "forest";
export type MinimapArea = { id: string; kind: MinimapAreaKind; shape: "rect" | "blob"; x: number; y: number; w: number; h: number };

/** Everything the child navigates BY. Four kinds, four silhouettes — never four identical squares. */
export type MinimapMarkKind = "castle" | "objective" | "site" | "trouble";
export type MinimapMark = { id: string; kind: MinimapMarkKind; x: number; y: number; filled: boolean };

/**
 * Where the world sits on the map, per axis, in map fractions — and therefore whether the map
 * can hold all of it. `follows` false means the whole world fits and the map never moves;
 * true means the map is a window that pans with the hero (see `mapPan`).
 */
export type MinimapFrame = {
  follows: boolean;
  x: { min: number; max: number };
  y: { min: number; max: number };
};

export type MinimapView = {
  bounds: MinimapBounds;
  frame: MinimapFrame;
  /** The walkable world as a rectangle in the map's UNTURNED space, so the map can say where the world stops. */
  ground: { x: number; y: number; w: number; h: number };
  /** The resting hero: position in map fractions, `angle` in the SCENE's convention (see `mapDegrees`). */
  hero: { x: number; y: number; angle: number };
  areas: MinimapArea[];
  marks: MinimapMark[];
  /** The castle and the current objective, kept apart from `marks` because the rim arrows need them. */
  home: MinimapPoint | null;
  goal: MinimapPoint | null;
};

export type MinimapInput = {
  layout: WorldLayout;
  hero: Vec2;
  facing: Facing;
  troubles: { id: string; position: Vec2 }[];
  surfaces: Surfaces;
};

/**
 * Air around the outermost prop so nothing is drawn against the frame, and the floor under
 * every span: `worldBounds` also takes in the whole walkable square, so the bounds are never
 * degenerate and `mapSpan`'s division is never by zero.
 */
const PAD = 2;

/**
 * How many world units the map shows across when the world is bigger than that.
 *
 * This is the single number that decides the map's whole character, so: a marker's size is
 * fixed in map units, which means legibility is entirely a question of how many world units
 * one map unit is worth. At sixty, the 144px map is ~2.4px per world unit — two neighbouring
 * kingdom sites (six units apart at their closest) land 14px apart, and the hero's arrow is a
 * sixth of the distance between them. Much past that and the village collapses into a smudge.
 *
 * Today's world is forty units across, so the whole of it fits inside this window and the map
 * is a map OF THE WORLD, unmoving, exactly as a child already knows it. When the world grows
 * past sixty the same number turns the map into a window that pans with the hero at that same
 * readable scale, and the two things a child steers by that have fallen off it — home and the
 * objective — come back as arrows pinned to the rim (`rimMark`). Nothing about the drawing
 * changes between the two; only how much land is under it.
 */
export const MAP_WINDOW = 60;

/** A site on the map is a kingdom building, raised or not. The castle is its own mark. */
const isSite = (p: Prop) => p.kind === "building" || p.kind === "foundation";

/**
 * Which props read as land rather than as landmarks.
 *
 * `layout.terrain` is the world's own list of ground rectangles and needs no guessing, but two
 * things a child navigates by are props: the village's cobbled path, and every tree. Matched on
 * words rather than on a closed list of kinds, so a world that grows a new sort of ground does
 * not need this file edited in lockstep. Anything that says nothing — a rock, a fence, a
 * lantern, a reed — is not land and is not drawn: a minimap that draws every prop is a diagram
 * again, and four hundred dots is worse than the eight it replaced.
 */
const LAND: { kind: MinimapAreaKind; says: RegExp }[] = [
  { kind: "water", says: /water|river|pond|lake|stream|moat|brook|creek/ },
  { kind: "field", says: /field|crop|wheat|farm|meadow|pasture|barley/ },
  { kind: "forest", says: /oak|pine|tree|forest|wood|birch|fir|spruce|orchard/ },
  { kind: "trail", says: /^path|road|lane|track|trail|bridgeway/ },
];

/** Landmarks are never land, whatever they are called ("garden", "bridge", "watchtower"). */
const LANDMARK_KINDS = new Set(["castle", "building", "foundation", "villager", "banner", "barrier"]);

export function landKind(prop: Prop): MinimapAreaKind | null {
  if (LANDMARK_KINDS.has(prop.kind)) return null;
  const says = `${prop.kind} ${prop.variant ?? ""} ${prop.id}`.toLowerCase();
  return LAND.find((l) => l.says.test(says))?.kind ?? null;
}

/**
 * Painter order, bottom to top: worked ground and banks under the water they hold, the woods
 * over the ground they stand on, and the tracks over all of it —
 * because a track a child can follow home must never be hidden by what it crosses.
 */
const LAND_ORDER: Record<MinimapAreaKind, number> = { grove: 0, scree: 1, field: 2, furrow: 3, shore: 4, shallow: 5, water: 6, forest: 7, trail: 8 };

/**
 * Trees are not drawn. A wood is.
 *
 * Four hundred separate circles would be both unreadable and four hundred DOM nodes in a HUD
 * that is otherwise free, so trees are dropped into six-unit cells and each occupied cell gets
 * one canopy. The canopy is wider than half the cell, so neighbouring cells overlap into one
 * mass with a soft edge, and a lone tree still leaves a mark.
 */
const CANOPY_CELL = 6;
const CANOPY_R = 3.9;

/**
 * The walkable square, plus anything standing outside it, plus air.
 *
 * The square matters: `movement.ts` clamps the hero to `WORLD_SIZE / 2`, which is FURTHER out
 * than the outermost prop, so bounds taken from props alone let the hero walk off their own
 * map. That used to be hidden by a clamp inside `projectToMap` — which pinned the dot to the
 * edge and lied about where the child was. The bounds now cover the ground instead.
 */
export function worldBounds(layout: WorldLayout): MinimapBounds {
  const half = WORLD_SIZE / 2 + PAD;
  const xs = [layout.spawn.x, ...layout.props.map((p) => p.position.x)];
  const zs = [layout.spawn.z, ...layout.props.map((p) => p.position.z)];
  return {
    minX: Math.min(-half, Math.min(...xs) - PAD),
    maxX: Math.max(half, Math.max(...xs) + PAD),
    minZ: Math.min(-half, Math.min(...zs) - PAD),
    maxZ: Math.max(half, Math.max(...zs) + PAD),
  };
}

/**
 * World units across one edge of the map: the whole world while it fits, `MAP_WINDOW` after
 * that. The world is measured as the map draws it — turned a quarter (see `MAP_TILT`), so a
 * square world is a diamond and needs its diagonal, not its side, to fit.
 */
export function mapSpan(bounds: MinimapBounds): number {
  const across = (bounds.maxX - bounds.minX + (bounds.maxZ - bounds.minZ)) / Math.SQRT2;
  return Math.max(Math.min(across, MAP_WINDOW), 1e-6);
}

/** Map fractions per world unit — the one scale every shape on the map is drawn at. */
export function mapScale(bounds: MinimapBounds): number {
  return 1 / mapSpan(bounds);
}

/**
 * World point → map fractions, at one scale on both axes so the land keeps its shape: a round
 * pond is round and the road runs straight, which the old per-axis stretch could not promise
 * the moment the world stopped being square.
 *
 * Unclamped, on purpose. The caller that needs a point held inside the map is the rim arrow,
 * and it needs to know the true direction of a thing that is off the map to do its job.
 */
export function projectToMap(p: Vec2, bounds: MinimapBounds): MinimapPoint {
  const s = mapScale(bounds);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return { x: 0.5 + (p.x - cx) * s, y: 0.5 + (p.z - cz) * s };
}

/**
 * The map is turned to face the way the child is: a quarter turn, clockwise.
 *
 * The camera is fixed at (12, 12, 12) looking at the hero, so screen-up is the world direction
 * (-1, -1) and screen-right is (1, -1) — `input-mapping.ts` says the same thing from the keys'
 * side, which is why W walks a child up the SCREEN and not north. A map drawn on the world's
 * own axes is therefore a quarter turn out of step with both the view and the keys: press W,
 * and the dot slides diagonally. An eight-year-old cannot correct for that, and should not have
 * to. Turned, the map's up is the screen's up, its right is the screen's right, and the shapes
 * come out as the same diamonds the child is looking at down in the world.
 *
 * It is a rotation of the whole drawing rather than a different projection, and that is load-
 * bearing: `realm-scene.tsx` writes the hero's place each frame through `projectToMap`, and it
 * writes it in the UNTURNED space, inside the group the map turns. So the scene needs to know
 * nothing about any of this, and the dot and the land can never be drawn to two different
 * norths. Everything that leaves that group — the pan, the rim arrows — goes through
 * `rotateMap` first, which is the same quarter turn done to one point.
 */
export const MAP_TILT = Math.PI / 4;
const TILT_COS = Math.cos(MAP_TILT);
const TILT_SIN = Math.sin(MAP_TILT);

/** One point through the map's quarter turn, about the map's centre. */
export function rotateMap(p: MinimapPoint): MinimapPoint {
  const dx = p.x - 0.5;
  const dy = p.y - 0.5;
  return { x: 0.5 + dx * TILT_COS - dy * TILT_SIN, y: 0.5 + dx * TILT_SIN + dy * TILT_COS };
}

/** The world's four corners, turned: the box the map has to hold, and what the pan clamps to. */
function tiltedCorners(bounds: MinimapBounds): MinimapPoint[] {
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.minX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.maxZ },
  ].map((c) => rotateMap(projectToMap(c, bounds)));
}

export function mapFrame(bounds: MinimapBounds): MinimapFrame {
  const corners = tiltedCorners(bounds);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = { min: Math.min(...xs), max: Math.max(...xs) };
  const y = { min: Math.min(...ys), max: Math.max(...ys) };
  const over = 1e-9; // a world that fits EXACTLY must not be called a window
  return { follows: x.max - x.min > 1 + over || y.max - y.min > 1 + over, x, y };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function panAxis(hero: number, edge: { min: number; max: number }): number {
  if (edge.max - edge.min <= 1) return 0; // the world fits on this axis: the map never moves
  return clamp(0.5 - hero, 1 - edge.max, -edge.min);
}

/**
 * How far to slide the world under the map so the hero is at its centre — held back at the
 * world's edge so the map never shows void beyond the last field. Per axis, because a world
 * that is wide and shallow pans sideways only.
 */
export function mapPan(hero: MinimapPoint, frame: MinimapFrame): MinimapPoint {
  return { x: panAxis(hero.x, frame.x), y: panAxis(hero.y, frame.y) };
}

/** How far in from the map's edge a rim arrow sits, in map fractions. */
export const RIM_INSET = 0.075;

/**
 * A thing that has fallen off the window, brought back to the rim pointing at where it really
 * is. `off` false means it is on the map and needs no arrow at all — which is every case while
 * the whole world fits, so a child in today's village never sees one.
 *
 * Both the target and the pan are in TURNED space (`rotateMap`), because the rim is the edge of
 * the screen, not the edge of the world, and an arrow that leaves the map's own square has to
 * be clamped in the square the child is looking at.
 */
export function rimMark(target: MinimapPoint, pan: MinimapPoint): { x: number; y: number; angle: number; off: boolean } {
  const x = target.x + pan.x;
  const y = target.y + pan.y;
  const lo = RIM_INSET;
  const hi = 1 - RIM_INSET;
  return {
    x: clamp(x, lo, hi),
    y: clamp(y, lo, hi),
    // Clockwise from map-up, the same convention as `mapDegrees`, so one arrow glyph serves both.
    angle: Math.atan2(x - 0.5, -(y - 0.5)),
    off: x < lo || x > hi || y < lo || y > hi,
  };
}

/**
 * The scene's rotation for the hero, turned into the map's.
 *
 * `facingAngle` is written for the hero's RING, which lies on the ground in the world and is
 * rotated about X first; on that ring the four compass angles come out right. The map's own
 * space is not rotated about anything: its +y is world +z, so a rotation that turns the ring
 * east turns a map glyph west. The sign flip is the whole of the difference, and it is here,
 * once, rather than in a glyph that is quietly drawn back-to-front to compensate.
 *
 * This is the angle INSIDE the turned group, so the quarter turn of `MAP_TILT` is already
 * carried by the group and must not be added here: north is drawn as up and comes out as
 * up-and-right, which is exactly where the camera puts it.
 */
export function mapDegrees(sceneDegrees: number): number {
  return -sceneDegrees;
}

/** `translate(x y) rotate(deg)` as the scene writes it, back into numbers. Null if it says nothing usable. */
export function parseTransform(attr: string | null | undefined): { x: number; y: number; deg: number } | null {
  if (!attr) return null;
  const t = /translate\(\s*(-?[\d.eE+]+)[\s,]+(-?[\d.eE+]+)\s*\)/.exec(attr);
  if (!t) return null;
  const x = Number(t[1]);
  const y = Number(t[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = /rotate\(\s*(-?[\d.eE+]+)/.exec(attr);
  const deg = r ? Number(r[1]) : 0;
  return { x, y, deg: Number.isFinite(deg) ? deg : 0 };
}

export function minimapView({ layout, hero, facing, troubles, surfaces }: MinimapInput): MinimapView {
  const bounds = worldBounds(layout);
  const s = mapScale(bounds);
  const areas: MinimapArea[] = [];
  const marks: MinimapMark[] = [];
  let home: MinimapPoint | null = null;
  let goal: MinimapPoint | null = null;

  // The world's own ground rectangles, one for one: the water, its banks, the ploughed plots
  // and the tracks. Drawing the same rectangles the scene paints is what makes the map a
  // picture of the place rather than a diagram beside it.
  for (const t of layout.terrain ?? []) {
    const at = projectToMap(t.position, bounds);
    areas.push({ id: t.id, kind: t.kind, shape: "rect", x: at.x, y: at.y, w: t.size.w * s, h: t.size.d * s });
  }

  // Every tree in the world, as woods (see CANOPY_CELL).
  const canopy = new Map<string, Vec2>();
  for (const p of layout.scenery ?? []) {
    if (landKind(p) !== "forest") continue;
    const cx = Math.round(p.position.x / CANOPY_CELL) * CANOPY_CELL;
    const cz = Math.round(p.position.z / CANOPY_CELL) * CANOPY_CELL;
    canopy.set(`${cx},${cz}`, { x: cx, z: cz });
  }
  for (const [id, cell] of canopy) {
    const at = projectToMap(cell, bounds);
    areas.push({ id: `wood-${id}`, kind: "forest", shape: "blob", x: at.x, y: at.y, w: CANOPY_R * 2 * s, h: CANOPY_R * 2 * s });
  }

  for (const p of layout.props) {
    const land = landKind(p);
    if (land) {
      const at = projectToMap(p.position, bounds);
      const blob = land === "forest";
      const w = (blob ? CANOPY_R * 2 : p.size.w) * s;
      const h = (blob ? CANOPY_R * 2 : p.size.d) * s;
      areas.push({ id: p.id, kind: land, shape: blob ? "blob" : "rect", x: at.x, y: at.y, w, h });
      continue;
    }
    // The castle is the thing the whole game is pointed at, so it is on the map at every
    // depth — including objectiveOnly, where it is not one more choice but the fixed point
    // the child measures everything else from.
    if (p.kind === "castle") {
      home = projectToMap(p.position, bounds);
      marks.push({ id: p.id, kind: "castle", x: home.x, y: home.y, filled: true });
      continue;
    }
    if (!isSite(p)) continue;
    const objective = p.focus === "objective";
    // Under objectiveOnly the map keeps the one place the child is meant to go and drops the rest.
    if (!objective && surfaces.minimap !== "full") continue;
    const at = projectToMap(p.position, bounds);
    if (objective) goal = at;
    marks.push({ id: p.id, kind: objective ? "objective" : "site", x: at.x, y: at.y, filled: p.kind === "building" });
  }

  if (surfaces.minimap === "full") {
    for (const t of troubles) {
      const at = projectToMap(t.position, bounds);
      marks.push({ id: t.id, kind: "trouble", x: at.x, y: at.y, filled: true });
    }
  }

  // A stable sort, so tiles of one kind keep the order the world listed them in.
  areas.sort((a, b) => LAND_ORDER[a.kind] - LAND_ORDER[b.kind]);
  const low = projectToMap({ x: bounds.minX, z: bounds.minZ }, bounds);
  const high = projectToMap({ x: bounds.maxX, z: bounds.maxZ }, bounds);
  const ground = { x: low.x, y: low.y, w: high.x - low.x, h: high.y - low.y };
  return { bounds, frame: mapFrame(bounds), ground, hero: { ...projectToMap(hero, bounds), angle: facingAngle(facing) }, areas, marks, home, goal };
}
