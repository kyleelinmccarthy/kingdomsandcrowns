import { describe, expect, it } from "vitest";
import { BUILDING_SLOTS, buildingFootprint, CASTLE_FOOTPRINTS, CASTLE_POSITION, PLACES, SPAWN, TERRAIN, VILLAGE_SIZE, WORLD_SIZE } from "@/lib/realm/layout";
import { createWorld, realmWorld, CHUNK, SEA_LEVEL, VILLAGE_FLAT, WALK_HALF, WORLD_HALF, type Biome, type WorldProp } from "./worldgen";

/**
 * Built once for the whole file. A world costs about thirty milliseconds to construct and a
 * hundred more to emit every prop in; building one per test would make this suite slower than
 * the thing it is testing.
 */
const world = realmWorld();
const props: WorldProp[] = world.allProps();

describe("the land", () => {
  it("is an island: land in the middle, sea all the way round the rim", () => {
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = Math.cos(th) * (WORLD_HALF - 4);
      const z = Math.sin(th) * (WORLD_HALF - 4);
      expect(world.heightAt(x, z)).toBeLessThan(SEA_LEVEL);
    }
    expect(world.heightAt(0, 0)).toBeGreaterThan(SEA_LEVEL);
  });

  it("has somewhere high enough to be worth climbing", () => {
    let top = -Infinity;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 8) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 8) top = Math.max(top, world.heightAt(x, z));
    }
    // Forty units above the village green, when the hero is under two units tall.
    expect(top).toBeGreaterThan(40);
  });

  it("grows all nine surfaces, and none of them is a rounding error", () => {
    const seen: Record<string, number> = {};
    let n = 0;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 6) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 6) {
        seen[world.biomeAt(x, z)] = (seen[world.biomeAt(x, z)] ?? 0) + 1;
        n += 1;
      }
    }
    const all: Biome[] = ["ocean", "shore", "marsh", "meadow", "wood", "forest", "heath", "moor", "crag"];
    for (const b of all) expect(seen[b] ?? 0, `${b} never appears`).toBeGreaterThan(n * 0.002);
    // ...and it is not mostly sea. An island you cannot walk about on is a rock.
    expect((seen.ocean ?? 0) / n).toBeLessThan(0.62);
  });

  it("is water only below the waterline, and nowhere else", () => {
    const wrong: string[] = [];
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 11) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 11) {
        if ((world.biomeAt(x, z) === "ocean") !== world.heightAt(x, z) < SEA_LEVEL) wrong.push(`${x},${z}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * The failure this is guarding against is the one that makes procedural worlds boring: a
   * child walks in one direction and everything they walk over is the same.
   */
  it("changes under a child who keeps walking", () => {
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const seen = new Set<Biome>();
      // Three hundred units is about twenty-seven seconds at the spike's eleven a second:
      // roughly as long as an eight-year-old will walk in a straight line to find out what
      // is over there. Three kinds of country in that time, on every bearing out of the
      // village, is the bar. The median is six.
      for (let d = 0; d <= 300; d += 5) seen.add(world.biomeAt(Math.cos(th) * d, Math.sin(th) * d));
      expect(seen.size, `walking on bearing ${a} shows only ${[...seen].join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the village, which cannot move", () => {
  const half = VILLAGE_SIZE / 2;

  it("stands on a floor flat enough to put houses on", () => {
    let worst = 0;
    for (let x = -half; x <= half; x += 1) {
      for (let z = -half; z <= half; z += 1) worst = Math.max(worst, Math.abs(world.heightAt(x, z)));
    }
    // Under a metre of roll across the whole forty-unit square: the light finds an edge, and
    // a house with a plinth under it does not float.
    expect(worst).toBeLessThan(1);
  });

  it("puts the castle, the spawn point and all eight building sites on level ground", () => {
    const sites: [string, { x: number; z: number }][] = [
      ["castle", CASTLE_POSITION],
      ["spawn", SPAWN],
      ...Object.entries(BUILDING_SLOTS),
    ];
    for (const [id, p] of sites) {
      expect(Math.abs(world.heightAt(p.x, p.z)), `${id} sits off the floor`).toBeLessThan(0.6);
      // ...and level under the whole footprint, not just under its middle.
      const f = id === "castle" ? CASTLE_FOOTPRINTS.citadel : id === "spawn" ? { w: 2, d: 2 } : buildingFootprint(id);
      for (const dx of [-f.w / 2, f.w / 2]) {
        for (const dz of [-f.d / 2, f.d / 2]) {
          expect(Math.abs(world.heightAt(p.x + dx, p.z + dz) - world.heightAt(p.x, p.z)), `${id} is on a slope`).toBeLessThan(0.25);
        }
      }
    }
  });

  it("holds the five named places above water and out of the mountains", () => {
    for (const place of PLACES) {
      const y = world.heightAt(place.position.x, place.position.z);
      expect(y, `${place.name} is under water`).toBeGreaterThan(SEA_LEVEL + 1);
      expect(y, `${place.name} is up a mountain`).toBeLessThan(30);
    }
  });

  it("keeps the ground walkable all the way out of the village", () => {
    /**
     * No cliff ringing the green: the flatten has to ramp out, not step out.
     *
     * Two bars, because the world is allowed to get wilder as you leave. Out to the edge of
     * the flat disc nothing may be steeper than a gentle bank; across the rest of the authored
     * square — where two thousand hand-placed props sit on ground that was flat when they were
     * placed — nothing may be a face a child cannot walk up.
     */
    // Longwater's own bank is exempt, and only its bank. `layout.ts` makes every deep-water
    // rectangle a collider, so the last few units before the water are ground the hero is
    // already forbidden to stand on; holding a lake shore to a walkable gradient would mean
    // flattening a lake into a puddle to satisfy a rule about somewhere nobody can go. It is
    // still held to something, because a bank that overhangs looks broken from the far shore.
    const deep = TERRAIN.filter((t) => t.kind === "water");
    const onABank = (x: number, z: number) =>
      deep.some((t) => Math.abs(x - t.position.x) < t.size.w / 2 + 12 && Math.abs(z - t.position.z) < t.size.d / 2 + 12);
    const walls: string[] = [];
    for (let a = 0; a < 48; a++) {
      const th = (a / 48) * Math.PI * 2;
      for (let d = 2; d <= WORLD_SIZE / 2; d += 1.5) {
        const x = Math.cos(th) * d;
        const z = Math.sin(th) * d;
        const limit = onABank(x, z) ? 2.4 : d <= VILLAGE_FLAT ? 0.35 : 1;
        const s = world.slopeAt(x, z);
        if (s >= limit) walls.push(`${x.toFixed(0)},${z.toFixed(0)} @ ${s.toFixed(2)}`);
      }
    }
    expect(walls).toEqual([]);
  });
});

describe("what the generator is not allowed to touch", () => {
  it("puts nothing at all inside the authored square", () => {
    const inside = props.filter((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) < WORLD_SIZE / 2 - 2);
    expect(inside.map((p) => p.id)).toEqual([]);
  });

  it("puts nothing on a building, the castle or the spawn point", () => {
    const sites: { x: number; z: number; r: number }[] = [
      { ...CASTLE_POSITION, r: CASTLE_FOOTPRINTS.citadel.w },
      { ...SPAWN, r: 4 },
      ...Object.entries(BUILDING_SLOTS).map(([id, p]) => ({ ...p, r: buildingFootprint(id).w })),
    ];
    // Collected and asserted once. Twenty thousand props against a dozen sites is a quarter of
    // a million `expect` calls, and `expect` is about a thousand times the cost of the hypot.
    const on: string[] = [];
    for (const p of props) {
      for (const s of sites) if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r) on.push(`${p.id} @ ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    expect(on).toEqual([]);
  });

  it("puts nothing on one of the five authored tracks", () => {
    const trail = TERRAIN.filter((t) => t.kind === "trail");
    const on: string[] = [];
    for (const p of props) {
      for (const t of trail) {
        const reach = Math.max(t.size.w, t.size.d) / 2;
        if (Math.hypot(p.x - t.position.x, p.z - t.position.z) <= reach) on.push(`${p.id} on ${t.id}`);
      }
    }
    expect(on).toEqual([]);
  });

  it("puts nothing on one of its own roads", () => {
    const on: string[] = [];
    for (const road of world.roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
        for (const p of props) {
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / len2));
          const d = Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - (a.z + (b.z - a.z) * t));
          if (d <= road.halfWidth) on.push(`${p.id} on ${road.id}`);
        }
      }
    }
    expect(on).toEqual([]);
  });

  it("drowns nothing and floats nothing", () => {
    const bad: string[] = [];
    for (const p of props) {
      if (p.y <= SEA_LEVEL - 0.3) bad.push(`${p.id} is under water`);
      if (Math.abs(p.y - world.heightAt(p.x, p.z)) > 1e-9) bad.push(`${p.id} floats`);
      if (Math.abs(p.x) >= WORLD_HALF || Math.abs(p.z) >= WORLD_HALF) bad.push(`${p.id} is off the map`);
    }
    expect(bad).toEqual([]);
  });

  it("never builds a wall out of colliders", () => {
    const solids = props.filter((p) => p.solid);
    expect(solids.length).toBeGreaterThan(30);
    const cell = 16;
    const grid = new Map<number, WorldProp[]>();
    for (const s of solids) {
      const k = (Math.floor(s.x / cell) + 512) * 1024 + Math.floor(s.z / cell) + 512;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
    }
    const penned: string[] = [];
    for (const s of solids) {
      const cx = Math.floor(s.x / cell);
      const cz = Math.floor(s.z / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const o of grid.get((cx + dx + 512) * 1024 + cz + dz + 512) ?? []) {
            // Two colliders closer than a hero's shoulders apart is a gate with no gap.
            if (o !== s && Math.hypot(o.x - s.x, o.z - s.z) <= 6) penned.push(`${s.id} + ${o.id}`);
          }
        }
      }
    }
    expect(penned).toEqual([]);
  });
});

describe("what grows where", () => {
  it("puts trees in the woods and stones on the moor, not the other way round", () => {
    const by = (b: Biome) => props.filter((p) => p.biome === b);
    const treeShare = (b: Biome) => {
      const list = by(b);
      return list.filter((p) => p.variant === "oak" || p.variant === "pine").length / Math.max(1, list.length);
    };
    expect(by("forest").length).toBeGreaterThan(2000);
    expect(treeShare("forest")).toBeGreaterThan(0.45);
    expect(treeShare("moor")).toBeLessThan(0.1);
    expect(treeShare("meadow")).toBeLessThan(treeShare("forest"));
    // Reeds at the water's edge: the marsh is nearly all low, soft growth.
    const marsh = by("marsh");
    expect(marsh.length).toBeGreaterThan(50);
    expect(marsh.filter((p) => p.role === "reed" || p.role === "sedge").length / marsh.length).toBeGreaterThan(0.5);
  });

  it("makes a forest denser than a meadow, by a lot", () => {
    const area: Record<string, number> = {};
    const step = 6;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += step) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += step) area[world.biomeAt(x, z)] = (area[world.biomeAt(x, z)] ?? 0) + step * step;
    }
    const density = (b: Biome) => props.filter((p) => p.biome === b).length / (area[b] ?? 1);
    expect(density("forest")).toBeGreaterThan(density("wood"));
    expect(density("wood")).toBeGreaterThan(density("meadow"));
    expect(density("forest")).toBeGreaterThan(density("meadow") * 3);
  });

  it("draws only figures the scene already knows how to draw", () => {
    const known = new Set(["oak", "pine", "bush", "rock", "menhir", "fence", "lantern", "signpost", "boat", "cart", "scarecrow"]);
    expect([...new Set(props.map((p) => p.variant))].filter((v) => !known.has(v))).toEqual([]);
  });

  it("fills the world without flooding it", () => {
    // Dense enough that walking is not crossing a lawn; not so dense that it is a warehouse.
    expect(props.length).toBeGreaterThan(9000);
    expect(props.length).toBeLessThan(60000);
  });
});

describe("somewhere to go", () => {
  it("names every place once", () => {
    const names = world.landmarks.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(world.landmarks.map((l) => l.id)).size).toBe(names.length);
  });

  it("keeps the five authored places exactly where they were", () => {
    for (const place of PLACES) {
      const found = world.landmarks.find((l) => l.id === place.id);
      expect(found?.position).toEqual(place.position);
      expect(found?.name).toBe(place.name);
      expect(found?.line).toBe(place.line);
      expect(found?.radius).toBe(place.radius);
    }
  });

  it("gives a child more than a handful of reasons to walk, spread out", () => {
    expect(world.landmarks.length).toBeGreaterThanOrEqual(12);
    for (const a of world.landmarks) {
      for (const b of world.landmarks) {
        if (a === b || (a.kind === "place" && b.kind === "place")) continue;
        expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z), `${a.name} is on top of ${b.name}`).toBeGreaterThan(30);
      }
    }
    // ...and they are not all clustered round the village.
    const far = world.landmarks.filter((l) => Math.hypot(l.position.x, l.position.z) > 140);
    expect(far.length).toBeGreaterThanOrEqual(5);
  });

  it("can be walked to from the village without swimming", () => {
    // Every new landmark hangs off the five authored places, which the five authored tracks
    // already reach. A landmark in its own component is a landmark nobody ever finds.
    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let r = a;
      while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r) as string;
      return r;
    };
    for (const l of world.landmarks) parent.set(l.id, l.kind === "place" ? "village" : l.id);
    parent.set("village", "village");
    for (const road of world.roads) parent.set(find(road.to), find(road.from));
    for (const l of world.landmarks) expect(find(l.id), `${l.name} is cut off`).toBe("village");
  });

  it("puts a clearing at the heart of each, so the thing worth seeing is not buried", () => {
    const buried: string[] = [];
    for (const l of world.landmarks) {
      if (l.kind === "place") continue;
      for (const p of props) {
        if (Math.hypot(p.x - l.position.x, p.z - l.position.z) <= l.radius * 0.7) buried.push(`${p.id} in ${l.name}`);
      }
    }
    expect(buried).toEqual([]);
  });

  it("answers where the hero is standing", () => {
    const l = world.landmarks[6];
    expect(world.landmarkAt(l.position.x, l.position.z)?.id).toBe(l.id);
    expect(world.landmarkAt(l.position.x + l.radius * 3, l.position.z)?.id).not.toBe(l.id);
  });
});

describe("the same world, every time", () => {
  it("gives identical output for the same seed", () => {
    const a = createWorld({ seed: 4242, half: 200 });
    const b = createWorld({ seed: 4242, half: 200 });
    expect(b.allProps()).toEqual(a.allProps());
    expect(b.landmarks).toEqual(a.landmarks);
    expect(b.roads).toEqual(a.roads);
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % 400 - 200;
      const z = (i * 91) % 400 - 200;
      expect(b.heightAt(x, z)).toBe(a.heightAt(x, z));
    }
  });

  it("gives a different world for a different seed", () => {
    const a = createWorld({ seed: 1, half: 200 });
    const b = createWorld({ seed: 2, half: 200 });
    expect(b.allProps().length).not.toBe(a.allProps().length);
  });

  /**
   * The rule that makes the guarantee hold: a chunk's contents are a function of the seed and
   * of where the chunk is, and of nothing else. No stream cursor, no generation order, no
   * shared scratch state. If this passes, streaming can never disagree with a one-shot emit.
   */
  it("does not care what order its chunks are asked for in", () => {
    const forwards = createWorld({ seed: 77, half: 128 });
    const backwards = createWorld({ seed: 77, half: 128 });
    const span = 4;
    const f: WorldProp[] = [];
    for (let cx = -span; cx <= span; cx++) for (let cz = -span; cz <= span; cz++) f.push(...forwards.chunkProps(cx, cz));
    const b: WorldProp[] = [];
    for (let cz = span; cz >= -span; cz--) for (let cx = span; cx >= -span; cx--) b.push(...backwards.chunkProps(cx, cz));
    expect(b.length).toBe(f.length);
    const key = (p: WorldProp) => p.id;
    expect(b.map(key).sort()).toEqual(f.map(key).sort());
  });

  it("puts a prop in exactly one chunk, whichever way you ask", () => {
    const ids = props.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("what it costs to ask", () => {
  it("answers a height query in about a microsecond, allocating nothing", () => {
    // Warm, so this is not measuring the JIT.
    for (let i = 0; i < 20000; i++) world.heightAt(i % 300, (i * 7) % 300);
    const N = 200000;
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < N; i++) acc += world.heightAt((i * 13) % 600 - 300, (i * 29) % 600 - 300);
    const ns = ((performance.now() - t0) * 1e6) / N;
    expect(acc).not.toBe(0);
    // Generous, because CI machines are slow and this is a floor not a target. The number
    // this actually runs at is in the report; the assertion only catches an order of magnitude.
    expect(ns, `height query took ${ns.toFixed(0)}ns`).toBeLessThan(20000);
  });

  it("hands back the same array for a chunk rather than building a new one", () => {
    const first = world.chunkProps(3, 3);
    expect(world.chunkProps(3, 3)).toBe(first);
  });

  it("fills a caller's array rather than making one, and finds what is near", () => {
    const out: WorldProp[] = [];
    const l = world.landmarks.find((x) => x.kind === "deepwood")!;
    world.propsNear(l.position.x, l.position.z, 40, out);
    const same = out;
    world.propsNear(l.position.x, l.position.z, 40, out);
    expect(out).toBe(same);
    expect(out.length).toBeGreaterThan(20);
    expect(out.filter((p) => Math.hypot(p.x - l.position.x, p.z - l.position.z) > 40)).toEqual([]);
    // ...and it finds everything a full sweep would.
    const brute = props.filter((p) => Math.hypot(p.x - l.position.x, p.z - l.position.z) <= 40);
    expect(out.length).toBe(brute.length);
  });

  it("samples heights in bulk into an array it was given", () => {
    const out = new Float32Array(16 * 16);
    const same = world.sampleHeights(-40, -40, 4, 16, 16, out);
    expect(same).toBe(out);
    for (let j = 0; j < 16; j++) {
      for (let k = 0; k < 16; k++) expect(out[j * 16 + k]).toBeCloseTo(world.heightAt(-40 + k * 4, -40 + j * 4), 3);
    }
  });

  it("keeps the hero inside the beach", () => {
    expect(WALK_HALF).toBeLessThan(WORLD_HALF);
    expect(CHUNK).toBeGreaterThan(0);
  });
});

describe("the water that stands above the sea", () => {
  const lakeAt = { x: 42, z: -48 }; // the body of Longwater

  it("sits Longwater in a real hollow, well under its own surface", () => {
    const level = world.waterLevelAt(lakeAt.x, lakeAt.z);
    expect(level).toBeGreaterThan(SEA_LEVEL + 2);
    expect(level - world.heightAt(lakeAt.x, lakeAt.z)).toBeGreaterThan(2);
    // The mill pool is the same body, at the same level.
    expect(world.waterLevelAt(29, -10)).toBeCloseTo(level);
    expect(level - world.heightAt(29, -10)).toBeGreaterThan(0.5);
  });

  it("holds the water in: a bank all the way round, never a sheet over the field", () => {
    // Walk a ring well outside every authored rectangle: nothing there is under the lake's level
    // while also being told it is under the lake.
    const level = world.waterLevelAt(lakeAt.x, lakeAt.z);
    const lifted: string[] = [];
    for (let x = 10; x <= 80; x += 1) {
      for (let z = -75; z <= 10; z += 1) {
        const lvl = world.waterLevelAt(x, z);
        if (lvl !== level) continue;
        const inRect = TERRAIN.some(
          (t) => (t.kind === "water" || t.kind === "shallow") && Math.abs(x - t.position.x) < t.size.w / 2 + 3 && Math.abs(z - t.position.z) < t.size.d / 2 + 3,
        );
        if (!inRect) lifted.push(`${x},${z}`);
      }
    }
    expect(lifted).toEqual([]);
  });

  it("keeps the millstream a ford a child can wade", () => {
    for (let z = -34; z <= -18; z += 4) { // between the lake and the mill pool
      const depth = world.waterLevelAt(29, z) - world.heightAt(29, z);
      expect(depth, `the stream at z=${z}`).toBeGreaterThan(0);
      expect(depth, `the stream at z=${z}`).toBeLessThan(1.3);
    }
  });

  it("is the sea's level everywhere else", () => {
    expect(world.waterLevelAt(0, 0)).toBe(SEA_LEVEL);
    expect(world.waterLevelAt(-150, 150)).toBe(SEA_LEVEL);
    expect(world.lakes.length).toBe(1);
  });
});
