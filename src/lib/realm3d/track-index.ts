/**
 * WHERE THE TRACKS ARE — a lookup the ground mesh can afford to ask per vertex.
 *
 * The generator routes fourteen ways between the landmarks and grades each one into the terrain,
 * so the tracks are already THERE as shape: a shelf winding round a hill, a level ribbon through
 * the wood. Shape alone does not read. Walk it and you feel a flat bit; look at it from the
 * camera and you see nothing, because grass on a shelf is still grass.
 *
 * Colour is what makes a track a track, and colour is a per-vertex decision on a mesh with about
 * two hundred thousand of them. Asking "how near is the nearest track" of a list of two hundred
 * segments, two hundred thousand times, is forty million segment tests. So: one uniform grid,
 * built once, and a query that looks at one cell and almost always finds nothing.
 *
 * Pure arithmetic, no `three`: the same index tints the mesh and could answer "am I on a path"
 * for the hero without either of them having to raycast anything.
 */

export type Vec2 = { x: number; z: number };

/** One straight run of track. A polyline arrives as a sequence of these. */
export type TrackSeg = { ax: number; az: number; bx: number; bz: number; half: number };

export type TrackIndex = {
  /**
   * 1 on the running surface of a track, easing to 0 across the verge, 0 everywhere else.
   * Constant cost, no allocation.
   */
  nearness(x: number, z: number): number;
  readonly count: number;
};

/** Cut a polyline into segments. Points closer together than a hair are dropped. */
export function segmentsOf(points: readonly Vec2[], half: number): TrackSeg[] {
  const out: TrackSeg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) continue;
    out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, half });
  }
  return out;
}

/** Cell size. Bigger than the longest verge, small enough that a cell holds a handful of runs. */
const CELL = 16;

export function buildTrackIndex(segments: readonly TrackSeg[], verge = 1.6): TrackIndex {
  const grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => (cx + 4096) * 16384 + (cz + 4096);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const reach = s.half + verge;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - reach) / CELL);
    const x1 = Math.floor((Math.max(s.ax, s.bx) + reach) / CELL);
    const z0 = Math.floor((Math.min(s.az, s.bz) - reach) / CELL);
    const z1 = Math.floor((Math.max(s.az, s.bz) + reach) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
    }
  }

  function nearness(x: number, z: number): number {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list === undefined) return 0;
    let best = 0;
    for (let i = 0; i < list.length; i++) {
      const s = segments[list[i]];
      const vx = s.bx - s.ax;
      const vz = s.bz - s.az;
      const len2 = vx * vx + vz * vz;
      let t = len2 === 0 ? 0 : ((x - s.ax) * vx + (z - s.az) * vz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t));
      if (d >= s.half + verge) continue;
      // Full strength on the running surface, easing out over the verge, so the edge of a path
      // is a scuff rather than a painted kerb.
      const n = d <= s.half ? 1 : 1 - (d - s.half) / verge;
      if (n > best) best = n;
      if (best >= 1) return 1;
    }
    return best;
  }

  return { nearness, count: segments.length };
}
