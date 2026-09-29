/**
 * THE CHILD'S CASTLE, as a plan: every wall, tower and roof as a shape, and the colliders
 * derived from the same shapes, so what stops the hero is exactly what is drawn.
 *
 * ## Why it is this big
 *
 * The owner: "the castle is too small relative to my player size". It was the layout's footprint
 * — eight by six, six high — for a hero 2.3 tall: a castle a child could look over from the
 * top of a jump. A castle should dwarf the child who owns it. This one has a curtain wall four
 * times their height, drum towers either side of a gate twice their height, and a keep whose
 * tower is ten children tall — the one thing on the skyline from anywhere in the village.
 *
 * ## Why it is this SHAPE
 *
 * The village crowds the castle: the library, the chapel and the watchtower
 * stand either side of the road where it reaches the castle, and the two tracks out to Longwater
 * and Highcairn leave from just beyond its corners. So the castle is narrow where the village
 * is — a gatehouse with two drum towers, facing the road — and grows behind it, north into the
 * fells where nothing stands: a curtain wall with a tower at each corner, and a keep inside.
 *
 * Coordinates are local to `CASTLE_POSITION`, on the ground (the generator levels the whole
 * footprint), with +z the front: south, towards the village. Not a three.js module.
 */

export type CastleShape = "box" | "cyl" | "cone" | "pyramid";
export type CastleColor = "stone" | "stoneLight" | "stoneDark" | "roof" | "wood" | "slate" | "gold" | "window";

export type CastlePart = {
  shape: CastleShape;
  color: CastleColor;
  /** Centre of the shape (for cones and pyramids, the centre of the base is at y - h/2). */
  x: number;
  y: number;
  z: number;
  /** Box: full extents. Cylinder / cone / pyramid: `sx` is the radius, `sy` the height. */
  sx: number;
  sy: number;
  sz: number;
};

/** A collider in the castle's local frame. `top` is above the ground; `base` is 0 or below. */
export type CastleBlock = { x: number; z: number; hw: number; hd: number; round: boolean; base: number; top: number };

export type CastlePlan = {
  parts: CastlePart[];
  solids: CastleBlock[];
  /** Where banners hang: on the outside face of a wall, with the direction that face looks. */
  bannerSpots: { x: number; y: number; z: number; ry: number }[];
  /** The gate, for the interact key: a box just in front of the doors. */
  gate: { x: number; z: number; hw: number; hd: number };
  /** Everything the castle covers, walls and towers and all, for levelling and clearing. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** The tallest point, for anything that must clear it. */
  height: number;
};

/**
 * How grand each tier of castle is. The layout's tiers run from a campsite to a citadel, and
 * a castle only stands at all once the child has unlocked it — so even the first tier is a
 * castle that dwarfs them (walls three times their height, a keep tower seven), and each tier
 * after it grows. Width stays inside what the village leaves (the full plan is already as wide
 * as it can be), so the grandest tiers grow taller rather than wider.
 */
export const CASTLE_TIERS: Record<string, { k: number; tall: number }> = {
  campsite: { k: 0.76, tall: 0.72 },
  cottage: { k: 0.8, tall: 0.78 },
  watchtower: { k: 0.84, tall: 0.85 },
  keep: { k: 0.9, tall: 0.9 },
  manor: { k: 0.95, tall: 0.95 },
  castle: { k: 1, tall: 1 },
  fortress: { k: 1, tall: 1.1 },
  citadel: { k: 1, tall: 1.2 },
};

/** The gate's front face, local z. */
export const GATE_FRONT = 1.2;
/** Where the layout's road ends, local z (its last tile's far edge); flagstones fill the gap. */
export const ROAD_END = 4.2;

export function castlePlan(tier: string): CastlePlan {
  const t = CASTLE_TIERS[tier] ?? CASTLE_TIERS.castle;
  const k = t.k;
  const H = t.tall;
  const parts: CastlePart[] = [];
  const solids: CastleBlock[] = [];
  const bannerSpots: CastlePlan["bannerSpots"] = [];

  const box = (color: CastleColor, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts.push({ shape: "box", color, x, y, z, sx, sy, sz });
  const cyl = (color: CastleColor, x: number, y: number, z: number, r: number, h: number) =>
    parts.push({ shape: "cyl", color, x, y, z, sx: r, sy: h, sz: r });
  const cone = (color: CastleColor, x: number, baseY: number, z: number, r: number, h: number, shape: CastleShape = "cone") =>
    parts.push({ shape, color, x, y: baseY + h / 2, z, sx: r, sy: h, sz: r });
  const block = (list: CastleBlock[], x: number, z: number, hw: number, hd: number, top: number, round = false) =>
    list.push({ x, z, hw, hd, round, base: -2.5, top });

  /* ---- the curtain: a ring of walls, a tower at each corner ---- */
  const cw = 9 * k; // half-width, to the outer face
  // The curtain's south face: clear of the chapel and the watchtower in front of it, at every
  // tier — a smaller castle is narrower and shallower, never nearer the village.
  const front = -4;
  const back = front - 24 * k;
  const wallH = 9.5 * H;
  const thick = 2 * k;
  const midZ = (front + back) / 2;
  const depth = front - back;
  box("stone", 0, wallH / 2, front - thick / 2, cw * 2, wallH, thick); // south
  box("stone", 0, wallH / 2, back + thick / 2, cw * 2, wallH, thick); // north
  box("stone", -cw + thick / 2, wallH / 2, midZ, thick, wallH, depth); // west
  box("stone", cw - thick / 2, wallH / 2, midZ, thick, wallH, depth); // east
  // A wall-walk course, and merlons along every run.
  const walk = 0.35 * H;
  for (const [x, z, sx, sz] of [
    [0, front - thick / 2, cw * 2 + 0.3, thick + 0.3],
    [0, back + thick / 2, cw * 2 + 0.3, thick + 0.3],
    [-cw + thick / 2, midZ, thick + 0.3, depth],
    [cw - thick / 2, midZ, thick + 0.3, depth],
  ] as const) {
    box("stoneLight", x, wallH + walk / 2, z, sx, walk, sz);
  }
  const merlon = (x: number, z: number) => box("stoneLight", x, wallH + walk + 0.45 * H, z, 0.7 * k + 0.2, 0.9 * H, 0.7 * k + 0.2);
  const every = 1.7;
  for (let x = -cw + 1.2; x <= cw - 1.2 + 1e-6; x += every) {
    merlon(x, front - 0.2);
    merlon(x, back + 0.2);
  }
  for (let z = front - 1.2; z >= back + 1.2 - 1e-6; z -= every) {
    merlon(-cw + 0.2, z);
    merlon(cw - 0.2, z);
  }
  block(solids, 0, midZ, cw, depth / 2, wallH);

  const towerR = 2.3 * k;
  const towerH = 14 * H;
  for (const x of [-cw, cw]) {
    for (const z of [front, back]) {
      cyl("stoneLight", x, towerH / 2, z, towerR, towerH);
      cyl("stoneDark", x, towerH + 0.2, z, towerR + 0.25, 0.4 * H);
      cone("roof", x, towerH + 0.4 * H, z, towerR + 0.5, 6 * H);
      cone("gold", x, towerH + 6.4 * H, z, 0.12, 0.9 * H);
      block(solids, x, z, towerR, towerR, towerH, true);
      // Arrow slits, a dark stripe up the outward face.
      box("slate", x + Math.sign(x) * (towerR - 0.02), towerH * 0.6, z, 0.12, 1.6 * H, 0.32);
    }
  }

  /* ---- the gatehouse, facing the road, and its two drum towers ---- */
  const gw = 3.2 * Math.min(1, k * 1.15);
  const gateBack = front - thick;
  const gh = 11 * H;
  const gd = GATE_FRONT - gateBack;
  const gz = (GATE_FRONT + gateBack) / 2;
  box("stoneLight", 0, gh / 2, gz, gw * 2, gh, gd);
  box("stone", 0, gh + 0.3 * H, gz, gw * 2 + 0.3, 0.6 * H, gd + 0.3);
  for (let x = -gw + 0.5; x <= gw - 0.5 + 1e-6; x += 1.25) box("stoneLight", x, gh + 0.6 * H + 0.4 * H, GATE_FRONT - 0.2, 0.7, 0.8 * H, 0.7);
  // The doors: two leaves under a round arch, taller than two children.
  const doorW = Math.min(3, gw * 1.1);
  const doorH = Math.max(3.2, 5.2 * H);
  box("wood", 0, doorH / 2, GATE_FRONT + 0.06, doorW, doorH, 0.14);
  box("stoneDark", 0, doorH + 0.25, GATE_FRONT + 0.1, doorW + 0.7, 0.5, 0.22);
  box("gold", -0.35, doorH * 0.45, GATE_FRONT + 0.16, 0.14, 0.14, 0.06);
  box("gold", 0.35, doorH * 0.45, GATE_FRONT + 0.16, 0.14, 0.14, 0.06);
  // Flagstones from the doors out to where the village road ends, so the road reaches the gate.
  box("stoneDark", 0, 0.06, (GATE_FRONT + ROAD_END) / 2, doorW + 1.4, 0.12, ROAD_END - GATE_FRONT);
  // A lit window over the gate.
  box("window", 0, doorH + 2.2 * H, GATE_FRONT + 0.05, 1.1, 1.5 * H, 0.08);
  block(solids, 0, gz, gw, gd / 2, gh);

  const drumR = 1.7 * Math.min(1, k * 1.15);
  const drumX = gw + drumR * 0.3;
  const drumZ = GATE_FRONT - drumR - 0.1;
  const drumH = 14 * H;
  for (const s of [-1, 1]) {
    cyl("stoneLight", s * drumX, drumH / 2, drumZ, drumR, drumH);
    cyl("stoneDark", s * drumX, drumH + 0.2, drumZ, drumR + 0.2, 0.4 * H);
    cone("roof", s * drumX, drumH + 0.4 * H, drumZ, drumR + 0.4, 5 * H);
    cone("gold", s * drumX, drumH + 5.4 * H, drumZ, 0.1, 0.8 * H);
    box("window", s * drumX, drumH * 0.66, drumZ + drumR - 0.03, 0.5, 1.1 * H, 0.08);
    block(solids, s * drumX, drumZ, drumR, drumR, drumH, true);
  }

  /* ---- the keep, inside, and its tower: the castle's silhouette from anywhere ---- */
  const kx = 5 * k;
  const kz0 = front - 7 * k;
  const kz1 = back + 5 * k;
  const keepH = 17 * H;
  const kzc = (kz0 + kz1) / 2;
  const kd = kz0 - kz1;
  box("stoneLight", 0, keepH / 2, kzc, kx * 2, keepH, kd);
  box("stone", 0, keepH + 0.25 * H, kzc, kx * 2 + 0.4, 0.5 * H, kd + 0.4);
  cone("roof", 0, keepH + 0.5 * H, kzc, Math.hypot(kx, kd / 2) + 0.3, 6 * H, "pyramid");
  for (const s of [-1, 1]) box("window", s * kx * 0.5, keepH * 0.72, kz0 + 0.05, 0.9, 1.6 * H, 0.08);
  const ktR = 1.9 * k;
  const ktx = kx - ktR * 0.6;
  const ktz = kz1 + ktR * 0.6;
  const ktH = 24 * H;
  cyl("stoneLight", ktx, ktH / 2, ktz, ktR, ktH);
  cyl("stoneDark", ktx, ktH + 0.2, ktz, ktR + 0.25, 0.4 * H);
  cone("roof", ktx, ktH + 0.4 * H, ktz, ktR + 0.5, 7 * H);
  cone("gold", ktx, ktH + 7.4 * H, ktz, 0.14, 1.2 * H);
  box("window", ktx, ktH * 0.8, ktz + ktR - 0.03, 0.6, 1.3 * H, 0.08);

  /* ---- where the banners hang: the south curtain either side of the gate, then the flanks ---- */
  const bannerY = wallH * 0.72;
  for (const x of [-(gw + drumR * 2 + 0.9), gw + drumR * 2 + 0.9]) bannerSpots.push({ x, y: bannerY, z: front + 0.05, ry: 0 });
  for (const x of [-(cw - towerR - 0.9), cw - towerR - 0.9]) bannerSpots.push({ x, y: bannerY, z: front + 0.05, ry: 0 });
  for (const s of [-1, 1]) {
    for (const z of [midZ + depth * 0.18, midZ - depth * 0.18]) bannerSpots.push({ x: s * (cw + 0.05), y: bannerY, z, ry: (s * Math.PI) / 2 });
  }

  const reach = Math.max(towerR, drumR) + 0.6;
  return {
    parts,
    solids,
    bannerSpots,
    gate: { x: 0, z: GATE_FRONT + 0.4, hw: doorW / 2 + 0.3, hd: 0.4 },
    bounds: { x0: -cw - reach, x1: cw + reach, z0: back - reach, z1: GATE_FRONT + 0.4 },
    height: ktH + 8.6 * H,
  };
}
