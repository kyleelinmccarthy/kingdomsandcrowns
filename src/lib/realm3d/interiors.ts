/**
 * THE INSIDES OF THINGS — one room per kind of building, as a plan: every wall, shelf, pew and
 * millstone as a shape, the solids the hero is stopped by, where they come in, who keeps the
 * room, and the one thing in it a child can press E at.
 *
 * Same idea as `castle-plan.ts`: the drawing and the collision come from the same numbers, so
 * what stops the hero is exactly what is drawn. Not a three.js module; the scene
 * (`interior-scene.tsx`) turns `parts` into merged meshes and never invents a coordinate.
 *
 * ## The frame
 *
 * Room-local, on a floor at y = 0, centred on x = 0. The door is in the SOUTH wall (+z), as it is
 * outside, at x = 0: a child who walked north through a door is facing north when they arrive.
 * `W`, `D`, `H` are the INNER width, depth and wall height. The walls are drawn outside that box.
 *
 * ## Why rooms are bigger than the houses they are in
 *
 * A cottage 4.5 units across outside cannot hold a hero 2.3 tall, a villager, a millstone and a
 * camera. Every game with houses you can enter has this, and children do not mind it — what
 * they mind is an inside that is a cupboard. So a room is sized for what happens in it.
 *
 * ## The cutaway
 *
 * Each wall carries a `side`. The scene hides a wall (and everything tagged with it — a bookcase
 * against it, a window in it) whenever the camera is on its far side, so the camera can sit
 * outside the room like a dolls' house and still see in. A knee-high course of every wall is
 * never hidden, so the room keeps its outline. See `hiddenWalls` in `room-rules.ts`.
 *
 * Deterministic: nothing here uses `Math.random`. The books on a shelf come from a hash.
 */

import type { Collider } from "./collision";
import type { RoomKind } from "./doorways";
import { ROOM_DIST, ROOM_PITCH } from "./room-rules";

export type PartShape = "box" | "cyl" | "cone" | "ball" | "gem";
export type WallSide = "n" | "s" | "e" | "w";

/**
 * One shape. `box`: `sx, sy, sz` are its full size. `cyl`: `sx` top radius, `sz` bottom radius,
 * `sy` height. `cone`: `sx` radius, `sy` height. `ball` and `gem`: radii on each axis.
 * `x, y, z` is the centre. Rotations are applied Y, then X, then Z... in three's default XYZ order.
 */
export type RoomPart = {
  shape: PartShape;
  color: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Radial segments for round shapes. Few, on purpose: this is the low-poly realm. */
  seg?: number;
  /** Unlit and bright: a window with daylight in it, a flame, stained glass. */
  glow?: boolean;
  /** See-through: the glasshouse's panes. */
  glass?: boolean;
  /** Hidden with this wall when the camera is past it. */
  side?: WallSide;
  /** Belongs to an animated group (`RoomAnim.id`). */
  anim?: string;
};

/**
 * Something that moves. Its parts are drawn about `(x, y, z)`, which is the pivot.
 *   - spin: turns about y for ever (millstones), faster while the fixture is used.
 *   - wheel: turns about x (a gear seen side-on).
 *   - swing: rocks about x once when used (the bell).
 *   - pull: drops and rises once when used (the bell rope).
 *   - tilt: rocks about z once when used (the scales, the lever).
 *   - flicker: breathes in scale (flames, the brazier).
 *   - orbit: circles about y (the bees), faster while used.
 *   - slide: glides back and forth along x (the model bridge's boat).
 *   - flip: turns about z, a page over (the great book), once when used.
 *   - rise: rises and glows when used (the throne's crown).
 */
export type AnimKind = "spin" | "wheel" | "swing" | "pull" | "tilt" | "flicker" | "orbit" | "slide" | "flip" | "rise";
export type RoomAnim = { id: string; kind: AnimKind; x: number; y: number; z: number };

export type RoomLight = { x: number; y: number; z: number; color: string; intensity: number; distance: number };

/** The one thing to press E at. `floor` is the height a child has to be standing at to reach it. */
export type RoomFixture = {
  id: string;
  label: string;
  verb: string;
  x: number;
  z: number;
  /** Its footprint radius, for reach. */
  r: number;
  floor: number;
  /** The animated group that answers a press. */
  anim: string;
  /** What the village says when it is used, in turn. `{hero}` is the child's name. */
  lines: string[];
};

export type RoomKeeper = { villager: string; x: number; z: number; face: number };

export type RoomMood = {
  background: string;
  sky: string;
  ground: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  /** Where the sun comes in from, as a direction TOWARD the light. */
  sunDir: [number, number, number];
};

export type RoomPlan = {
  kind: RoomKind;
  /** "the Chapel": what the prompt and the plaque call it. */
  name: string;
  /** "Inside the Chapel": the plaque, top left. */
  where: string;
  W: number;
  D: number;
  H: number;
  parts: RoomPart[];
  anims: RoomAnim[];
  lights: RoomLight[];
  solids: Collider[];
  /** Just inside the door, facing in (north, π). */
  spawn: { x: number; z: number; face: number };
  /** The doorway in the south wall. */
  door: { x: number; hw: number };
  keeper: RoomKeeper | null;
  fixture: RoomFixture;
  mood: RoomMood;
  /** How the camera first looks in: boom length and pitch. A great hall wants standing back from. */
  view: { dist: number; pitch: number };
};

/** The child's colours, for the castle's banners. */
export type RoomColors = { field: string; charge: string };

const DEFAULT_COLORS: RoomColors = { field: "#3b82f6", charge: "#f4d27a" };

/** How thick the walls are drawn. */
export const WALL_T = 0.45;
/** The knee-high course of every wall that is never cut away. */
export const WALL_STUB = 0.55;
/** The doorway: wide enough for the hero and their pet, taller than the hero. */
export const DOOR_W = 1.9;
export const DOOR_H = 3.1;
/** How far in from the door a child arrives. */
export const SPAWN_IN = 1.5;

/* ------------------------------------------------------------------ builder */

/** A tiny deterministic hash in [0, 1): the same book is always the same colour. */
export function hash(a: number, b: number = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

type PartOpts = Partial<Pick<RoomPart, "rx" | "ry" | "rz" | "seg" | "glow" | "glass" | "side" | "anim">>;

class Room {
  parts: RoomPart[] = [];
  anims: RoomAnim[] = [];
  lights: RoomLight[] = [];
  solids: Collider[] = [];
  constructor(
    readonly W: number,
    readonly D: number,
    readonly H: number,
  ) {}

  box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: PartOpts = {}): this {
    this.parts.push({ shape: "box", color, x, y, z, sx, sy, sz, ...o });
    return this;
  }
  cyl(color: string, x: number, y: number, z: number, rTop: number, h: number, rBottom: number = rTop, o: PartOpts = {}): this {
    this.parts.push({ shape: "cyl", color, x, y, z, sx: rTop, sy: h, sz: rBottom, ...o });
    return this;
  }
  cone(color: string, x: number, y: number, z: number, r: number, h: number, o: PartOpts = {}): this {
    this.parts.push({ shape: "cone", color, x, y, z, sx: r, sy: h, sz: r, ...o });
    return this;
  }
  ball(color: string, x: number, y: number, z: number, rx: number, ry: number = rx, rz: number = rx, o: PartOpts = {}): this {
    this.parts.push({ shape: "ball", color, x, y, z, sx: rx, sy: ry, sz: rz, ...o });
    return this;
  }
  gem(color: string, x: number, y: number, z: number, r: number, o: PartOpts = {}): this {
    this.parts.push({ shape: "gem", color, x, y, z, sx: r, sy: r, sz: r, ...o });
    return this;
  }
  /** A solid box, floor-standing unless `base` says otherwise. Half-extents, like every collider. */
  solid(x: number, z: number, hw: number, hd: number, top: number, base = 0): this {
    this.solids.push({ x, z, hw, hd, round: false, base, top });
    return this;
  }
  solidRound(x: number, z: number, r: number, top: number, base = 0): this {
    this.solids.push({ x, z, hw: r, hd: r, round: true, base, top });
    return this;
  }
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number): this {
    this.lights.push({ x, y, z, color, intensity, distance });
    return this;
  }
  anim(id: string, kind: AnimKind, x: number, y: number, z: number): this {
    this.anims.push({ id, kind, x, y, z });
    return this;
  }

  /**
   * Floor, four walls with their never-hidden knee course, a door in the south wall with
   * daylight in it, and the solids that keep the hero in. `boards` lays planks (true) or
   * flagstones (false) over the floor, so no floor is one flat colour.
   */
  shell(o: { wall: string; trim: string; floor: string; floor2: string; boards: boolean; outside?: string; stub?: number; glassAbove?: boolean }): this {
    const { W, D, H } = this;
    const STUB = o.stub ?? WALL_STUB;
    const upper = !o.glassAbove;
    const hw = W / 2;
    const hd = D / 2;
    const T = WALL_T;
    // The floor slab, a little wider than the room so the knee course stands on it.
    this.box(o.floor, 0, -0.15, 0, W + T * 2, 0.3, D + T * 2);
    if (o.boards) {
      const n = Math.round(W / 0.9);
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        const x = -hw + (i + 0.5) * (W / n);
        this.box(o.floor2, x, 0.005, 0, W / n - 0.04, 0.01, D);
      }
    } else {
      const nx = Math.round(W / 1.6);
      const nz = Math.round(D / 1.6);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          if ((i + j) % 2) continue;
          this.box(o.floor2, -hw + (i + 0.5) * (W / nx), 0.005, -hd + (j + 0.5) * (D / nz), W / nx - 0.08, 0.01, D / nz - 0.08);
        }
      }
    }
    const up = H - STUB;
    const midY = STUB + up / 2;
    // North, east, west: a stub that always shows, and the rest of the wall, which is cut away.
    this.box(o.wall, 0, STUB / 2, -hd - T / 2, W + T * 2, STUB, T);
    if (upper) this.box(o.wall, 0, midY, -hd - T / 2, W + T * 2, up, T, { side: "n" });
    this.box(o.trim, 0, H + 0.1, -hd - T / 2, W + T * 2 + 0.1, 0.2, T + 0.1, { side: "n" });
    for (const s of [-1, 1] as const) {
      const side: WallSide = s < 0 ? "w" : "e";
      this.box(o.wall, s * (hw + T / 2), STUB / 2, 0, T, STUB, D);
      if (upper) this.box(o.wall, s * (hw + T / 2), midY, 0, T, up, D, { side });
      this.box(o.trim, s * (hw + T / 2), H + 0.1, 0, T + 0.1, 0.2, D + T * 2 + 0.1, { side });
      // A timber skirting where the floor meets the wall.
      this.box(o.trim, s * (hw - 0.04), 0.12, 0, 0.08, 0.24, D);
    }
    this.box(o.trim, 0, 0.12, -hd + 0.04, W, 0.24, 0.08);
    // South: either side of the doorway, and a lintel over it.
    const side = (W - DOOR_W) / 2;
    for (const s of [-1, 1]) {
      const cx = s * (DOOR_W / 2 + side / 2 + T / 2);
      this.box(o.wall, cx, STUB / 2, hd + T / 2, side + T, STUB, T);
      if (upper) this.box(o.wall, cx, midY, hd + T / 2, side + T, up, T, { side: "s" });
    }
    if (upper) this.box(o.wall, 0, (DOOR_H + H) / 2, hd + T / 2, DOOR_W, H - DOOR_H, T, { side: "s" });
    this.box(o.trim, 0, H + 0.1, hd + T / 2, W + T * 2 + 0.1, 0.2, T + 0.1, { side: "s" });
    // The door frame, with daylight in it. It goes with the south wall when the camera is out
    // past it (it would stand between the lens and the child) — the pool of daylight on the
    // floor and the mat stay, so the way out is always marked.
    for (const s of [-1, 1]) this.box(o.trim, s * (DOOR_W / 2 + 0.1), DOOR_H / 2, hd + 0.02, 0.2, DOOR_H, T + 0.14, { side: "s" });
    this.box(o.trim, 0, DOOR_H + 0.1, hd + 0.02, DOOR_W + 0.4, 0.2, T + 0.14, { side: "s" });
    this.box(o.outside ?? "#dff0c8", 0, DOOR_H / 2, hd + T + 0.02, DOOR_W, DOOR_H, 0.04, { glow: true, side: "s" });
    for (const s of [-1, 1]) this.box(o.trim, s * (DOOR_W / 2 + 0.1), WALL_STUB / 2, hd + 0.02, 0.2, WALL_STUB, T + 0.14);
    this.box("#f6e6b0", 0, 0.012, hd - 0.7, DOOR_W * 0.9, 0.012, 1.3, { glow: true });
    this.box("#8a3b2c", 0, 0.03, hd - 0.75, 1.5, 0.04, 0.9); // a doormat
    // The walls, as solids: all the way round, the doorway included — it is left by walking into it.
    this.solid(0, -hd - 0.5, hw + 1, 0.5, H + 2);
    this.solid(0, hd + 0.5, hw + 1, 0.5, H + 2);
    this.solid(-hw - 0.5, 0, 0.5, hd + 1, H + 2);
    this.solid(hw + 0.5, 0, 0.5, hd + 1, H + 2);
    return this;
  }

  /** A window: a pane of glow in a wall, with a frame and a sill. `face` is which wall. */
  window(side: WallSide, along: number, y: number, w: number, h: number, pane = "#cfe6f2", frame = "#6b4a30"): this {
    const { W, D } = this;
    const inset = 0.03;
    if (side === "n" || side === "s") {
      const z = side === "n" ? -D / 2 + inset : D / 2 - inset;
      this.box(pane, along, y, z, w, h, 0.04, { glow: true, side });
      this.box(frame, along, y, z + (side === "n" ? 0.05 : -0.05), 0.1, h, 0.08, { side });
      this.box(frame, along, y, z + (side === "n" ? 0.05 : -0.05), w, 0.1, 0.08, { side });
      this.box(frame, along, y - h / 2 - 0.06, z + (side === "n" ? 0.12 : -0.12), w + 0.3, 0.12, 0.26, { side });
    } else {
      const x = side === "w" ? -W / 2 + inset : W / 2 - inset;
      this.box(pane, x, y, along, 0.04, h, w, { glow: true, side });
      this.box(frame, x + (side === "w" ? 0.05 : -0.05), y, along, 0.08, h, 0.1, { side });
      this.box(frame, x + (side === "w" ? 0.05 : -0.05), y, along, 0.08, 0.1, w, { side });
      this.box(frame, x + (side === "w" ? 0.12 : -0.12), y - h / 2 - 0.06, along, 0.26, 0.12, w + 0.3, { side });
    }
    return this;
  }

  /**
   * A straight flight of steps, each `rise` high, climbing from `(x0, z0)` toward `(x1, z1)`
   * (along one axis only), `width` wide. Every step is a solid block from the floor, so the hero
   * walks up it with the ordinary step-up rule and can never walk underneath it.
   */
  stairs(o: { x: number; z: number; along: "-z" | "+z" | "-x" | "+x"; steps: number; tread: number; rise: number; width: number; color: string; edge: string; side?: WallSide }): this {
    for (let i = 0; i < o.steps; i++) {
      const top = (i + 1) * o.rise;
      const d = (i + 0.5) * o.tread;
      const cx = o.along === "+x" ? o.x + d : o.along === "-x" ? o.x - d : o.x;
      const cz = o.along === "+z" ? o.z + d : o.along === "-z" ? o.z - d : o.z;
      const alongZ = o.along === "+z" || o.along === "-z";
      const sx = alongZ ? o.width : o.tread;
      const sz = alongZ ? o.tread : o.width;
      this.box(o.color, cx, top / 2, cz, sx, top, sz);
      this.box(o.edge, cx, top - 0.03, cz, sx + 0.02, 0.06, sz + 0.02);
      this.solid(cx, cz, sx / 2, sz / 2, top);
    }
    return this;
  }

  /** A rail at `top` along x or z, posts every metre or so, and a solid the hero leans on. */
  rail(o: { x0: number; x1: number; z0: number; z1: number; floor: number; color: string }): this {
    const alongX = Math.abs(o.x1 - o.x0) >= Math.abs(o.z1 - o.z0);
    const len = alongX ? Math.abs(o.x1 - o.x0) : Math.abs(o.z1 - o.z0);
    const cx = (o.x0 + o.x1) / 2;
    const cz = (o.z0 + o.z1) / 2;
    this.box(o.color, cx, o.floor + 1.0, cz, alongX ? len : 0.12, 0.1, alongX ? 0.12 : len);
    this.box(o.color, cx, o.floor + 0.55, cz, alongX ? len : 0.06, 0.06, alongX ? 0.06 : len);
    const n = Math.max(2, Math.round(len / 1.1) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.box(o.color, o.x0 + (o.x1 - o.x0) * t, o.floor + 0.5, o.z0 + (o.z1 - o.z0) * t, 0.1, 1.0, 0.1);
    }
    this.solid(cx, cz, alongX ? len / 2 : 0.1, alongX ? 0.1 : len / 2, o.floor + 1.05, o.floor);
    return this;
  }

  /** A candle, or a lamp flame: a stick, and a flame that flickers. */
  flame(x: number, y: number, z: number, size = 1, anim?: string, side?: WallSide): this {
    const id = anim ?? `flame${this.anims.length}`;
    this.anim(id, "flicker", x, y, z);
    this.cone("#ffc861", x, y + 0.09 * size, z, 0.07 * size, 0.24 * size, { glow: true, anim: id, side, seg: 6 });
    this.gem("#fff1c2", x, y + 0.04 * size, z, 0.04 * size, { glow: true, anim: id, side });
    return this;
  }

  finish(kind: RoomKind, name: string, keeper: RoomKeeper | null, fixture: RoomFixture, mood: RoomMood, view = { dist: ROOM_DIST, pitch: ROOM_PITCH }): RoomPlan {
    return {
      kind,
      name,
      where: `Inside ${name}`,
      W: this.W,
      D: this.D,
      H: this.H,
      parts: this.parts,
      anims: this.anims,
      lights: this.lights,
      solids: this.solids,
      spawn: { x: 0, z: this.D / 2 - SPAWN_IN, face: Math.PI },
      door: { x: 0, hw: DOOR_W / 2 },
      keeper,
      fixture,
      mood,
      view,
    };
  }
}

const WARM: RoomMood = {
  background: "#1b140f",
  sky: "#fff1d6",
  ground: "#5a4632",
  hemi: 0.95,
  sun: "#ffe8bd",
  sunIntensity: 1.7,
  sunDir: [0.5, 0.9, 0.35],
};

/* ------------------------------------------------------------------ the mill */

function mill(): RoomPlan {
  const r = new Room(12, 10, 5);
  r.shell({ wall: "#e7dcc3", trim: "#6b4a30", floor: "#8a6a44", floor2: "#9c7a50", boards: true });
  // Timber framing on the plaster: posts and a rail, so the walls read as a working mill.
  for (const x of [-3, 3]) r.box("#6b4a30", x, 2.5, -5 + 0.05, 0.22, 5, 0.1, { side: "n" });
  for (const z of [-2.5, 2.5]) for (const s of [-1, 1]) r.box("#6b4a30", s * 5.95, 2.5, z, 0.1, 5, 0.22, { side: s < 0 ? "w" : "e" });
  r.box("#6b4a30", 0, 3.4, -5 + 0.05, 12, 0.18, 0.1, { side: "n" });
  r.window("e", -1, 3.2, 1.4, 1.2).window("w", 1.5, 3.2, 1.4, 1.2);

  // The stones on their wooden stage: a bed stone that stays, a runner that turns, a hopper over
  // them feeding grain, and the shaft and crown wheel that drive it all, turning with them.
  const cx = 0;
  const cz = -1.4;
  r.box("#7c5c38", cx, 0.3, cz, 4.2, 0.6, 4.2);
  r.box("#6b4a30", cx, 0.62, cz, 4.3, 0.06, 4.3);
  r.solid(cx, cz, 2.1, 2.1, 0.6);
  r.cyl("#a8a296", cx, 0.85, cz, 1.55, 0.5, 1.6, { seg: 14 });
  r.anim("stones", "spin", cx, 1.3, cz);
  r.cyl("#b8b2a6", cx, 1.3, cz, 1.5, 0.42, 1.52, { anim: "stones", seg: 14 });
  for (let i = 0; i < 4; i++) r.box("#8e887d", cx, 1.52, cz, 2.9, 0.03, 0.1, { anim: "stones", ry: (i * Math.PI) / 4 });
  r.cyl("#4a4035", cx, 1.52, cz, 0.28, 0.04, 0.28, { anim: "stones", seg: 10 });
  r.solidRound(cx, cz, 1.6, 1.55);
  r.cyl("#6b4a30", cx, 3.25, cz, 0.16, 3.5, 0.16, { anim: "stones", seg: 8 });
  r.cyl("#7c5c38", cx, 4.35, cz, 1.15, 0.24, 1.15, { anim: "stones", seg: 12 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    r.box("#5b3f28", cx + Math.sin(a) * 1.2, 4.55, cz + Math.cos(a) * 1.2, 0.18, 0.2, 0.18, { anim: "stones", ry: a });
  }
  // The hopper on four legs, upside-down pyramid, grain in its mouth.
  r.cone("#8b6a42", cx, 2.55, cz, 1.0, 1.1, { rx: Math.PI, seg: 4, ry: Math.PI / 4 });
  r.cyl("#d9b45c", cx, 3.08, cz, 0.62, 0.06, 0.62, { seg: 4, ry: Math.PI / 4 });
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) r.box("#6b4a30", cx + dx, 2.0, cz + dz, 0.14, 2.8, 0.14);
  // A pale ring of flour round the stones.
  r.cyl("#f2ead8", cx, 0.64, cz, 1.95, 0.02, 1.95, { seg: 14 });

  // The lever that sets the stones going: the thing to press E at.
  r.box("#5b3f28", 2.9, 0.6, 1.0, 0.3, 1.2, 0.3);
  r.anim("lever", "tilt", 2.9, 1.15, 1.0);
  r.box("#7c5c38", 2.9, 1.75, 1.0, 0.12, 1.3, 0.12, { anim: "lever", rz: 0.35 });
  r.ball("#c0392b", 2.67, 2.35, 1.0, 0.16, 0.16, 0.16, { anim: "lever" });
  r.solid(2.9, 1.0, 0.2, 0.2, 1.2);

  // Sacks of flour stacked against the west wall, and a scoop in an open one.
  const sacks: [number, number, number][] = [
    [-5.1, 0.45, -3.6], [-5.1, 0.45, -2.6], [-5.1, 0.45, -1.6], [-4.2, 0.45, -3.2], [-4.2, 0.45, -2.1],
    [-5.1, 1.25, -3.1], [-5.1, 1.25, -2.1], [-4.25, 1.2, -2.65],
  ];
  sacks.forEach(([x, y, z], i) => {
    r.ball(i % 3 ? "#efe6d2" : "#e2d6bb", x, y, z, 0.5, 0.45, 0.42, { ry: hash(i) * 0.6 });
    r.cyl("#8b6a42", x, y + 0.42, z, 0.12, 0.12, 0.16, { seg: 6 });
  });
  r.solid(-4.7, -2.6, 1.0, 1.4, 1.6);
  r.box("#8b6a42", -4.9, 0.5, 2.6, 1.2, 1.0, 1.4);
  r.box("#f2ead8", -4.9, 1.02, 2.6, 1.0, 0.04, 1.2);
  r.solid(-4.9, 2.6, 0.6, 0.7, 1.0);
  // A bench with a lantern and a scale, and barrels by the east wall.
  r.box("#7c5c38", 4.9, 1.0, -3.2, 1.6, 0.12, 2.6);
  for (const [dx, dz] of [[-0.6, -1.1], [0.6, -1.1], [-0.6, 1.1], [0.6, 1.1]]) r.box("#5b3f28", 4.9 + dx, 0.5, -3.2 + dz, 0.12, 1.0, 0.12);
  r.solid(4.9, -3.2, 0.8, 1.3, 1.06);
  r.box("#3f3a33", 4.9, 1.35, -2.4, 0.3, 0.55, 0.3);
  r.flame(4.9, 1.3, -2.4, 1.3, "lamp");
  r.light(4.9, 2.2, -2.4, "#ffc977", 6, 9);
  for (const [x, z] of [[4.7, 1.8], [5.2, 3.2], [4.1, 3.4]]) {
    r.cyl("#8b6a42", x, 0.6, z, 0.46, 1.2, 0.42, { seg: 10 });
    r.cyl("#5b3f28", x, 0.35, z, 0.47, 0.08, 0.47, { seg: 10 });
    r.cyl("#5b3f28", x, 0.95, z, 0.47, 0.08, 0.47, { seg: 10 });
    r.solidRound(x, z, 0.48, 1.2);
  }
  r.light(0, 4.2, 1.5, "#ffe2b0", 10, 16);

  return r.finish(
    "mill",
    "the Grain Mill",
    { villager: "tessa", x: -2.9, z: 1.2, face: 0.7 },
    {
      id: "lever",
      label: "the lever",
      verb: "Pull",
      x: 2.9,
      z: 1.0,
      r: 0.35,
      floor: 0,
      anim: "lever",
      lines: [
        "The stones rumble round and round. Flour for every oven in {hero}'s village!",
        "Miller Tessa laughs: \"Mind your toes! That's a whole harvest going through.\"",
        "Whoosh — a puff of flour. You'll be white as a ghost by supper.",
      ],
    },
    WARM,
  );
}

/* ------------------------------------------------------------------ the bridge: Aldo's workshop */

function bridge(): RoomPlan {
  const r = new Room(12, 10, 4.8);
  r.shell({ wall: "#c9a57a", trim: "#5b3f28", floor: "#9c7a50", floor2: "#ad8a5c", boards: true });
  for (let i = -5; i <= 5; i += 1.25) r.box("#b8946a", i, 2.4, -5 + 0.03, 0.06, 4.8, 0.06, { side: "n" });
  r.window("n", 3.6, 3.0, 1.6, 1.1).window("e", 1.5, 3.0, 1.4, 1.1);

  // The workbench along the north wall, with a vice, a saw, a plane and a mallet on it.
  r.box("#7c5c38", -2, 1.05, -4.2, 5, 0.16, 1.3);
  for (const [dx, dz] of [[-2.3, -0.5], [2.3, -0.5], [-2.3, 0.5], [2.3, 0.5]]) r.box("#5b3f28", -2 + dx, 0.5, -4.2 + dz, 0.16, 1.0, 0.16);
  r.box("#6b4a30", -2, 0.3, -4.2, 4.6, 0.08, 1.1);
  r.solid(-2, -4.2, 2.5, 0.65, 1.13);
  r.box("#9aa3a8", -3.6, 1.15, -4.0, 1.2, 0.02, 0.36, { rz: 0.02 }); // saw blade
  r.box("#7c4a26", -2.9, 1.2, -4.0, 0.28, 0.2, 0.12); // its handle
  r.box("#a57c4a", -1.4, 1.22, -4.1, 0.7, 0.18, 0.22); // a plane
  r.box("#5b3f28", -0.4, 1.2, -3.9, 0.3, 0.2, 0.2).box("#8b6a42", -0.4, 1.18, -3.6, 0.07, 0.07, 0.6); // mallet
  for (let i = 0; i < 10; i++) r.gem("#e8c98a", -2.6 + hash(i, 3) * 3.4, 1.16, -4.5 + hash(i, 4) * 0.7, 0.07 + hash(i, 5) * 0.05); // shavings
  // Tools on the wall over the bench.
  r.box("#b8946a", -2, 2.6, -5 + 0.04, 4.6, 1.5, 0.06, { side: "n" });
  for (let i = 0; i < 7; i++) {
    const x = -3.9 + i * 0.62;
    r.box(i % 2 ? "#9aa3a8" : "#6b4a30", x, 2.55 + (i % 3) * 0.1, -5 + 0.12, 0.12, 0.7 + (i % 3) * 0.2, 0.06, { side: "n" });
  }
  // Planks leaning in a rack against the west wall.
  for (let i = 0; i < 6; i++) r.box(i % 2 ? "#c49a62" : "#b38a55", -5.6 + i * 0.06, 1.9, -1.5 + i * 0.5, 0.1, 3.6, 0.36, { rz: -0.12, side: "w" });
  r.solid(-5.5, 0, 0.5, 2.2, 3.6);
  // Two sawhorses with a plank across them, and a barrel of nails.
  for (const z of [1.4, 2.8]) {
    r.box("#8b6a42", -3.2, 0.85, z, 1.6, 0.12, 0.14);
    for (const s of [-1, 1]) for (const t of [-1, 1]) r.box("#6b4a30", -3.2 + s * 0.6, 0.42, z + t * 0.18, 0.1, 0.9, 0.1, { rx: t * 0.3 });
  }
  r.box("#c49a62", -3.2, 0.97, 2.1, 0.4, 0.1, 3.0);
  r.solid(-3.2, 2.1, 0.85, 1.0, 1.02);
  r.cyl("#8b6a42", 4.8, 0.55, 3.2, 0.42, 1.1, 0.38, { seg: 10 }).cyl("#7f8a90", 4.8, 1.11, 3.2, 0.36, 0.04, 0.36, { seg: 10 });
  r.solidRound(4.8, 3.2, 0.45, 1.1);

  // The model of the River Bridge on its own table — the thing a child looks at.
  const mx = 2.6;
  const mz = -0.6;
  r.box("#7c5c38", mx, 0.95, mz, 2.6, 0.12, 1.5);
  for (const [dx, dz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) r.box("#5b3f28", mx + dx, 0.45, mz + dz, 0.12, 0.9, 0.12);
  r.solid(mx, mz, 1.3, 0.75, 1.01);
  r.box("#4f86c6", mx, 1.02, mz, 2.4, 0.03, 0.5, { glow: false }); // the river
  r.box("#6fb04a", mx - 1.0, 1.05, mz, 0.4, 0.06, 1.3).box("#6fb04a", mx + 1.0, 1.05, mz, 0.4, 0.06, 1.3); // banks
  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * 2 - 1;
    const y = 1.28 - t * t * 0.18;
    r.box("#c49a62", mx + t * 0.9, y, mz, 0.2, 0.05, 0.62, { rz: t * 0.35 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const t = (i / 6) * 2 - 1;
    r.box("#8b6a42", mx + t * 0.86, 1.4 - t * t * 0.18, mz + s * 0.3, 0.04, 0.2, 0.04);
  }
  r.anim("boat", "slide", mx, 1.08, mz);
  r.box("#a0522d", mx, 1.08, mz, 0.26, 0.07, 0.12, { anim: "boat" });
  r.box("#f5f1e6", mx, 1.2, mz, 0.02, 0.16, 0.12, { anim: "boat" });
  r.light(0, 4.0, 0.5, "#ffe2b0", 10, 16);
  r.box("#3f3a33", 4.9, 2.4, -2.2, 0.26, 0.4, 0.26, { side: "e" });
  r.flame(4.9, 2.35, -2.2, 1.2, "lamp", "e");

  return r.finish(
    "bridge",
    "the Carpenter's Workshop",
    { villager: "aldo", x: -0.4, z: -2.7, face: 0.4 },
    {
      id: "model",
      label: "the model bridge",
      verb: "Look at",
      x: mx,
      z: mz,
      r: 1.3,
      floor: 0,
      anim: "boat",
      lines: [
        "A little model of the River Bridge, every plank numbered in Aldo's neat hand.",
        "Aldo: \"Measure twice, cut once. That's the whole secret of a bridge!\"",
        "A tiny boat sails under the tiny arch. Just like the real one.",
      ],
    },
    WARM,
  );
}

/* ------------------------------------------------------------------ the chapel */

function chapel(): RoomPlan {
  const r = new Room(10, 14, 6.5);
  r.shell({ wall: "#cfc5b2", trim: "#8e8578", floor: "#948e82", floor2: "#a39d90", boards: false, outside: "#e8f3d4" });
  // The aisle runner, door to dais.
  r.box("#9e2b2b", 0, 0.02, 0.6, 1.5, 0.02, 11.6);
  r.box("#d4a843", 0, 0.025, 0.6, 1.62, 0.01, 11.7);
  // Pews, four rows a side. Low enough to hop up onto, which a child will.
  for (const z of [3.8, 1.7, -0.4, -2.5]) {
    for (const s of [-1, 1]) {
      const x = s * 2.85;
      r.box("#8b5a34", x, 0.6, z, 3.3, 0.12, 0.72);
      r.box("#7a4a2a", x, 1.05, z + 0.34, 3.3, 0.85, 0.1);
      for (const e of [-1, 1]) r.box("#6b3f22", x + e * 1.62, 0.55, z + 0.05, 0.1, 1.1, 0.82);
      r.solid(x, z + 0.05, 1.68, 0.44, 0.66);
    }
  }
  // The dais, one step up, and the altar on it with its cloth and two candles.
  r.box("#b3ab9c", 0, 0.125, -5.8, 10, 0.25, 2.4);
  r.solid(0, -5.8, 5, 1.2, 0.25);
  r.box("#f3efe4", 0, 0.8, -6.2, 2.6, 1.1, 1.0);
  r.box("#d4a843", 0, 1.1, -5.69, 2.62, 0.12, 0.02);
  r.box("#9e2b2b", 0, 0.8, -5.69, 0.5, 1.0, 0.02);
  r.solid(0, -6.2, 1.3, 0.5, 1.35);
  for (const s of [-1, 1]) {
    r.cyl("#d4a843", s * 0.9, 1.6, -6.2, 0.05, 0.5, 0.12, { seg: 6 });
    r.cyl("#f8f3e6", s * 0.9, 2.0, -6.2, 0.06, 0.3, 0.06, { seg: 6 });
    r.flame(s * 0.9, 2.15, -6.2, 1.1);
  }
  r.light(0, 2.8, -5.8, "#ffcf87", 3.5, 7);
  // The rose window over the altar: stained glass, in a circle of panes.
  const colors = ["#d64545", "#3f6fd6", "#e8b33a", "#4fa84f", "#9b59b6", "#e67e22"];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (i * i + j * j > 10) continue;
      const c = colors[Math.floor(hash(i + 7, j + 3) * colors.length)];
      r.box(i === 0 && j === 0 ? "#fff1c2" : c, i * 0.42, 4.4 + j * 0.42, -7 + 0.04, 0.38, 0.38, 0.04, { glow: true, side: "n" });
    }
  }
  r.cyl("#8e8578", 0, 4.4, -7 + 0.01, 1.55, 0.04, 1.55, { rx: Math.PI / 2, seg: 18, side: "n" });
  r.light(0, 4.2, -5.5, "#b7c9ff", 3, 9);
  // Tall windows down both sides.
  for (const z of [3, -1.5]) {
    r.window("e", z, 3.4, 0.9, 2.4, "#d8e8ff", "#8e8578");
    r.window("w", z, 3.4, 0.9, 2.4, "#d8e8ff", "#8e8578");
  }
  // Candle stands along the walls.
  for (const [x, z] of [[-4.5, 4.8], [4.5, 4.8], [-4.5, -4.3], [4.5, -4.3]]) {
    r.cyl("#6b5a3f", x, 0.7, z, 0.06, 1.4, 0.2, { seg: 6 });
    r.flame(x, 1.45, z, 1.2);
    r.solidRound(x, z, 0.22, 1.4);
  }
  // The bell: a beam across the top of the walls, the bell hung from it, and the rope down to a
  // striped sally a child can reach.
  const bx = 3.9;
  const bz = -3.6;
  r.box("#6b4a30", bx, 6.45, bz, 0.35, 0.35, 14 + WALL_T * 2);
  r.anim("bell", "swing", bx, 6.3, bz);
  r.cyl("#c9a13a", bx, 5.75, bz, 0.34, 0.9, 0.62, { anim: "bell", seg: 12 });
  r.cyl("#b38a2a", bx, 5.28, bz, 0.66, 0.1, 0.66, { anim: "bell", seg: 12 });
  r.ball("#7a5c1e", bx, 5.2, bz, 0.12, 0.12, 0.12, { anim: "bell" });
  r.anim("rope", "pull", bx, 0, bz);
  r.cyl("#d9c9a0", bx, 3.2, bz, 0.035, 4.2, 0.035, { anim: "rope", seg: 5 });
  for (let i = 0; i < 4; i++) r.cyl(i % 2 ? "#f5f1e6" : "#c0392b", bx, 1.35 + i * 0.16, bz, 0.1, 0.16, 0.1, { anim: "rope", seg: 8 });
  r.cyl("#d9c9a0", bx, 1.1, bz, 0.05, 0.3, 0.05, { anim: "rope", seg: 5 });

  return r.finish(
    "chapel",
    "the Chapel",
    { villager: "wren", x: -1.9, z: -4.2, face: 0.3 },
    {
      id: "bell",
      label: "the bell",
      verb: "Ring",
      x: bx,
      z: bz,
      r: 0.3,
      floor: 0,
      anim: "bell",
      lines: [
        "Dong… dong… The chapel bell rings out over {hero}'s village.",
        "Sister Wren smiles. \"Everyone from here to the mill heard that!\"",
        "Dong! A flock of pigeons bursts off the roof outside.",
      ],
    },
    { ...WARM, hemi: 0.75, sunDir: [0.3, 1, 0.2], sunIntensity: 1.3 },
  );
}

/* ------------------------------------------------------------------ the market hall */

function market(): RoomPlan {
  const r = new Room(14, 11, 5);
  r.shell({ wall: "#ecd9b4", trim: "#6b4a30", floor: "#a8987c", floor2: "#b8a88b", boards: false });
  for (const x of [-4.6, 0, 4.6]) r.box("#6b4a30", x, 2.5, -5.5 + 0.05, 0.22, 5, 0.1, { side: "n" });
  r.window("n", -2.3, 3.3, 1.4, 1.1).window("n", 2.3, 3.3, 1.4, 1.1);

  // Three stalls, each a counter, four posts and a striped awning.
  const stall = (x: number, z: number, ry: number, a: string, b: string, goods: (cx: number, cz: number) => void) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [cx, cz] = at(0, 0);
    r.box("#8b6a42", cx, 0.5, cz, 3.0, 1.0, 1.0, { ry });
    r.box("#6b4a30", cx, 1.03, cz, 3.1, 0.06, 1.1, { ry });
    for (const lx of [-1.45, 1.45]) {
      for (const lz of [-0.45, 0.9]) {
        const [px, pz] = at(lx, lz);
        r.box("#6b4a30", px, 1.45, pz, 0.12, 2.9, 0.12);
      }
    }
    for (let i = 0; i < 6; i++) {
      const [px, pz] = at(-1.4 + i * 0.56, 0.2);
      r.box(i % 2 ? a : b, px, 2.95, pz, 0.56, 0.08, 1.7, { ry });
    }
    for (let i = 0; i < 6; i++) {
      const [px, pz] = at(-1.4 + i * 0.56, 1.05);
      r.cone(i % 2 ? a : b, px, 2.72, pz, 0.26, 0.4, { rx: Math.PI, seg: 3, ry });
    }
    const hw = Math.abs(c) * 1.5 + Math.abs(s) * 0.5;
    const hd = Math.abs(s) * 1.5 + Math.abs(c) * 0.5;
    r.solid(cx, cz, hw, hd, 1.05);
    goods(cx, cz);
  };
  stall(-4.8, -2.4, Math.PI / 2, "#c0563d", "#f3e2bd", (cx, cz) => {
    for (let i = 0; i < 9; i++) r.ball("#d23c3c", cx + (hash(i) - 0.5) * 0.6, 1.18 + (i % 3) * 0.05, cz + (i - 4) * 0.28, 0.13);
  });
  stall(0, -4.0, 0, "#3f6fd6", "#f3e2bd", (cx, cz) => {
    for (let i = 0; i < 6; i++) r.ball("#d9a441", cx - 1.1 + i * 0.44, 1.18, cz, 0.2, 0.14, 0.15, { ry: i }); // loaves
  });
  stall(4.8, -2.4, -Math.PI / 2, "#4fa84f", "#f3e2bd", (cx, cz) => {
    for (let i = 0; i < 5; i++) r.gem("#5aa55a", cx + (hash(i, 2) - 0.5) * 0.5, 1.22, cz - 1.0 + i * 0.5, 0.2); // cabbages
  });
  // Pumpkins and crates on the floor, barrels in the corners.
  for (const [x, z, s] of [[-2.2, -4.6, 0.42], [-1.6, -4.9, 0.3], [5.9, 1.2, 0.4]] as const) {
    r.ball("#e67e22", x, s * 0.8, z, s, s * 0.8, s);
    r.cyl("#4a7a2a", x, s * 1.6, z, 0.04, 0.16, 0.05, { seg: 5 });
  }
  r.solidRound(-2.0, -4.7, 0.6, 0.7);
  for (const [x, z] of [[-6.1, 3.9], [6.1, 3.9], [6.1, -4.6], [-6.1, -4.6]]) {
    r.cyl("#8b6a42", x, 0.6, z, 0.46, 1.2, 0.42, { seg: 10 });
    r.cyl("#5b3f28", x, 0.35, z, 0.47, 0.08, 0.47, { seg: 10 }).cyl("#5b3f28", x, 0.95, z, 0.47, 0.08, 0.47, { seg: 10 });
    r.solidRound(x, z, 0.48, 1.2);
  }
  // Bunting overhead, in two strings.
  const flags = ["#d64545", "#e8b33a", "#3f6fd6", "#4fa84f"];
  for (const z of [-0.5, 2.5]) {
    r.box("#8b6a42", 0, 4.2, z, 14, 0.03, 0.03);
    for (let i = 0; i < 18; i++) r.cone(flags[i % 4], -6.6 + i * 0.78, 3.95, z, 0.2, 0.45, { rx: Math.PI, seg: 3 });
  }
  // The scales in the middle of the hall: the thing to use.
  const sx = 0;
  const sz = 0.2;
  r.box("#7c5c38", sx, 0.45, sz, 1.3, 0.9, 0.9);
  r.solid(sx, sz, 0.65, 0.45, 0.9);
  r.cyl("#b38a2a", sx, 1.45, sz, 0.05, 1.1, 0.08, { seg: 6 });
  r.anim("scales", "tilt", sx, 1.95, sz);
  r.box("#c9a13a", sx, 1.95, sz, 1.5, 0.06, 0.06, { anim: "scales" });
  for (const s of [-1, 1]) {
    r.cyl("#c9a13a", sx + s * 0.7, 1.55, sz, 0.01, 0.8, 0.01, { anim: "scales", seg: 3 });
    r.cyl("#c9a13a", sx + s * 0.7, 1.18, sz, 0.28, 0.05, 0.22, { anim: "scales", seg: 10 });
  }
  for (let i = 0; i < 6; i++) r.ball("#d23c3c", sx - 0.7 + ((i % 3) - 1) * 0.12, 1.28 + Math.floor(i / 3) * 0.1, sz + ((i % 2) - 0.5) * 0.1, 0.07, 0.07, 0.07, { anim: "scales" });
  r.ball("#e67e22", sx + 0.7, 1.33, sz, 0.18, 0.14, 0.18, { anim: "scales" });
  // A price board on the wall by the door.
  r.box("#3f3a33", -5.5, 2.2, 5.5 - 0.05, 1.6, 1.1, 0.06, { side: "s" });
  // Hanging lanterns.
  for (const [x, z] of [[-3, 1.5], [3, 1.5]]) {
    r.cyl("#3f3a33", x, 4.2, z, 0.015, 1.4, 0.015, { seg: 3 });
    r.box("#3f3a33", x, 3.4, z, 0.3, 0.4, 0.3);
    r.flame(x, 3.3, z, 1.3);
    r.light(x, 3.2, z, "#ffc977", 5, 9);
  }
  r.light(0, 4.3, 2.5, "#ffe8c2", 8, 16);

  return r.finish(
    "market",
    "the Market Hall",
    { villager: "pip", x: -2.1, z: 1.6, face: 0.6 },
    {
      id: "scales",
      label: "the apples",
      verb: "Weigh",
      x: sx,
      z: sz,
      r: 0.65,
      floor: 0,
      anim: "scales",
      lines: [
        "Six apples balance one pumpkin. Crier Pip chalks it on the price board!",
        "Pip: \"Two pumpkins? That's twelve apples, fair and square!\"",
        "The scales wobble… and settle. Perfectly even.",
      ],
    },
    WARM,
  );
}

/* ------------------------------------------------------------------ the library */

/** A bookcase against a wall, full of books of every height and colour. */
function bookcase(r: Room, x: number, z: number, len: number, alongX: boolean, face: 1 | -1, side: WallSide, seed: number, h = 4.4): void {
  const depth = 0.7;
  const cx = alongX ? x : x + (face * depth) / 2;
  const cz = alongX ? z + (face * depth) / 2 : z;
  const sx = alongX ? len : depth;
  const sz = alongX ? depth : len;
  // The carcass: back, sides, top and five shelves.
  r.box("#5b3f28", alongX ? cx : x + face * 0.04, h / 2, alongX ? z + face * 0.04 : cz, alongX ? len : 0.08, h, alongX ? 0.08 : len, { side });
  r.box("#6b4a30", cx, h, cz, sx + 0.1, 0.12, sz + 0.1, { side });
  const shelves = 5;
  const books = ["#8e2f2f", "#2f5d8e", "#3f7a3a", "#b8862a", "#6f4a8a", "#2b2b2b", "#a0522d", "#d4c9a8", "#1f6f6f"];
  for (let k = 0; k < shelves; k++) {
    const y = 0.15 + k * (h / shelves);
    r.box("#6b4a30", cx, y, cz, sx, 0.08, sz, { side });
    let t = 0.1;
    let i = 0;
    while (t < len - 0.2) {
      const w = 0.11 + hash(seed + k * 31, i) * 0.12;
      const bh = 0.45 + hash(seed + k * 17, i + 100) * 0.3;
      if (hash(seed, k * 50 + i) < 0.07) {
        t += 0.25; // a gap on the shelf
        i++;
        continue;
      }
      const along = -len / 2 + t + w / 2;
      const col = books[Math.floor(hash(seed + i, k) * books.length)];
      const lean = hash(i, seed + k) < 0.08 ? 0.18 : 0;
      if (alongX) r.box(col, x + along, y + 0.04 + bh / 2, z + face * (depth * 0.55), w, bh, depth * 0.72, { side, rz: lean });
      else r.box(col, x + face * (depth * 0.55), y + 0.04 + bh / 2, z + along, depth * 0.72, bh, w, { side, rx: lean });
      t += w + 0.01;
      i++;
    }
  }
  for (const e of [-1, 1]) {
    if (alongX) r.box("#5b3f28", x + (e * len) / 2, h / 2, cz, 0.1, h, depth, { side });
    else r.box("#5b3f28", cx, h / 2, z + (e * len) / 2, depth, h, 0.1, { side });
  }
  r.solid(cx, cz, sx / 2, sz / 2, h);
}

function library(): RoomPlan {
  const r = new Room(12, 12, 6);
  r.shell({ wall: "#e2d5bb", trim: "#5b3f28", floor: "#7a4f30", floor2: "#8a5a36", boards: true });
  // Panelling below the dado rail.
  for (const s of [-1, 1]) r.box("#7a5436", s * 5.98, 1.1, 0, 0.06, 1.6, 12, { side: s < 0 ? "w" : "e" });
  bookcase(r, -6, -1.5, 8.2, false, 1, "w", 11);
  bookcase(r, 6, 2.3, 3.8, false, -1, "e", 23);
  bookcase(r, -2.3, -6, 7.2, true, 1, "n", 37);
  // A rolling ladder against the west cases.
  for (const dz of [-0.35, 0.35]) r.box("#8b6a42", -5.05, 2.3, -0.5 + dz, 0.08, 4.8, 0.08, { rz: -0.14, side: "w" });
  for (let i = 0; i < 9; i++) r.box("#8b6a42", -5.3 + i * 0.07, 0.4 + i * 0.5, -0.5, 0.06, 0.06, 0.7, { side: "w" });
  // The reading nook, in the north-east corner: a bay window, a cushioned seat under it, a rug,
  // an armchair and a lamp.
  r.window("n", 3.3, 2.9, 2.6, 2.2, "#f4e7c4");
  r.box("#6b4a30", 3.3, 0.45, -5.45, 3.4, 0.9, 1.1);
  r.box("#9e2b2b", 3.3, 1.0, -5.4, 3.2, 0.2, 0.95);
  for (const [dx, c] of [[-1.1, "#e8b33a"], [0.0, "#3f6fd6"], [1.1, "#e8b33a"]] as const) r.box(c, 3.3 + dx, 1.35, -5.72, 0.7, 0.55, 0.22, { rx: -0.2 });
  r.solid(3.3, -5.45, 1.7, 0.55, 1.1);
  r.cyl("#6f5a8a", 3.3, 0.02, -3.2, 1.9, 0.02, 1.9, { seg: 16 });
  r.cyl("#d4a843", 3.3, 0.015, -3.2, 2.0, 0.01, 2.0, { seg: 16 });
  // An armchair facing the window.
  r.box("#2f5d8e", 4.9, 0.55, -2.6, 1.1, 0.4, 1.1);
  r.box("#2f5d8e", 4.9, 1.2, -2.05, 1.1, 1.0, 0.25);
  for (const e of [-1, 1]) r.box("#284f78", 4.9 + e * 0.55, 0.85, -2.6, 0.2, 0.6, 1.1);
  r.solid(4.9, -2.5, 0.65, 0.65, 1.1);
  r.cyl("#3f3a33", 1.6, 1.0, -5.0, 0.04, 2.0, 0.18, { seg: 6 });
  r.cone("#e8cf8a", 1.6, 2.1, -5.0, 0.35, 0.35, { seg: 8 });
  r.gem("#fff1c2", 1.6, 1.95, -5.0, 0.12, { glow: true });
  r.solidRound(1.6, -5.0, 0.25, 2.0);
  r.light(3.0, 2.4, -4.2, "#ffd58c", 6, 8);
  // A globe on a stand.
  r.cyl("#6b4a30", -3.4, 0.45, 2.8, 0.06, 0.9, 0.25, { seg: 6 });
  r.ball("#3f7ab0", -3.4, 1.2, 2.8, 0.38, 0.38, 0.38, { rz: 0.4 });
  r.gem("#6fb04a", -3.25, 1.3, 2.62, 0.16);
  r.solidRound(-3.4, 2.8, 0.4, 1.6);
  // The lectern with the great book open on it — the thing to read.
  const lx = 0.2;
  const lz = -1.2;
  r.cyl("#6b4a30", lx, 0.55, lz, 0.12, 1.1, 0.3, { seg: 6 });
  r.box("#7c5c38", lx, 1.2, lz, 1.1, 0.08, 0.8, { rx: 0.35 });
  r.box("#f3ead2", lx - 0.26, 1.29, lz, 0.5, 0.06, 0.66, { rx: 0.35, rz: 0.05 });
  r.box("#f3ead2", lx + 0.26, 1.29, lz, 0.5, 0.06, 0.66, { rx: 0.35, rz: -0.05 });
  r.box("#8e2f2f", lx, 1.25, lz, 1.08, 0.04, 0.72, { rx: 0.35 });
  r.anim("page", "flip", lx, 1.33, lz);
  r.box("#fbf5e4", lx - 0.24, 1.33, lz, 0.46, 0.015, 0.62, { rx: 0.35, anim: "page" });
  r.solidRound(lx, lz, 0.45, 1.3);
  r.cyl("#f8f3e6", lx + 0.75, 1.1, lz + 0.1, 0.05, 0.25, 0.05, { seg: 6 });
  r.cyl("#6b4a30", lx + 0.75, 0.5, lz + 0.1, 0.04, 1.0, 0.15, { seg: 6 });
  r.flame(lx + 0.75, 1.24, lz + 0.1, 1.1);
  r.light(0, 4.5, 1.5, "#ffe2b0", 9, 15);

  return r.finish(
    "library",
    "the Library",
    { villager: "hesper", x: -1.6, z: -0.4, face: 0.5 },
    {
      id: "book",
      label: "the great book",
      verb: "Read",
      x: lx,
      z: lz,
      r: 0.5,
      floor: 0,
      anim: "page",
      lines: [
        "\"Once the whole realm was mist, until the first villager lit a lamp…\" You read to the end of the page.",
        "A riddle in the margin: \"What has keys but opens no locks?\" Hesper whispers: \"A piano!\"",
        "This chapter is about a dragon who only wanted someone to read to it.",
      ],
    },
    { ...WARM, sunIntensity: 1.3 },
  );
}

/* ------------------------------------------------------------------ the watchtower */

/** Where the watchtower's lookout floor is. The stair climbs to exactly this. */
export const LOOKOUT_Y = 4;

function watchtower(): RoomPlan {
  const r = new Room(10, 10, 10);
  r.shell({ wall: "#bdb5a1", trim: "#8e8578", floor: "#8a6a44", floor2: "#9c7a50", boards: true, outside: "#e6f1d6" });
  // Stone courses, so the tower's walls read as masonry.
  for (let y = 1.3; y < 10; y += 1.3) {
    r.box("#a9a18d", 0, y, -5 + 0.02, 10, 0.08, 0.04, { side: "n" });
    for (const s of [-1, 1]) r.box("#a9a18d", s * 4.98, y, 0, 0.04, 0.08, 10, { side: s < 0 ? "w" : "e" });
  }
  // The stair up the west wall, north to the lookout.
  const steps = LOOKOUT_Y / 0.25;
  // It starts a stride in from the south wall, so there is floor to step onto it from.
  r.stairs({ x: -4.2, z: 3.5, along: "-z", steps, tread: 4.7 / steps, rise: 0.25, width: 1.6, color: "#8e8578", edge: "#6b6356" });
  // The lookout floor across the north of the tower, on beams and posts.
  const pz0 = -5;
  const pz1 = -1.2;
  const pzc = (pz0 + pz1) / 2;
  r.box("#7c5c38", 0, LOOKOUT_Y - 0.15, pzc, 10, 0.3, pz1 - pz0);
  r.box("#6b4a30", 0, LOOKOUT_Y - 0.4, pz1 - 0.15, 10, 0.3, 0.3);
  r.solid(0, pzc, 5, (pz1 - pz0) / 2, LOOKOUT_Y, LOOKOUT_Y - 0.3);
  for (const x of [-1.2, 2.2, 4.6]) {
    r.box("#6b4a30", x, (LOOKOUT_Y - 0.3) / 2, pz1 - 0.2, 0.3, LOOKOUT_Y - 0.3, 0.3);
    r.solid(x, pz1 - 0.2, 0.18, 0.18, LOOKOUT_Y - 0.3);
  }
  // Its rail, open where the stair arrives — and a stride wider than the stair, so a child
  // coming up it a little off-centre is not caught on the rail's end.
  r.rail({ x0: -2.6, x1: 5, z0: pz1, z1: pz1, floor: LOOKOUT_Y, color: "#6b4a30" });
  // A banister up the open side of the stair.
  for (let i = 0; i < 4; i++) r.box("#6b4a30", -3.35, 0.55 + i * 0.85 + 0.55, 3.2 - i * 1.05, 0.08, 1.1, 0.08);
  // The great north window at lookout height, the sky in it, and the telescope on its tripod.
  r.box("#cfe6f5", 0, 7.1, -5 + 0.03, 4.4, 2.8, 0.04, { glow: true, side: "n" });
  r.box("#9ec8e8", 0, 6.25, -5 + 0.04, 4.4, 1.0, 0.04, { glow: true, side: "n" });
  r.box("#6fb04a", 0, 5.95, -5 + 0.05, 4.4, 0.4, 0.04, { glow: true, side: "n" });
  r.box("#8e8578", 0, 5.65, -4.85, 4.8, 0.2, 0.4, { side: "n" });
  for (const s of [-1, 0, 1]) r.box("#6b4a30", s * 1.47, 7.1, -4.97, 0.12, 2.8, 0.1, { side: "n" });
  const tx = 1.6;
  const tz = -3.5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    r.box("#5b3f28", tx + Math.sin(a) * 0.3, LOOKOUT_Y + 0.6, tz + Math.cos(a) * 0.3, 0.06, 1.25, 0.06, { rx: Math.cos(a) * 0.25, rz: -Math.sin(a) * 0.25 });
  }
  r.anim("scope", "tilt", tx, LOOKOUT_Y + 1.35, tz);
  r.cyl("#b38a2a", tx, LOOKOUT_Y + 1.35, tz - 0.2, 0.09, 1.3, 0.14, { rx: -Math.PI / 2 + 0.25, anim: "scope", seg: 10 });
  r.cyl("#6b4a30", tx, LOOKOUT_Y + 1.35, tz + 0.35, 0.16, 0.2, 0.16, { rx: -Math.PI / 2 + 0.25, anim: "scope", seg: 10 });
  r.solidRound(tx, tz, 0.4, LOOKOUT_Y + 1.5, LOOKOUT_Y);
  // Arrow slits up the other walls.
  for (const [side, along] of [["e", -2.5], ["e", 2.5], ["w", -2.5]] as const) r.window(side, along, 6.8, 0.3, 1.6, "#cfe6f5", "#8e8578");
  // Downstairs: a map table, a brazier, a rack of spears, barrels.
  r.box("#7c5c38", 2.9, 1.0, 2.0, 2.0, 0.12, 1.4);
  for (const [dx, dz] of [[-0.85, -0.55], [0.85, -0.55], [-0.85, 0.55], [0.85, 0.55]]) r.box("#5b3f28", 2.9 + dx, 0.5, 2.0 + dz, 0.12, 1.0, 0.12);
  r.box("#e8dcb6", 2.9, 1.07, 2.0, 1.7, 0.02, 1.15);
  r.box("#6fb04a", 2.6, 1.085, 1.8, 0.7, 0.01, 0.5).box("#4f86c6", 3.3, 1.085, 2.3, 0.5, 0.01, 0.4).box("#9c7a50", 2.8, 1.09, 2.35, 0.3, 0.01, 0.2);
  r.solid(2.9, 2.0, 1.0, 0.7, 1.06);
  r.cyl("#3f3a33", 3.8, 0.4, -0.2, 0.5, 0.35, 0.3, { seg: 8 });
  r.cyl("#3f3a33", 3.8, 0.12, -0.2, 0.08, 0.24, 0.08, { seg: 5 });
  r.anim("fire", "flicker", 3.8, 0.6, -0.2);
  r.cone("#ff8a3d", 3.8, 0.85, -0.2, 0.36, 0.7, { glow: true, anim: "fire", seg: 7 });
  r.cone("#ffd36b", 3.8, 0.8, -0.2, 0.2, 0.45, { glow: true, anim: "fire", seg: 6 });
  r.solidRound(3.8, -0.2, 0.52, 0.6);
  r.light(3.8, 1.4, -0.2, "#ff9a4d", 8, 10);
  for (let i = 0; i < 4; i++) r.box("#8b6a42", 4.75, 1.4, -2.9 + i * 0.35, 0.05, 2.8, 0.05, { side: "e" });
  for (let i = 0; i < 4; i++) r.cone("#9aa3a8", 4.75, 2.9, -2.9 + i * 0.35, 0.06, 0.25, { seg: 4, side: "e" });
  r.solid(4.7, -2.4, 0.3, 0.8, 2.8);
  r.light(0, 8, 0, "#ffe8c2", 10, 20);

  return r.finish(
    "watchtower",
    "the Watchtower",
    { villager: "gerd", x: 1.0, z: 0.4, face: 0.3 },
    {
      id: "telescope",
      label: "the telescope",
      verb: "Look through",
      x: tx,
      z: tz,
      r: 0.4,
      floor: LOOKOUT_Y,
      anim: "scope",
      lines: [
        "Through the telescope you can see all the way to Cloudfoot — and the smoke from {hero}'s own chimneys.",
        "Mason Gerd calls up: \"Spot anything? Wolves? Weather? Wizards?\"",
        "Far out at sea, a little sail. Somebody is coming to visit.",
      ],
    },
    { ...WARM, background: "#171310", sunDir: [0.2, 1, -0.6] },
    { dist: 13.5, pitch: 0.78 },
  );
}

/* ------------------------------------------------------------------ the garden's glasshouse */

function garden(): RoomPlan {
  const r = new Room(12, 10, 5);
  const W = 12;
  const D = 10;
  // A glasshouse: a brick knee wall, and glass above it in white frames. The shell's plaster
  // walls are the brick; the glass goes on over them.
  r.shell({ wall: "#b86b4b", trim: "#f2efe6", floor: "#8a7a62", floor2: "#9c8c72", boards: false, outside: "#e8f5d0", stub: 1.3, glassAbove: true });
  const pane = (side: WallSide, along: number, w: number) => {
    const y = 1.3 + (5 - 1.3) / 2;
    const h = 5 - 1.3 - 0.1;
    if (side === "n") r.box("#d6f0f0", along, y, -D / 2 - 0.02, w, h, 0.03, { glass: true, side });
    else r.box("#d6f0f0", side === "w" ? -W / 2 - 0.02 : W / 2 + 0.02, y, along, 0.03, h, w, { glass: true, side });
  };
  for (let i = 0; i < 6; i++) pane("n", -5 + i * 2, 1.9);
  for (const x of [-4.5, 4.5]) r.box("#d6f0f0", x, 1.3 + (5 - 1.3) / 2, D / 2 + 0.02, 2.9, 5 - 1.3 - 0.1, 0.03, { glass: true, side: "s" });
  for (let i = 0; i < 5; i++) {
    pane("e", -4 + i * 2, 1.9);
    pane("w", -4 + i * 2, 1.9);
  }
  // White glazing bars, and a ridge overhead so it reads as a glasshouse and not a yard.
  for (let i = 0; i <= 6; i++) r.box("#f2efe6", -6 + i * 2, 3.2, -D / 2 + 0.02, 0.1, 3.8, 0.1, { side: "n" });
  for (let i = 0; i <= 5; i++) for (const s of [-1, 1]) r.box("#f2efe6", s * (W / 2 - 0.02), 3.2, -5 + i * 2, 0.1, 3.8, 0.1, { side: s < 0 ? "w" : "e" });
  // The roof's ridge and rafters: over the room, so they go with whichever wall the camera is
  // looking in over (they would otherwise cross the whole picture).
  r.box("#f2efe6", 0, 5.9, 0, 0.18, 0.18, D + 1, { side: "s" });
  for (let i = 0; i <= 5; i++) for (const s of [-1, 1]) r.box("#f2efe6", s * 3.05, 5.45, -5 + i * 2, 6.2, 0.08, 0.08, { rz: s * 0.29, side: i >= 3 ? "s" : "n" });
  // Beds of soil down both sides, planted.
  for (const s of [-1, 1]) {
    const x = s * 4.6;
    r.box("#6b4a30", x, 0.3, 0.3, 1.9, 0.6, 7.2);
    r.box("#4a3322", x, 0.62, 0.3, 1.7, 0.04, 7.0);
    r.solid(x, 0.3, 0.95, 3.6, 0.62);
    for (let i = 0; i < 12; i++) {
      const px = x + (hash(i, s + 3) - 0.5) * 1.3;
      const pz = -3 + (i / 11) * 6.6;
      if (i % 3 === 0) {
        r.cyl("#4a7a2a", px, 0.95, pz, 0.03, 0.6, 0.03, { seg: 4 });
        r.gem(["#ec4899", "#e8b33a", "#9b59b6", "#f5f1e6"][i % 4], px, 1.3, pz, 0.14);
      } else r.gem(i % 2 ? "#57ab3a" : "#3f8f2c", px, 0.85, pz, 0.24 + hash(i, s) * 0.12);
    }
  }
  // The potting bench along the north wall, with pots of seedlings.
  r.box("#8b6a42", -1.2, 1.0, -4.4, 5.6, 0.12, 0.9);
  for (const dx of [-2.6, 0, 2.6]) for (const dz of [-0.35, 0.35]) r.box("#6b4a30", -1.2 + dx, 0.5, -4.4 + dz, 0.12, 1.0, 0.12);
  r.solid(-1.2, -4.4, 2.8, 0.45, 1.06);
  for (let i = 0; i < 7; i++) {
    const x = -3.6 + i * 0.8;
    r.cyl("#c46a3c", x, 1.22, -4.4, 0.2, 0.3, 0.15, { seg: 8 });
    r.gem(i % 2 ? "#6fb04a" : "#57ab3a", x, 1.45, -4.4, 0.15 + hash(i, 9) * 0.1);
  }
  // A watering can and a little pond with lily pads.
  r.cyl("#7f9aa8", -2.6, 0.3, 3.0, 0.26, 0.6, 0.3, { seg: 10 });
  r.box("#7f9aa8", -2.2, 0.45, 3.0, 0.5, 0.08, 0.08, { rz: 0.6 });
  r.cyl("#8e8578", 1.9, 0.12, 2.6, 1.15, 0.24, 1.2, { seg: 14 });
  r.cyl("#4f86c6", 1.9, 0.25, 2.6, 1.0, 0.02, 1.0, { seg: 14 });
  for (let i = 0; i < 3; i++) r.cyl("#4fa84f", 1.6 + i * 0.35, 0.27, 2.4 + (i % 2) * 0.4, 0.18, 0.02, 0.18, { seg: 7 });
  r.solidRound(1.9, 2.6, 1.15, 0.24);
  // Hanging baskets.
  for (const x of [-2.5, 2.5]) {
    r.cyl("#f2efe6", x, 5.2, -1, 0.01, 1.2, 0.01, { seg: 3 });
    r.cyl("#8b6a42", x, 4.5, -1, 0.35, 0.3, 0.2, { seg: 8 });
    r.gem("#57ab3a", x, 4.72, -1, 0.35);
    r.gem("#ec4899", x + 0.2, 4.8, -0.85, 0.1);
  }
  // The beehive — a straw skep on a stand — and its bees.
  const hx = 3.2;
  const hz = -3.4;
  r.box("#6b4a30", hx, 0.45, hz, 0.9, 0.9, 0.9);
  for (let i = 0; i < 5; i++) r.cyl("#d9a441", hx, 1.05 + i * 0.22, hz, 0.52 - i * 0.09, 0.22, 0.56 - i * 0.09, { seg: 10 });
  r.cyl("#3f3a33", hx, 1.05, hz + 0.47, 0.07, 0.08, 0.07, { rx: Math.PI / 2, seg: 6 });
  r.solid(hx, hz, 0.5, 0.5, 2.0);
  r.anim("bees", "orbit", hx, 1.7, hz);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rad = 0.75 + hash(i, 1) * 0.4;
    r.ball("#f1c40f", hx + Math.sin(a) * rad, 1.7 + (hash(i, 2) - 0.5) * 0.7, hz + Math.cos(a) * rad, 0.07, 0.06, 0.09, { anim: "bees" });
  }
  r.light(0, 4.5, 0, "#fff6dc", 10, 16);

  return r.finish(
    "garden",
    "the Glasshouse",
    { villager: "ivy", x: -1.4, z: -1.5, face: 0.5 },
    {
      id: "hive",
      label: "the bees",
      verb: "Listen to",
      x: hx,
      z: hz,
      r: 0.5,
      floor: 0,
      anim: "bees",
      lines: [
        "Bzzzz. The bees are busy making honey for the whole village.",
        "Keeper Ivy whispers: \"They're counting flowers. Bees are very good at maths.\"",
        "One bee lands on your sleeve, has a think, and buzzes off again.",
      ],
    },
    { ...WARM, sky: "#f4fff0", sunIntensity: 2.0, hemi: 1.1, sunDir: [0.3, 1, 0.3] },
  );
}

/* ------------------------------------------------------------------ the castle: the great hall */

/** The gallery the hall's stair climbs to. */
export const GALLERY_Y = 4.5;

function castle(colors: RoomColors): RoomPlan {
  const W = 16;
  const D = 26;
  const H = 11;
  const r = new Room(W, D, H);
  r.shell({ wall: "#b9b1a0", trim: "#8e8578", floor: "#857e70", floor2: "#958d7e", boards: false, outside: "#e8f3d4" });
  for (let y = 1.6; y < H; y += 1.6) {
    r.box("#a79f8d", 0, y, -D / 2 + 0.02, W, 0.1, 0.04, { side: "n" });
    for (const s of [-1, 1]) r.box("#a79f8d", s * (W / 2 - 0.02), y, 0, 0.04, 0.1, D, { side: s < 0 ? "w" : "e" });
  }
  // The red carpet, from the door to the foot of the dais, edged in gold.
  r.box("#d4a843", 0, 0.02, 1.6, 2.7, 0.02, 20.6);
  r.box("#9b1d2a", 0, 0.03, 1.6, 2.4, 0.02, 20.4);
  // Two rows of pillars down the hall.
  for (const z of [7.5, 2.5, -2.5, -7.0]) {
    for (const s of [-1, 1]) {
      const x = s * 4.6;
      r.cyl("#c9c1b0", x, H / 2, z, 0.5, H, 0.55, { seg: 10 });
      r.box("#a79f8d", x, 0.25, z, 1.4, 0.5, 1.4);
      r.box("#a79f8d", x, H - 0.3, z, 1.3, 0.6, 1.3);
      r.solidRound(x, z, 0.7, H);
    }
  }
  // The dais: three steps up to the throne.
  for (let i = 0; i < 3; i++) {
    const top = (i + 1) * 0.25;
    const z0 = -9.3 - i * 0.6;
    const z1 = -D / 2;
    r.box(i === 2 ? "#9b1d2a" : "#a79f8d", 0, top / 2, (z0 + z1) / 2, 8 - i * 0.8, top, z0 - z1);
    r.solid(0, (z0 + z1) / 2, (8 - i * 0.8) / 2, (z0 - z1) / 2, top);
  }
  // The throne: gold, red and tall, with a crown carved on its back.
  const tz = -11.6;
  const ty = 0.75;
  r.box("#c9a13a", 0, ty + 0.45, tz, 1.8, 0.9, 1.5);
  r.box("#9b1d2a", 0, ty + 0.95, tz + 0.05, 1.5, 0.14, 1.3);
  r.box("#c9a13a", 0, ty + 2.4, tz - 0.62, 1.8, 3.0, 0.3);
  r.box("#9b1d2a", 0, ty + 2.2, tz - 0.46, 1.3, 2.3, 0.04);
  for (const s of [-1, 1]) {
    r.box("#c9a13a", s * 0.95, ty + 1.3, tz + 0.1, 0.25, 0.9, 1.3);
    r.gem("#e8c24a", s * 0.95, ty + 1.85, tz + 0.7, 0.18);
    r.cone("#e8c24a", s * 0.72, ty + 4.1, tz - 0.62, 0.14, 0.5, { seg: 4 });
  }
  r.cone("#e8c24a", 0, ty + 4.25, tz - 0.62, 0.2, 0.7, { seg: 4 });
  r.gem("#d64545", 0, ty + 3.5, tz - 0.44, 0.2);
  r.solid(0, tz - 0.1, 1.0, 0.85, ty + 1.0);
  r.solid(0, tz - 0.62, 0.95, 0.2, ty + 3.9);
  // The crown that rises over the throne when the child takes it.
  r.anim("crown", "rise", 0, ty + 5.0, tz - 0.2);
  r.cyl("#f4d27a", 0, ty + 5.0, tz - 0.2, 0.5, 0.35, 0.45, { anim: "crown", seg: 10, glow: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    r.cone("#f4d27a", Math.sin(a) * 0.45, ty + 5.35, tz - 0.2 + Math.cos(a) * 0.45, 0.1, 0.35, { anim: "crown", seg: 4, glow: true });
  }
  // Braziers either side of the dais.
  for (const s of [-1, 1]) {
    const x = s * 3.2;
    const z = -8.6;
    r.cyl("#3f3a33", x, 0.8, z, 0.12, 1.6, 0.3, { seg: 6 });
    r.cyl("#3f3a33", x, 1.7, z, 0.55, 0.35, 0.35, { seg: 8 });
    r.anim(`brazier${s}`, "flicker", x, 1.9, z);
    r.cone("#ff8a3d", x, 2.2, z, 0.42, 0.8, { glow: true, anim: `brazier${s}`, seg: 7 });
    r.cone("#ffd36b", x, 2.1, z, 0.24, 0.5, { glow: true, anim: `brazier${s}`, seg: 6 });
    r.solidRound(x, z, 0.5, 1.9);
    r.light(x, 2.8, z, "#ff9a4d", 9, 12);
  }
  // The child's banners: long ones on the side walls, two great ones behind the throne. Their
  // field is the child's own colour and the device on them is the child's second colour.
  const banner = (x: number, z: number, side: WallSide, len: number, y: number) => {
    const alongX = side === "n";
    const fx = alongX ? 0 : side === "w" ? 1 : -1;
    const fz = alongX ? 1 : 0;
    const off = 0.12;
    const bx = x + fx * off;
    const bz = z + fz * off;
    r.box("#c9a13a", bx + fx * 0.05, y + len / 2 + 0.1, bz + fz * 0.05, alongX ? 2.0 : 0.1, 0.1, alongX ? 0.1 : 2.0, { side });
    r.box(colors.field, bx, y, bz, alongX ? 1.7 : 0.05, len, alongX ? 0.05 : 1.7, { side });
    r.box("#d4a843", bx + fx * 0.01, y - len / 2 + 0.15, bz + fz * 0.01, alongX ? 1.72 : 0.06, 0.18, alongX ? 0.06 : 1.72, { side });
    r.box(colors.charge, bx + fx * 0.03, y + 0.2, bz + fz * 0.03, alongX ? 0.8 : 0.05, 0.8, alongX ? 0.05 : 0.8, { side, ...(alongX ? { rz: Math.PI / 4 } : { rx: Math.PI / 4 }) });
    r.box(colors.charge, bx + fx * 0.03, y - len * 0.28, bz + fz * 0.03, alongX ? 1.2 : 0.05, 0.14, alongX ? 0.05 : 1.2, { side });
    // A swallowtail: two points at the bottom.
    for (const t of [-1, 1]) {
      const px = alongX ? bx + t * 0.45 : bx;
      const pz = alongX ? bz : bz + t * 0.45;
      r.cone(colors.field, px, y - len / 2 - 0.25, pz, 0.42, 0.5, { rx: Math.PI, seg: 3, side, ry: alongX ? 0 : Math.PI / 2 });
    }
  };
  for (const z of [6, 0, -5.5]) {
    banner(W / 2, z, "e", 4.2, 7.6);
    banner(-W / 2, z, "w", 4.2, 7.9);
  }
  for (const x of [-2.6, 2.6]) banner(x, -D / 2, "n", 5.5, 6.4);
  // A rose window high over it all.
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (i * i + j * j > 10) continue;
      r.box((i + j) % 2 ? colors.field : "#f4e7c4", i * 0.42, 9.2 + j * 0.42, -D / 2 + 0.03, 0.38, 0.38, 0.04, { glow: true, side: "n" });
    }
  }
  // Tall windows down the east wall; a fireplace between them.
  for (const z of [8, -3.5]) r.window("e", z, 5.5, 1.3, 3.4, "#e1ecf5", "#8e8578");
  r.box("#8e8578", W / 2 - 0.5, 1.6, 2.3, 1.0, 3.2, 3.6, { side: "e" });
  r.box("#2b2420", W / 2 - 0.95, 1.1, 2.3, 0.2, 1.8, 2.0, { side: "e" });
  r.anim("hearth", "flicker", W / 2 - 1.1, 0.5, 2.3);
  r.cone("#ff8a3d", W / 2 - 1.1, 0.8, 2.3, 0.6, 1.1, { glow: true, anim: "hearth", seg: 7 });
  r.cone("#ffd36b", W / 2 - 1.1, 0.7, 2.3, 0.35, 0.7, { glow: true, anim: "hearth", seg: 6 });
  r.box("#6b4a30", W / 2 - 1.1, 0.15, 2.3, 0.3, 0.3, 1.4);
  r.solid(W / 2 - 0.6, 2.3, 0.6, 1.8, 3.2);
  r.light(W / 2 - 1.8, 1.5, 2.3, "#ff9a4d", 9, 11);
  // A long feast table on the east side of the carpet, with benches and a feast on it.
  const fx = 2.6;
  r.box("#7c5c38", fx, 1.0, 0.5, 1.5, 0.14, 9.0);
  for (const dz of [-4, 0, 4]) for (const s of [-1, 1]) r.box("#5b3f28", fx + s * 0.55, 0.5, 0.5 + dz, 0.14, 1.0, 0.14);
  r.solid(fx, 0.5, 0.76, 4.5, 1.07);
  r.box("#6b4a30", fx + 1.1, 0.55, 0.5, 0.45, 0.1, 8.6);
  r.solid(fx + 1.1, 0.5, 0.25, 4.3, 0.6);
  for (let i = 0; i < 8; i++) {
    const z = -3.2 + i * 1.05;
    r.cyl("#e8e2d2", fx + (i % 2 ? 0.35 : -0.35), 1.09, z, 0.24, 0.03, 0.2, { seg: 10 });
    r.cyl("#c9a13a", fx + (i % 2 ? -0.35 : 0.35), 1.2, z, 0.07, 0.24, 0.05, { seg: 6 });
  }
  r.ball("#8a4a22", fx, 1.28, 0.5, 0.42, 0.26, 0.34);
  r.ball("#d9a441", fx, 1.2, -2.2, 0.3, 0.16, 0.2).ball("#d9a441", fx, 1.2, 3.2, 0.3, 0.16, 0.2);
  for (let i = 0; i < 5; i++) r.ball(i % 2 ? "#d23c3c" : "#6fb04a", fx - 0.15 + (i % 2) * 0.3, 1.2, 1.6 + i * 0.12, 0.1);
  // Chandeliers of candles, hung high.
  // One, high and near the door: anywhere up the hall it hangs between the camera and the throne.
  const CH = 9.4;
  for (const z of [8.0]) {
    r.cyl("#2b2420", 0, (H + CH) / 2, z, 0.03, H - CH, 0.03, { seg: 4 });
    r.cyl("#2b2420", 0, CH, z, 1.5, 0.12, 1.5, { seg: 16 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      r.cyl("#f8f3e6", Math.sin(a) * 1.45, CH + 0.2, z + Math.cos(a) * 1.45, 0.05, 0.3, 0.05, { seg: 5 });
      r.flame(Math.sin(a) * 1.45, CH + 0.36, z + Math.cos(a) * 1.45, 1.2);
    }
    r.light(0, CH - 0.6, z, "#ffd58c", 16, 18);
  }
  // The way up: a stair along the west wall to a gallery that runs the length of the hall, with
  // a window at its end to look out of.
  const steps = GALLERY_Y / 0.25;
  const gx0 = -W / 2;
  const gx1 = -5.9;
  const gz0 = -9.5;
  const gz1 = 5.9;
  r.stairs({ x: -7.1, z: 11.4, along: "-z", steps, tread: (11.4 - gz1) / steps, rise: 0.25, width: 1.8, color: "#a79f8d", edge: "#8e8578" });
  r.box("#8e8578", (gx0 + gx1) / 2, GALLERY_Y - 0.2, (gz0 + gz1) / 2, gx1 - gx0, 0.4, gz1 - gz0);
  r.solid((gx0 + gx1) / 2, (gz0 + gz1) / 2, (gx1 - gx0) / 2, (gz1 - gz0) / 2, GALLERY_Y, GALLERY_Y - 0.4);
  for (let z = gz0 + 0.3; z < gz1; z += 1.2) r.box("#7a7366", gx1 - 0.3, GALLERY_Y - 0.6, z, 0.5, 0.4, 0.3); // corbels
  r.rail({ x0: gx1, x1: gx1, z0: gz0, z1: gz1 - 0.1, floor: GALLERY_Y, color: "#6b4a30" });
  r.rail({ x0: gx0, x1: gx1, z0: gz0, z1: gz0, floor: GALLERY_Y, color: "#6b4a30" });
  r.window("w", -7.5, GALLERY_Y + 1.7, 1.6, 2.2, "#dbeaf7", "#8e8578");
  r.light(-6.9, GALLERY_Y + 2.2, -6.8, "#e6efff", 5, 10);
  r.light(0, 7, 9, "#ffe8c2", 10, 20);

  return r.finish(
    "castle",
    "your castle",
    null,
    {
      id: "throne",
      label: "your throne",
      verb: "Sit on",
      x: 0,
      z: tz,
      r: 1.0,
      floor: ty,
      anim: "crown",
      lines: [
        "You take your seat. The great hall rings: \"Long live {hero}!\"",
        "From the throne you can see the whole hall. Every stone of it is yours.",
        "A crown of light rises over the throne. It suits you.",
      ],
    },
    { ...WARM, background: "#15110e", sunIntensity: 1.4, sunDir: [0.7, 0.9, 0.2] },
    { dist: 19, pitch: 0.6 },
  );
}

/* ------------------------------------------------------------------ public */

/**
 * The plan for a room. Built fresh each call and deterministic, so the scene memoises it and a
 * test can compare two calls. `colors` only matters for the castle, whose banners are the
 * child's.
 */
export function roomPlan(kind: RoomKind, colors: RoomColors = DEFAULT_COLORS): RoomPlan {
  switch (kind) {
    case "mill":
      return mill();
    case "bridge":
      return bridge();
    case "chapel":
      return chapel();
    case "market":
      return market();
    case "library":
      return library();
    case "watchtower":
      return watchtower();
    case "garden":
      return garden();
    case "castle":
      return castle(colors);
  }
}

export const ROOM_KINDS: readonly RoomKind[] = ["mill", "bridge", "chapel", "market", "library", "watchtower", "garden", "castle"];

/** The line the village says when the fixture is used for the `n`th time (0-based), with the child's name in it. */
export function fixtureLine(plan: Pick<RoomPlan, "fixture">, n: number, heroName: string): string {
  const lines = plan.fixture.lines;
  return lines[((n % lines.length) + lines.length) % lines.length].replace(/\{hero\}/g, heroName);
}
