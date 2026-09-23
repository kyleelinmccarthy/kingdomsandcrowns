/**
 * A BUILDING GOING UP — what a construction site shows at each stage of its deeds.
 *
 * The owner's words for the old site: "some of the ways the pieces of lumber are placed for
 * buildings being built make no sense." It was four uprights, a beam across the top, two planks
 * leaning at a random angle through the middle and three boards floating a hand above the slab,
 * and it looked the same at one deed as at four.
 *
 * So a site is now built the way a timber house is built, and each deed a child does puts the
 * next stage up:
 *
 *   0. a staked plot: corner stakes and string lines on a levelled pad, a stack of timber and a
 *      pile of dressed stone waiting beside it.
 *   1. the stone footing laid round the plot, with the doorway left open on the front.
 *   2. sill beams on the footing, and the posts standing: corners, door posts, studs between.
 *   3. the top plates tying the posts together, corner braces in the walls, and a scaffold
 *      plank with a ladder up to it on one side.
 *   4. the roof frame: a ridge beam and pairs of rafters, the same pitch the finished roof has.
 *
 * Everything rests on something — the ground, the footing, a sill, a plate, or the layer of the
 * stack beneath it — and every timber is square to the house or lies in one of its walls or its
 * roof. The stack beside the plot shrinks as the frame grows, because that is where the frame
 * came from.
 *
 * Pure data: boxes in the site's own frame (origin on the ground at its middle, +z the front,
 * where the door and the villager are). The scene merges them into one mesh per site. Not a
 * three.js module, so every rule above is tested.
 */

export type PieceKind = "pad" | "stone" | "sill" | "post" | "plate" | "brace" | "rafter" | "ridge" | "board" | "stake" | "line" | "ladder";

export type Piece = {
  kind: PieceKind;
  /** Centre, in the site's frame. */
  x: number;
  y: number;
  z: number;
  /** Size along the piece's own axes before rotation. */
  sx: number;
  sy: number;
  sz: number;
  /** Rotation about x (a brace in a side wall) or z (a brace in a front wall, a rafter). */
  rx: number;
  rz: number;
};

export type SiteBuild = { stage: number; pieces: Piece[] };

/** The number of stages, 0 through 4. A finished site is not a site; it is a building. */
export const SITE_STAGES = 5;

/**
 * Which stage a site is at for its deeds. Any deed at all raises the footing; one deed of five
 * is stage 1 and four of five is the roof frame. A site with fewer deeds steps faster.
 */
export function siteStage(done: number, total: number): number {
  if (!(total > 0) || !(done > 0)) return 0;
  const f = Math.min(1, done / total);
  return Math.min(SITE_STAGES - 1, Math.max(1, Math.ceil(f * (SITE_STAGES - 1) - 1e-9)));
}

const FOOT_H = 0.45;
const FOOT_T = 0.5;
const SILL = 0.24;
const POST = 0.22;
const PLATE = 0.22;
const DOOR_W = 1.5;

function box(kind: PieceKind, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): Piece {
  return { kind, x, y, z, sx, sy, sz, rx, rz };
}

/**
 * The site at `stage`, for a house `w` wide and `d` deep with eaves at `wallH` and a roof that
 * rises `roofH`. `side` is +1 or -1: which side (in x) the timber stack and stone pile go, which
 * should be the side AWAY from the village road so they never spill onto it.
 */
export function buildSite(w: number, d: number, wallH: number, roofH: number, stage: number, side: 1 | -1): SiteBuild {
  const out: Piece[] = [];
  const hw = w / 2;
  const hd = d / 2;

  // The levelled pad: a finger's height of bare earth over the whole plot and a margin.
  out.push(box("pad", 0, 0.03, 0, w + 0.6, 0.06, d + 0.6));
  const top0 = 0.06;

  if (stage === 0) {
    // Corner stakes and the string between them: the house, drawn on the ground.
    const sh = 0.9;
    for (const sxn of [-1, 1]) for (const szn of [-1, 1]) out.push(box("stake", sxn * hw, top0 + sh / 2, szn * hd, 0.1, sh, 0.1));
    const ly = top0 + 0.55;
    out.push(box("line", 0, ly, hd, w, 0.03, 0.03), box("line", 0, ly, -hd, w, 0.03, 0.03));
    out.push(box("line", hw, ly, 0, 0.03, 0.03, d), box("line", -hw, ly, 0, 0.03, 0.03, d));
  }

  // 1. The stone footing, round the edge of the plot, with the doorway left open.
  if (stage >= 1) {
    const y = top0 + FOOT_H / 2;
    out.push(box("stone", 0, y, -hd + FOOT_T / 2, w, FOOT_H, FOOT_T)); // back
    out.push(box("stone", -hw + FOOT_T / 2, y, 0, FOOT_T, FOOT_H, d - FOOT_T * 2)); // left
    out.push(box("stone", hw - FOOT_T / 2, y, 0, FOOT_T, FOOT_H, d - FOOT_T * 2)); // right
    const frontRun = (w - DOOR_W) / 2;
    for (const s of [-1, 1]) out.push(box("stone", s * (DOOR_W / 2 + frontRun / 2), y, hd - FOOT_T / 2, frontRun, FOOT_H, FOOT_T));
  }
  const footTop = top0 + FOOT_H;

  // 2. Sills on the footing, and the posts standing on the sills.
  const postBase = footTop + SILL;
  const postH = wallH - postBase;
  const posts: { x: number; z: number }[] = [];
  if (stage >= 2) {
    const sy = footTop + SILL / 2;
    const inset = FOOT_T / 2;
    out.push(box("sill", 0, sy, -hd + inset, w - 0.1, SILL, SILL));
    out.push(box("sill", -hw + inset, sy, 0, SILL, SILL, d - 0.1));
    out.push(box("sill", hw - inset, sy, 0, SILL, SILL, d - 0.1));
    const frontRun = (w - DOOR_W) / 2;
    for (const s of [-1, 1]) out.push(box("sill", s * (DOOR_W / 2 + frontRun / 2), sy, hd - inset, frontRun, SILL, SILL));

    // Corners, door posts, and studs no more than ~1.5 apart along every wall.
    const px = hw - inset;
    const pz = hd - inset;
    const along = (a: number, b: number, fixed: number, onX: boolean) => {
      const n = Math.max(1, Math.round(Math.abs(b - a) / 1.5));
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        posts.push(onX ? { x: t, z: fixed } : { x: fixed, z: t });
      }
    };
    along(-px, px, -pz, true); // back wall, corners included
    along(-pz, pz, -px, false); // left wall
    along(-pz, pz, px, false); // right wall
    along(-px, -DOOR_W / 2 - POST / 2, pz, true); // front, left of the door
    along(DOOR_W / 2 + POST / 2, px, pz, true); // front, right of the door
    const seen = new Set<string>();
    for (const p of posts) {
      const k = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(box("post", p.x, postBase + postH / 2, p.z, POST, postH, POST));
    }
  }

  // 3. Plates on top of the posts, braces in the corners, a scaffold and a ladder.
  if (stage >= 3) {
    const inset = FOOT_T / 2;
    const py = wallH + PLATE / 2;
    out.push(box("plate", 0, py, -hd + inset, w - 0.1, PLATE, PLATE));
    out.push(box("plate", 0, py, hd - inset, w - 0.1, PLATE, PLATE)); // the front plate spans the doorway: it is the lintel
    out.push(box("plate", -hw + inset, py, 0, PLATE, PLATE, d - 0.1));
    out.push(box("plate", hw - inset, py, 0, PLATE, PLATE, d - 0.1));

    // A brace in each end of the back and side walls, from sill to post, at 45°.
    const run = Math.min(1.3, postH * 0.55);
    const len = Math.hypot(run, run);
    const by = postBase + run / 2;
    const px = hw - inset;
    const pz = hd - inset;
    for (const s of [-1, 1]) {
      // back wall (in the x-y plane): leaning in from each corner
      out.push(box("brace", s * (px - run / 2 - POST / 2), by, -pz, len, 0.14, 0.12, 0, s * Math.PI / 4));
      // side walls (in the z-y plane): leaning in from the back corner
      out.push(box("brace", s * px, by, -pz + run / 2 + POST / 2, 0.12, 0.14, len, Math.PI / 4, 0));
    }

    // Scaffold on the far side from the stack: two trestle legs per end and a plank across.
    const sxs = -side * (hw + 0.55);
    const sh = wallH * 0.55;
    // It stands on the ground just off the pad, so its feet are at 0, not on the pad.
    for (const z of [-hd * 0.6, hd * 0.6]) out.push(box("post", sxs, sh / 2, z, 0.14, sh, 0.14));
    out.push(box("board", sxs, sh + 0.05, 0, 0.5, 0.1, hd * 1.2 + 0.3));
    // ...and a ladder up to it, leaning against the plank's outer edge.
    const lh = sh + 0.2;
    const lean = 0.35;
    out.push(box("ladder", sxs - side * (0.25 + lean / 2), lh / 2, hd * 0.3, 0.08, Math.hypot(lh, lean), 0.5, 0, -side * Math.atan2(lean, lh)));
  }

  // 4. The roof frame: a ridge on posts at each gable end, and rafter pairs down to the plates.
  if (stage >= 4) {
    const ridgeY = wallH + PLATE + roofH - 0.25;
    out.push(box("ridge", 0, ridgeY, 0, 0.22, 0.26, d + 0.2));
    // King posts at each end, standing on the end plates, carrying the ridge.
    const kpH = ridgeY - 0.13 - (wallH + PLATE);
    for (const s of [-1, 1]) out.push(box("post", 0, wallH + PLATE + kpH / 2, s * (hd - FOOT_T / 2), POST, kpH, POST));
    const span = hw - FOOT_T / 2;
    const rise = ridgeY - (wallH + PLATE);
    const rlen = Math.hypot(span, rise) + 0.35;
    const ang = Math.atan2(rise, span);
    const n = Math.max(3, Math.round(d / 1.2));
    for (let i = 0; i <= n; i++) {
      const z = -hd + FOOT_T / 2 + ((d - FOOT_T) * i) / n;
      for (const s of [-1, 1]) {
        out.push(box("rafter", (s * span) / 2, wallH + PLATE + rise / 2, z, rlen, 0.16, 0.12, 0, -s * ang));
      }
    }
  }

  // The stack and the pile, beside the plot on the `side` away from the road. What the frame is
  // made of comes off the stack, so it shrinks as the stages go up; the stone goes into the
  // footing at stage 1, so the pile is nearly gone after it.
  const stackX = side * (hw + 1.05);
  const boardLen = Math.min(d * 0.8, 3.4);
  const layers = Math.max(1, 4 - stage);
  // Bearers across the bottom, so the timber is off the wet ground — the way a real stack sits.
  // Off the pad, so on the bare ground at 0.
  for (const z of [-boardLen * 0.38, 0, boardLen * 0.38]) out.push(box("sill", stackX, 0.07, z, 1.05, 0.14, 0.16));
  let y = 0.14;
  for (let l = 0; l < layers; l++) {
    const bh = 0.16;
    for (let b = 0; b < 4; b++) out.push(box("board", stackX - 0.39 + b * 0.26, y + bh / 2, 0, 0.22, bh, boardLen));
    y += bh;
    if (l < layers - 1) {
      // Stickers between layers, square across the boards, so the air gets through.
      for (const z of [-boardLen * 0.38, boardLen * 0.38]) out.push(box("sill", stackX, y + 0.03, z, 1.05, 0.06, 0.1));
      y += 0.06;
    }
  }
  // The stone: a neat pile of dressed blocks at the front end of the stack.
  const stones = stage === 0 ? 6 : stage === 1 ? 2 : 0;
  const bz = boardLen / 2 + 0.55;
  const bs = 0.42;
  const courses = [3, 2, 1];
  let placed = 0;
  let cy = 0;
  for (let c = 0; c < courses.length && placed < stones; c++) {
    for (let i = 0; i < courses[c] && placed < stones; i++, placed++) {
      out.push(box("stone", stackX + (i - (courses[c] - 1) / 2) * (bs + 0.04), cy + bs / 2, bz, bs, bs, bs));
    }
    cy += bs;
  }

  return { stage, pieces: out };
}
