import { describe, expect, it } from "vitest";
import { buildWorldLayout, type SiteProgress } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { buildColliders, clearFraction, gatherNear, overlaps, pickBoom, HERO_RADIUS, type Boom, type Collider } from "./collision";
import { castlePlan, CASTLE_TIERS } from "./castle-plan";
import { heightAt } from "./heightfield";
import { angleDelta, boomOffset, DEFAULT_DIST, DEFAULT_PITCH, DIST_MIN, PITCH_MIN, wrapAngle } from "./controls";
import { RIDE_CAM_LIFT, RIDE_CAM_PULL, RIDE_CAM_TILT } from "./riding";
import { aimBoom, DUCK_AT, FIGURE_DROP, insideWall, lensFrac, sightFraction, swingStep, gatherLids, liftAt, readableNeed, readableView, READ_DIST, LIFT_HARD_MAX, LIFT_SOFT_MAX, type Aim, type AimInput, type View } from "./camera-boom";

/** The scene's numbers (spike-scene.tsx): SITE_PLAN, WALL_H, ROOF_H, TREE_SCALE, CORE_HALF. */
const OPTS = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 };
/** spike-scene's CAM_EYE: what must stay in view is the child's figure, not the grass under it. */
const EYE = 1.5;
/** The Rig's floor while the camera may turn itself (CAM_MIN), and a steered boom's nearest (CLOSEST). */
const CAM_MIN = 0.26;
const CLOSEST = 2.6;

/** The island as the scene builds it: every building raised, and the castle standing at `tier`. */
function island(tier: string, scenery = false) {
  const buildings: SiteProgress[] = BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: true }));
  const layout = buildWorldLayout({ castleType: tier, buildings, objectiveIds: [] });
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), scenery ? layout.scenery : [], OPTS);
  const c = layout.props.find((p) => p.kind === "castle")!;
  const g = heightAt(c.position.x, c.position.z);
  const plan = castlePlan(tier);
  const put = (list: Collider[], b: (typeof plan.solids)[number]) =>
    list.push({ x: c.position.x + b.x, z: c.position.z + b.z, hw: b.hw, hd: b.hd, round: b.round, base: g + b.base, top: g + b.top });
  for (const b of plan.solids) put(built.solids, b);
  for (const b of plan.occluders) put(built.occluders, b);
  return { layout, ...built };
}

/**
 * Every place a child can stand hard by something tall: a grid round each raised building (every
 * unit) and round the castle (every 1.5), out to four units from its walls, less anywhere a hero
 * would be inside a solid.
 */
function standingSpots(solids: Collider[], layout: ReturnType<typeof island>["layout"]): { x: number; z: number; by: string }[] {
  const spots: { x: number; z: number; by: string }[] = [];
  const free = (x: number, z: number) => !solids.some((s) => overlaps(s, x, z, HERO_RADIUS));
  const tall = layout.props.filter((p) => p.kind === "castle" || (p.kind === "building" && p.id !== "garden"));
  for (const p of tall) {
    const reach = p.kind === "castle" ? 16 : 8;
    const step = p.kind === "castle" ? 1.5 : 1;
    for (let x = p.position.x - reach; x <= p.position.x + reach; x += step) {
      for (let z = p.position.z - reach - (p.kind === "castle" ? 16 : 0); z <= p.position.z + reach; z += step) {
        // Only the ring hard by a wall: at least one solid within four units of the hero's edge.
        if (!free(x, z)) continue;
        if (!solids.some((s) => overlaps(s, x, z, HERO_RADIUS + 4))) continue;
        spots.push({ x, z, by: p.id });
      }
    }
  }
  return spots;
}

/** The ways a child holds the camera: the approved shot, the lowest look, zoomed right in, and in the saddle. */
const HOLDS = [
  { name: "default", pitch: DEFAULT_PITCH, dist: DEFAULT_DIST, lift: 0 },
  { name: "low", pitch: PITCH_MIN, dist: DEFAULT_DIST, lift: 0 },
  { name: "zoomed", pitch: DEFAULT_PITCH, dist: DIST_MIN, lift: 0 },
  // camOffsets at full ride: in 30%, 0.15 lower, 0.9 up with the saddle.
  { name: "riding", pitch: Math.max(PITCH_MIN, DEFAULT_PITCH - RIDE_CAM_TILT), dist: DEFAULT_DIST * (1 + RIDE_CAM_PULL), lift: RIDE_CAM_LIFT },
  { name: "riding-zoomed", pitch: Math.max(PITCH_MIN, DEFAULT_PITCH - RIDE_CAM_TILT), dist: DIST_MIN * (1 + RIDE_CAM_PULL), lift: RIDE_CAM_LIFT },
];
const YAWS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 - Math.PI + Math.PI / 4);

/** Inside a volume by more than a hair: a line that grazes a tower's side is not hidden by it. */
function inside(list: Collider[], x: number, y: number, z: number, count = list.length): Collider | null {
  for (let i = 0; i < count; i++) {
    const c = list[i];
    if (y > c.base + 0.02 && y < c.top - 0.02 && overlaps(c, x, z, -0.02)) return c;
  }
  return null;
}

/** Walk the line from the child's eye to the lens: nothing solid to see through anywhere on it. */
function sightBlocked(list: Collider[], count: number, x: number, y: number, z: number, ox: number, oy: number, oz: number): boolean {
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    if (inside(list, x + ox * t, y + oy * t, z + oz * t, count)) return true;
  }
  return false;
}

describe("the camera beside anything tall", () => {
  it("the readable distance is well clear of the old jam (2.6) and fits the hero with a place round them", () => {
    expect(READ_DIST).toBeGreaterThanOrEqual(4.5);
    // 46° lens: the hero (2.3) is at most about half the frame's height at READ_DIST.
    expect(2.3 / (2 * READ_DIST * Math.tan((46 * Math.PI) / 360))).toBeLessThan(0.6);
    expect(LIFT_SOFT_MAX).toBeLessThan(LIFT_HARD_MAX);
    expect(LIFT_HARD_MAX).toBeLessThan(Math.PI / 2);
  });

  it("by Sister Wren at the raised Chapel, the camera behind her: one pine on that line is not a ceiling — the camera rises over it on the child's own bearing", () => {
    // The reported shot: the child at Wren's side, facing the chapel door, the camera south of
    // them. The pine on the chapel's lawn cut that one line, the Rig read it as a lid, ducked,
    // and came to rest 2.6 from the child's back — inside the pine.
    const { occluders, layout } = island("castle", true);
    const wren = layout.villagers.find((v) => v.id === "wren")!.position;
    const x = wren.x + 1;
    const z = wren.z + 1.5;
    const feet = heightAt(x, z);
    const eye = feet + EYE;
    const off = { h: DEFAULT_DIST * Math.cos(DEFAULT_PITCH), y: DEFAULT_DIST * Math.sin(DEFAULT_PITCH) };
    // The child's own line is cut short of the old duck threshold...
    expect(clearFraction(x, eye, z, 0, off.y, off.h, occluders)).toBeLessThan(0.52);
    // ...but it is one tree, not a canopy over them: another bearing is open, so no duck.
    const near: Collider[] = new Array(1024);
    const lids: Collider[] = new Array(1024);
    const n = gatherNear(near, occluders, x, z, off.h + 3);
    const nl = gatherLids(lids, near, n, feet);
    const scan: Boom = { yaw: 0, frac: 1 };
    pickBoom(scan, x, eye, z, 0, off.h, off.y, lids, nl, DUCK_AT, CAM_MIN);
    expect(scan.frac).toBeGreaterThanOrEqual(DUCK_AT);
    // And the shot, held by the child's hand (no turning): their bearing, lifted, readable.
    const v: View = { yaw: 0, lift: 0, frac: 0, readable: false };
    readableView(v, x, eye, z, 0, DEFAULT_PITCH, DEFAULT_DIST, near, n, readableNeed(DEFAULT_DIST, CAM_MIN), false);
    expect(v.readable).toBe(true);
    expect(v.yaw).toBe(0);
    expect(v.lift).toBeGreaterThan(0);
    expect(v.frac * DEFAULT_DIST).toBeGreaterThanOrEqual(READ_DIST);
  });

  it("pressed to the chapel's door with the camera behind the chapel, no lift clears the roof a hand's width away — so it turns, when it may", () => {
    const { occluders, layout } = island("castle");
    const wren = layout.villagers.find((v) => v.id === "wren")!.position;
    const x = wren.x + 1.2;
    const z = wren.z + 0.2;
    const eye = heightAt(x, z) + EYE;
    const need = readableNeed(DEFAULT_DIST, CAM_MIN);
    const v: View = { yaw: 0, lift: 0, frac: 0, readable: false };
    readableView(v, x, eye, z, Math.PI, DEFAULT_PITCH, DEFAULT_DIST, occluders, occluders.length, need, false);
    expect(v.readable).toBe(false);
    readableView(v, x, eye, z, Math.PI, DEFAULT_PITCH, DEFAULT_DIST, occluders, occluders.length, need, true);
    expect(v.readable).toBe(true);
    expect(v.frac * DEFAULT_DIST).toBeGreaterThanOrEqual(READ_DIST);
  });

  it("an open line is left exactly as the child holds it: no lift, no turn", () => {
    const v: View = { yaw: 0, lift: 0, frac: 0, readable: false };
    readableView(v, 0, 1.5, 40, 0.4, DEFAULT_PITCH, DEFAULT_DIST, [], 0, readableNeed(DEFAULT_DIST, CAM_MIN), true);
    expect(v).toEqual({ yaw: 0.4, lift: 0, frac: 1, readable: true });
  });

  it("a lift rises only as far as it must: the lowest step that reads", () => {
    // A wall 3 behind the child (camera due south), 6 over their eye.
    const wall: Collider = { x: 0, z: 4, hw: 6, hd: 0.5, round: false, base: 0, top: 7.5 };
    const v: View = { yaw: 0, lift: 0, frac: 0, readable: false };
    liftAt(v, 0, 1.5, 0, 0, DEFAULT_PITCH, DEFAULT_DIST, [wall], 1, 0.9);
    expect(v.readable).toBe(true);
    expect(v.lift).toBeGreaterThan(0);
    // The rung below (at least 0.1 lower) does not: a wall's shadow only shrinks as the line steepens.
    const p = DEFAULT_PITCH + v.lift - 0.1;
    expect(sightFraction(0, 1.5, 0, 0, DEFAULT_DIST * Math.sin(p), DEFAULT_DIST * Math.cos(p), [wall])).toBeLessThan(0.9);
  });

  it("while the child's hand is on the camera it is never turned, however blocked", () => {
    const tower: Collider = { x: 0, z: 1.2, hw: 0.6, hd: 0.6, round: false, base: 0, top: 60 };
    const v: View = { yaw: 0, lift: 0, frac: 0, readable: false };
    readableView(v, 0, 1.5, 0, 0, DEFAULT_PITCH, DEFAULT_DIST, [tower], 1, readableNeed(DEFAULT_DIST, 0.09), false);
    expect(v.yaw).toBe(0);
    expect(v.readable).toBe(false);
    // Allowed to turn, it turns — the least it must.
    readableView(v, 0, 1.5, 0, 0, DEFAULT_PITCH, DEFAULT_DIST, [tower], 1, readableNeed(DEFAULT_DIST, 0.09), true);
    expect(v.readable).toBe(true);
    expect(Math.abs(v.yaw)).toBeGreaterThan(0);
    expect(Math.abs(v.yaw)).toBeLessThan(1);
  });

  /**
   * The Rig's own decision (`aimBoom`), run to rest: the swing taken to wherever it asks to turn,
   * and the lift it asks for on the line it ends on. `walking` is the assist; otherwise the child
   * is standing with the mouse left alone past the grace period.
   */
  function settle(out: Aim, i: AimInput, near: Collider[], n: number): number {
    i.swing = 0;
    for (let k = 0; k < 4; k++) {
      aimBoom(out, i, near, n);
      if (!out.turn) break;
      const next = i.swing + angleDelta(i.yawRef + i.swing, out.yaw);
      if (Math.abs(next - i.swing) < 1e-9) break;
      i.swing = next;
    }
    aimBoom(out, i, near, n);
    return i.yawRef + i.swing;
  }

  for (const tier of Object.keys(CASTLE_TIERS)) {
    it(`every spot hard by every raised building and the ${tier}: the Rig settles on a readable shot — lens outside everything, the child in sight, never nearer than READ_DIST, never a false ceiling`, { timeout: 60000 }, () => {
      const { occluders, solids, layout } = island(tier);
      const spots = standingSpots(solids, layout);
      expect(spots.length).toBeGreaterThan(900);
      const near: Collider[] = new Array(1024);
      const aim: Aim = { ceiling: false, turn: false, yaw: 0, lift: 0, readable: false };
      const i: AimInput = { hx: 0, eyeY: 0, hz: 0, feetY: 0, yawRef: 0, swing: 0, swingVel: 0, pitch: 0, dist: 0, camH: 0, camY: 0, minFrac: 0, assistMin: CAM_MIN, assist: false, mayTurn: true };
      const bad: string[] = [];
      let lifted = 0;
      let turned = 0;
      for (const s of spots) {
        const ground = heightAt(s.x, s.z);
        for (const hold of HOLDS) {
          const eye = ground + EYE + hold.lift;
          const n = gatherNear(near, occluders, s.x, s.z, hold.dist + 3);
          i.hx = s.x;
          i.eyeY = eye;
          i.hz = s.z;
          i.feetY = ground;
          i.pitch = hold.pitch;
          i.dist = hold.dist;
          i.camH = hold.dist * Math.cos(hold.pitch);
          i.camY = hold.dist * Math.sin(hold.pitch);
          for (const walking of [false, true]) {
            i.assist = walking;
            // The Rig's floor: the assist keeps a real distance (never past READ_DIST); standing, it may come to the shoulder.
            i.minFrac = walking ? Math.min(CAM_MIN, READ_DIST / hold.dist) : Math.min(CAM_MIN, CLOSEST / hold.dist);
            for (const yaw of YAWS) {
              const where = `${s.by} (${s.x},${s.z}) ${hold.name} ${walking ? "walking" : "standing"} yaw ${yaw.toFixed(2)}`;
              i.yawRef = yaw;
              const at = settle(aim, i, near, n);
              if (aim.lift > 0) lifted++;
              if (Math.abs(at - yaw) > 1e-9) turned++;
              if (aim.ceiling) {
                bad.push(`${where}: read as a ceiling`);
                continue;
              }
              // Where the Rig puts the lens: along the lifted line, shortened to what is clear, never under its floor.
              const p = hold.pitch + aim.lift;
              const h = hold.dist * Math.cos(p);
              const f = Math.max(i.minFrac, sightFraction(s.x, eye, s.z, h * Math.sin(at), hold.dist * Math.sin(p), h * Math.cos(at), near, n));
              const len = f * hold.dist;
              const ox = Math.sin(at) * Math.cos(p) * len;
              const oy = Math.sin(p) * len;
              const oz = Math.cos(at) * Math.cos(p) * len;
              if (!aim.readable) bad.push(`${where}: nothing readable (${len.toFixed(1)} from the eye)`);
              else if (len < READ_DIST) bad.push(`${where}: ${len.toFixed(1)} from the eye`);
              else if (inside(occluders, s.x + ox, eye + oy, s.z + oz) || inside(solids, s.x + ox, eye + oy, s.z + oz)) bad.push(`${where}: lens inside something`);
              else if (sightBlocked(near, n, s.x, eye, s.z, ox, oy, oz) || sightBlocked(near, n, s.x, eye - FIGURE_DROP, s.z, ox, oy, oz)) bad.push(`${where}: the child is hidden`);
            }
          }
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
      // The sweep is about tall things: it must actually have had to lift, and to turn, somewhere.
      expect(lifted).toBeGreaterThan(0);
      expect(turned).toBeGreaterThan(0);
    });
  }

  /**
   * The Rig's frame, as spike-scene.tsx runs it, for a child walking a straight line at a walk's
   * pace (5.5 a second) with the camera left alone: `aimBoom`, the duck and lift eases, the swing
   * with its momentum, `lensFrac` and the in-fast/out-gently ease, and the lens's own 9-a-second
   * follow. Returns what the walk looked like.
   */
  function walkAlong(occluders: Collider[], x0: number, z0: number, x1: number, z1: number, yawRef: number) {
    const near: Collider[] = new Array(1024);
    const aim: Aim = { ceiling: false, turn: false, yaw: 0, lift: 0, readable: true };
    const i: AimInput = { hx: 0, eyeY: 0, hz: 0, feetY: 0, yawRef, swing: 0, swingVel: 0, pitch: DEFAULT_PITCH, dist: DEFAULT_DIST, camH: 0, camY: 0, minFrac: 0, assistMin: 0, assist: true, mayTurn: true };
    const vel = { v: 0 };
    const arm = { h: 0, y: 0 };
    const arm0 = { h: 0, y: 0 };
    let duck = 0;
    let over = 0;
    let swing = 0;
    let frac = 1;
    let lens: number[] | null = null;
    let lastV = 0;
    const out = { reversals: 0, inWall: [] as string[], unseen: 0, frames: 0 };
    const dt = 1 / 60;
    const steps = Math.round(Math.hypot(x1 - x0, z1 - z0) / 5.5 / dt);
    // A second standing first, so the walk starts from a settled camera, as it does in play.
    for (let k = -60; k <= steps; k++) {
      const t = Math.max(0, k / steps);
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      const feet = heightAt(px, pz);
      const eye = feet + EYE;
      i.assist = k >= 0;
      boomOffset(arm, DEFAULT_PITCH + over * (1 - duck), DEFAULT_DIST);
      boomOffset(arm0, DEFAULT_PITCH, DEFAULT_DIST);
      const camH = arm.h + (8.5 - arm.h) * duck;
      const camY = arm.y + (3.6 - arm.y) * duck;
      const walkMin = Math.min(CAM_MIN, READ_DIST / DEFAULT_DIST);
      const assistMin = walkMin + (0.55 - walkMin) * duck;
      const minFrac = i.assist ? assistMin : Math.min(assistMin, CLOSEST / Math.hypot(camH, camY));
      const n = gatherNear(near, occluders, px, pz, Math.max(camH, arm0.h) + 3);
      Object.assign(i, { hx: px, eyeY: eye, hz: pz, feetY: feet, swing, swingVel: vel.v, minFrac, assistMin });
      i.camH = arm0.h + (8.5 - arm0.h) * duck;
      i.camY = arm0.y + (3.6 - arm0.y) * duck;
      aimBoom(aim, i, near, n);
      const wd = aim.ceiling ? 1 : 0;
      duck += (wd - duck) * (1 - Math.exp(-dt * (wd > duck ? 4.5 : 1.4)));
      over += (aim.lift - over) * (1 - Math.exp(-dt * (aim.lift > over ? 5 : 1.5)));
      const before = swing;
      if (aim.turn || vel.v !== 0) swing = swingStep(vel, swing, yawRef, aim.turn ? aim.yaw : null, dt, 1.3, !aim.readable);
      if (!aim.turn && Math.abs(vel.v) < 1e-3) vel.v = 0;
      const yaw = wrapAngle(yawRef + swing);
      const ox = camH * Math.sin(yaw);
      const oz = camH * Math.cos(yaw);
      const want = lensFrac(px, eye, pz, feet, ox, camY, oz, minFrac, near, n);
      frac += (want - frac) * (1 - Math.exp(-dt * (want < frac ? 16 : 3.5)));
      if (insideWall(px + ox * frac, eye + camY * frac, pz + oz * frac, near, n, feet)) frac = want;
      const d = [px + ox * frac, eye + camY * frac, pz + oz * frac];
      if (!lens) lens = d.slice();
      for (let j = 0; j < 3; j++) lens[j] += (d[j] - lens[j]) * (1 - Math.exp(-dt * 9));
      if (insideWall(lens[0], lens[1], lens[2], near, n, feet)) lens = d.slice();
      if (k < 0) continue;
      out.frames++;
      if (insideWall(lens[0], lens[1], lens[2], near, n, feet)) out.inWall.push(`(${px.toFixed(1)},${pz.toFixed(1)})`);
      const v = swing - before;
      if (Math.abs(v) > 1e-4) {
        if (lastV !== 0 && Math.sign(v) !== Math.sign(lastV)) out.reversals++;
        lastV = v;
      }
      const lx = lens[0] - px;
      const ly = lens[1] - eye;
      const lz = lens[2] - pz;
      if (sightFraction(px, eye, pz, lx, ly, lz, near, n) < 0.97) out.unseen++;
    }
    return out;
  }

  it("walking along the chapel, the mill and the watchtower: never a lens in a wall, and no rocking — the camera swings out once and home once at most", () => {
    const { occluders } = island("castle", true);
    const walks: [string, number, number, number, number, number][] = [
      // Camera behind, W along the wall.
      ["chapel east side, W", 17.0, -5, 17.0, -16, 0],

      ["mill north side, W", 1, 5.4, 9, 5.4, -Math.PI / 2],
      ["watchtower west side, W", -13.1, -7, -13.1, -13, 0],
      // The hard cases. The alley between the chapel and the castle, the roof's edge a hand's width
      // from the child. And the camera across the building, stepping sideways along its wall.
      ["chapel west side (the alley), W", 11.0, -8, 11.0, -15.5, 0],
      ["chapel east side, sideways, camera over the chapel", 17.2, -5, 17.2, -16, -Math.PI / 2],
      ["chapel north side, sideways, camera over the tower", 11.5, -15.4, 17.5, -15.4, 0],
      ["mill north side, sideways, camera over the mill", 1, 5.3, 9, 5.3, 0],
    ];
    for (const [name, x0, z0, x1, z1, yaw] of walks) {
      const w = walkAlong(occluders, x0, z0, x1, z1, yaw);
      expect(w.inWall, name).toEqual([]);
      expect(w.reversals, name).toBeLessThanOrEqual(2);
      // In the open, with the camera behind, the child is in sight the whole way.
      if (name.endsWith(", W") && !name.includes("alley")) expect(w.unseen, name).toBe(0);
    }
  });
});
