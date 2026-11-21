// Shared checks for the rune objects' spots (slice 6): does a point stand clear of the village and
// of every other thing E acts on? Pure test helpers over the real catalogs and the real `buildSpots`,
// so `rune-objects.test.ts` and the later tasks that build the rune E spot hold one rule. A point
// is held to what the chests, doors and trail stakes are held to (`world-objects.test.ts`,
// `anchors.test.ts`).
import { BUILDINGS } from "@/lib/utils/kingdom";
import { ANCHOR_SPOT, ANCHOR_SPOTS, ANCHORS } from "@/lib/realm/anchors";
import { DECOR, DECOR_IDS } from "@/lib/realm/decor";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "@/lib/realm/improvements";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { buildWorldLayout, CASTLE_POSITION, placeById, SCENERY } from "@/lib/realm/layout";
import { PUZZLE_TOWER } from "@/lib/realm/puzzle-tower";
import { RIDDLE_STONE_SPOTS } from "@/lib/realm/riddle-stones";
import { RUNE_SPOT } from "@/lib/realm/rune-objects";
import { WORLD_OBJECTS } from "@/lib/realm/world-objects";
import { worldCanvas } from "@/lib/realm/world-state";
import { castlePlan } from "@/lib/realm3d/castle-plan";
import { improvementPlacements } from "@/lib/realm3d/improvement-spots";
import { buildSpots, edgeDistance, type InteractSpot } from "@/lib/realm3d/interact";
import { PLOT_SCALE } from "@/lib/realm3d/lead";
import { ARCH, ARCH_HALF_SPAN } from "@/lib/realm3d/recess/course";
import { travelGraphFor, VILLAGE_POST, VILLAGE_TRACKS } from "@/lib/realm3d/travel";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { CASTLE_TIER_IDS, clearanceFailures, gap, levelFailures, rectAt, segmentDistance, villagePieces, yardPieces } from "./world-clearance";

/** What a rune object's position is checked from: where it stands, and which place (null: the village). */
export type RuneSpotAt = { id: string; x: number; z: number; place: string | null };

/**
 * The E spot a rune object will have: round, `RUNE_SPOT.radius` across its footprint and
 * `RUNE_SPOT.reach` from its edge. Its target kind is a stand-in (`lock`) until the rune kind joins
 * `InteractTarget` with the spot itself; only the geometry is read here.
 */
export function runeSpotAt(o: { id: string; x: number; z: number }): InteractSpot {
  return {
    target: { kind: "lock", id: o.id, label: o.id },
    x: o.x,
    z: o.z,
    hw: RUNE_SPOT.radius,
    hd: RUNE_SPOT.radius,
    round: true,
    reach: RUNE_SPOT.reach,
    bias: 0.4,
    ring: RUNE_SPOT.radius + 0.6,
  };
}

let spotSets: InteractSpot[][] | null = null;

/**
 * Everything else E can act on, in every state the village takes: each castle tier's gate, with
 * every building complete and with none, plus the places, their hitching posts, the riddle stones,
 * the plans board, the lectern, every plaque at level 3, every lock, the Tower's door, the Ring's
 * arch and all fourteen trail stakes. One set per (castle, built) pair.
 */
export function otherSpotSets(): InteractSpot[][] {
  if (spotSets) return spotSets;
  const world = realmWorld();
  const posts = travelGraphFor(world).posts;
  const placements = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0);
  const plaques = placements.map((p) => ({ id: p.id, label: IMPROVEMENTS[p.id].label, ...p.plaque }));
  const locks = worldCanvas({ locksOn: true, runesOn: false, open: [], fixed: [], decor: [], tower: [] }).locks;
  spotSets = [];
  for (const castleType of CASTLE_TIER_IDS) {
    for (const built of [true, false]) {
      const layout = buildWorldLayout({ castleType, buildings: BUILDINGS.map((b) => ({ id: b.id, done: built ? b.deedsToBuild : 0, total: b.deedsToBuild, complete: built })) });
      const g = castlePlan(castleType).gate;
      spotSets.push(
        buildSpots({
          props: layout.props,
          sitePlan: PLOT_SCALE,
          landmarks: world.landmarks,
          castle: { x: CASTLE_POSITION.x + g.x, z: CASTLE_POSITION.z + g.z, hw: g.hw, hd: g.hd, label: "your castle" },
          posts: [{ id: "village", ...VILLAGE_POST }, ...posts],
          arch: { x: ARCH.x, z: ARCH.z, halfSpan: ARCH_HALF_SPAN },
          stones: RIDDLE_STONE_SPOTS,
          plans: KEEP_YARD.plansBoard,
          chronicle: KEEP_YARD.lectern,
          plaques,
          locks,
          tower: PUZZLE_TOWER.door,
          anchors: ANCHOR_SPOTS,
        })
      );
    }
  }
  return spotSets;
}

/** Every way a rune object's E spot and every other spot hold each other (either way), against every state the village takes. */
export function reachFailures(o: { id: string; x: number; z: number }): string[] {
  const mine = runeSpotAt(o);
  const held = new Set<string>();
  for (const set of otherSpotSets()) {
    for (const s of set) {
      if (edgeDistance(s, o.x, o.z) <= s.reach) held.add(`${o.id} is in reach of ${s.target.kind} ${s.target.id}`);
      if (edgeDistance(mine, s.x, s.z) <= mine.reach) held.add(`${s.target.kind} ${s.target.id} is in reach of ${o.id}`);
    }
  }
  return [...held];
}

const TOWER_PLOT = rectAt(PUZZLE_TOWER.x, PUZZLE_TOWER.z, PUZZLE_TOWER.plot, PUZZLE_TOWER.plot);

/** The village's open ground a rune object may stand on. */
export const VILLAGE_BOUNDS = { maxX: 26, minZ: -16, maxZ: 26 } as const;

/** The footprint a village rune object is held to (the boxes are 1.6 across; the chests' are held at 1.4). */
export const RUNE_CLEARANCE_SIZE = 1.4;

function villageFailures(o: RuneSpotAt): string[] {
  const out: string[] = [];
  const rect = rectAt(o.x, o.z, RUNE_CLEARANCE_SIZE, RUNE_CLEARANCE_SIZE);
  out.push(...clearanceFailures(o.id, rect, undefined, 0), ...levelFailures(o.id, rect));
  for (const [name, line] of Object.entries(VILLAGE_TRACKS)) {
    for (let i = 0; i < line.length - 1; i++) if (segmentDistance(o, line[i], line[i + 1]) <= 1.4) out.push(`${o.id} is within 1.4 of the ${name} track`);
  }
  const keeps = [
    ...yardPieces(),
    ...villagePieces(),
    ...DECOR_IDS.map((id) => ({ what: `decor ${id}`, rect: rectAt(DECOR[id].x, DECOR[id].z, 1.4, 1.4) })),
    ...WORLD_OBJECTS.filter((c) => c.type === "chest" && !c.room).map((c) => ({ what: c.id, rect: rectAt(c.x, c.z, 1.4, 1.4) })),
    ...Object.values(ANCHORS).map((a) => ({ what: `stake ${a.id}`, rect: rectAt(a.x, a.z, ANCHOR_SPOT.radius * 2, ANCHOR_SPOT.radius * 2) })),
    ...Object.values(ANCHORS).flatMap((a) => (a.object ? [{ what: `anchor object ${a.id}`, rect: rectAt(a.object.x, a.object.z, 1.6, 1.6) }] : [])),
  ];
  for (const p of keeps) if (gap(rect, p.rect) < 1.0) out.push(`${o.id} is within 1.0 of ${p.what}`);
  if (gap(rect, TOWER_PLOT) < 1.5) out.push(`${o.id} is within 1.5 of the Tower's plot`);
  if (Math.abs(o.x) > VILLAGE_BOUNDS.maxX || o.z < VILLAGE_BOUNDS.minZ || o.z > VILLAGE_BOUNDS.maxZ) out.push(`${o.id} is outside the village`);
  return out;
}

function placeFailures(o: RuneSpotAt): string[] {
  const out: string[] = [];
  const place = placeById(o.place ?? "");
  if (!place) return [`${o.id} has no place ${o.place}`];
  const world = realmWorld();
  if (Math.hypot(o.x - place.position.x, o.z - place.position.z) >= place.radius) out.push(`${o.id} is outside ${place.id}`);
  if (world.waterLevelAt(o.x, o.z) - world.heightAt(o.x, o.z) >= 0) out.push(`${o.id} is wet`);
  for (const l of [...Object.values(VILLAGE_TRACKS), ...world.roads.map((r) => r.points)]) {
    for (let i = 0; i < l.length - 1; i++) if (segmentDistance(o, l[i], l[i + 1]) <= 3) out.push(`${o.id} is within 3 of a track`);
  }
  for (const p of SCENERY) {
    if (!p.solid) continue;
    if (Math.hypot(o.x - p.position.x, o.z - p.position.z) - p.size.w / 2 - RUNE_SPOT.radius <= 1) out.push(`${o.id} is against ${p.id}`);
  }
  const door = WORLD_OBJECTS.find((w) => w.id === `door:${place.id}`);
  if (door && Math.hypot(o.x - door.x, o.z - door.z) < 1.5) out.push(`${o.id} is within 1.5 of the vault door`);
  const stone = RIDDLE_STONE_SPOTS.find((s) => s.placeId === place.id);
  if (stone && Math.hypot(o.x - stone.x, o.z - stone.z) < 1.5) out.push(`${o.id} is within 1.5 of the riddle stone`);
  return out;
}

/** Every reason a rune object may not stand where it does, against the village or its place, and against every spot E reaches. */
export function runeSpotFailures(o: RuneSpotAt): string[] {
  return [...(o.place === null ? villageFailures(o) : placeFailures(o)), ...reachFailures(o)];
}
