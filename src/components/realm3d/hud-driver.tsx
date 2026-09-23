"use client";

/**
 * THE DRIVER. The only thing in the HUD that runs per frame, and the only place the camera
 * matrices and the DOM meet.
 *
 * It lives INSIDE the `<Canvas>` because that is where the frame clock and the camera are, and
 * it renders nothing: every line below writes a number onto a node the HUD already put on
 * screen. That is the whole architecture — see `hud-bus.ts` for why the alternative (HUD state
 * in React) would re-render the island sixty times a second.
 *
 * Allocation. `projectPoint` writes into one reused `ScreenPoint`, the plate layouts are
 * allocated once at mount, the declutter sort works in a caller-owned index array, and the
 * caster and the effect pool mutate in place. The only per-frame garbage is the handful of
 * short strings a DOM write needs, and each of those is built only when the rounded numbers it
 * is made of moved (`paint-keys.ts`), so a standing child produces none at all.
 */

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { drainCasts, manaFraction, MANA_MAX, stepCaster, tryCast, type Caster, type CastQueue } from "@/lib/realm3d/casting";
import { hidePlate, paintCooldown, paintGoal, paintMana, paintNode, paintPlate, WALK_REPORT, type HudBus } from "@/lib/realm3d/hud-bus";
import { makeGoalMark, placeGoal, type Inset } from "@/lib/realm3d/guide";
import { headingDegrees, makeMapPoint, makeRimMark, mapPoint, MAP_WINDOW, placeAt, rimMark } from "@/lib/realm3d/minimap";
import {
  declutter,
  makePlateLayouts,
  placePlate,
  PLATE_ROW_H,
  PLATE_X_GAP,
} from "@/lib/realm3d/nameplates";
import type { PlateAnchor } from "@/lib/realm3d/plate-anchors";
import { makeScreenPoint, projectPoint } from "@/lib/realm3d/project";
import { forgetKey, keyChanged, makePaintKeys } from "@/lib/realm3d/paint-keys";
import { beginCastFx, fxFrame, makeFxQueue, type FxSlot } from "@/lib/realm3d/spell-fx";
import { CASTLE_POSITION } from "@/lib/realm/layout";
import type { RealmWorld } from "@/lib/realm3d/worldgen";

/** The map's viewBox, and how many viewBox units one world unit is. Mirrors `hud.tsx`. */
const MAP = 100;
const MAP_SCALE = MAP / MAP_WINDOW;
/** How far inside the rim an off-window arrow sits, as a fraction of the map. */
const RIM_INSET = 0.07;
/** Where the child's own name hangs over their own head. */
const HERO_PLATE_Y = 2.95;
/**
 * The gold !'s safe box, in pixels from each edge: below the plaque and the ribbon, inside the
 * map's column, above the spell bar. Pinned to this box's edge it points the way without ever
 * sitting on a panel a child needs to read.
 */
const GOAL_INSET: Inset = { top: 200, right: 84, bottom: 250, left: 84 };
/** Nearer than this, the villager's own plate names them; the ! over their head goes wordless. */
const GOAL_NAMED = 24;
/** A frame that moved the hero further than this was a teleport or a respawn, not a walk. */
const WALK_JUMP_LIMIT = 3;
/** The paint-key slots after the plates' own (one per plate, from 0). */
const K_WORLD = 0;
const K_YOU = 1;
const K_CONE = 2;
const K_HOME = 3;
const K_GOAL = 4;
const K_MAP_GOAL = 5;
const K_EXTRA = 6;
const GOAL_STATES = ["off", "near", "over", "edge", "edge-low"] as const;

export function HudDriver({
  bus,
  world,
  anchors,
  pages,
  caster,
  fxPool,
  casts,
  heroRef,
  facingRef,
  yawRef,
  aimRef,
}: {
  bus: HudBus;
  world: RealmWorld;
  anchors: readonly PlateAnchor[];
  pages: SpellPageView[];
  caster: Caster;
  fxPool: FxSlot[];
  casts: CastQueue;
  heroRef: React.RefObject<THREE.Vector3>;
  facingRef: React.RefObject<number>;
  yawRef: React.RefObject<number>;
  /** Where the hero is asked to turn when they cast. See `Hero` in spike-scene.tsx. */
  aimRef: React.RefObject<number>;
}) {
  const { camera, size } = useThree();

  // Everything below is built once and mutated for ever.
  const mvp = useMemo(() => new THREE.Matrix4(), []);
  const point = useMemo(() => makeScreenPoint(), []);
  const layouts = useMemo(() => makePlateLayouts(anchors.length), [anchors.length]);
  const order = useMemo<number[]>(() => new Array(anchors.length).fill(0), [anchors.length]);
  const fxQueue = useMemo(() => makeFxQueue(fxPool.length), [fxPool.length]);
  /** The rounded numbers each string below was last built from: one slot per plate, then the map's and the goal's. */
  const keys = useMemo(() => makePaintKeys(anchors.length + K_EXTRA), [anchors.length]);
  /**
   * Scratch, and all of it held in REFS rather than in `useMemo`. Not a style choice: the
   * React compiler treats anything a render produced as immutable, so a per-frame buffer that
   * the frame loop writes into has to be a ref or the lint is right to refuse it. Everything
   * here is allocated once and written for the life of the page.
   */
  const hands = useRef({ x: 0, y: 0, z: 0 });
  const mp = useMemo(() => makeMapPoint(), []);
  const rim = useMemo(() => makeRimMark(), []);
  const groundY = useMemo(() => (x: number, z: number) => world.heightAt(x, z), [world]);

  const here = useRef<string | null>(null);
  /** Ground covered while the game was the child's, for the tutorial's "walk around". */
  const odo = useRef({ total: 0, reported: 0, x: Number.NaN, z: Number.NaN });
  const goalMark = useMemo(() => makeGoalMark(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    const facing = facingRef.current;

    /* ---- casting ------------------------------------------------------- */
    /**
     * The caster's clock gets the REAL frame time, not the 50ms-clamped `dt` the movement and
     * the camera use, and that difference was a bug found by playing rather than by reading.
     *
     * The clamp exists so a stalled frame cannot teleport the child through a wall, and every
     * physics step below is right to use it. Feed the same clamped value to a COOLDOWN and the
     * clock runs slow whenever frames are slower than 20 a second: under the software renderer
     * the screenshots were drawing at about ten frames a second, the 900ms Ember Bolt cooldown
     * was taking nearly two real seconds, and half of six evenly-spaced presses were refused.
     * A child on a slow afternoon would experience that as the spell key randomly not working.
     *
     * Still clamped, at a quarter second, because a backgrounded tab hands back one enormous
     * dt and mana should not refill while nobody is looking.
     */
    stepCaster(caster, Math.min(0.25, rawDt));
    // The hands: chest height on the child's own figure, so a cast that happens mid-jump
    // gathers where the child actually is.
    const hand = hands.current;
    hand.x = p.x;
    hand.y = p.y + 1.35;
    hand.z = p.z;
    /**
     * WHICH WAY A SPELL GOES: into the screen.
     *
     * Not the hero's body facing, which was the first answer and was wrong. The boom sits at
     * `p + (sin yaw, cos yaw) * length` looking back at the child, so the camera's forward is
     * `-(sin yaw, cos yaw)` — the same vector W walks along, which is exactly why this is the
     * right choice: the direction a child already knows means "away, over there" is the
     * direction they pressed W to go, and it is the direction they are looking. Cast along the
     * body instead and a child standing still at spawn — where the spike leaves the hero
     * facing the camera — fires the spell straight past their own shoulder and off the bottom
     * of the screen, which is indistinguishable from nothing happening.
     *
     * `aimRef` then turns the hero to match, so the spell still leaves from their front.
     */
    const dx = -Math.sin(yawRef.current);
    const dz = -Math.cos(yawRef.current);
    for (let i = 0; i < casts.n; i++) {
      const slot = casts.slots[i];
      const page = pages[slot - 1];
      if (!page || !page.spell) continue;
      const cast = tryCast(caster, slot, page.spell);
      if (cast) {
        beginCastFx(fxPool, cast, hand, dx, dz);
        aimRef.current = Math.atan2(dx, dz);
        bus.onCast(slot);
      } else {
        bus.onRefuse(slot, caster.refusal ?? "cooldown");
      }
    }
    drainCasts(casts);

    // A charge rides the child's hands for as long as it is gathering. Nothing flies under pause.
    fxFrame(bus.paused, fxPool, fxQueue, dt, groundY, hand.x, hand.y, hand.z, dx, dz);

    /* ---- mana and cooldowns -------------------------------------------- */
    paintMana(bus, Math.round(caster.mana), manaFraction(caster), MANA_MAX);
    for (let i = 0; i < bus.slots.length; i++) {
      const left = (caster.readyAt[i] ?? 0) - caster.clock;
      const span = caster.coolMs[i] || 1;
      paintCooldown(bus, i, left <= 0 ? 0 : Math.min(1, left / span));
    }

    /* ---- nameplates ---------------------------------------------------- */
    // The camera was moved by the rig this same frame and three only refreshes these matrices
    // at render time, so refresh them here: without it every plate is one frame behind the
    // camera, which on a swinging boom is a visible slide.
    camera.updateMatrixWorld();
    mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = mvp.elements;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      // Anchor 0 is the child, and the child moves.
      const ax = i === 0 ? p.x : a.x;
      const ay = i === 0 ? p.y + HERO_PLATE_Y : a.y;
      const az = i === 0 ? p.z : a.z;
      const ok = projectPoint(point, e, ax, ay, az, size.width, size.height);
      placePlate(layouts[i], ok, point, a.tier, size.width, size.height);
    }
    declutter(layouts, order, PLATE_ROW_H, PLATE_X_GAP);
    for (let i = 0; i < anchors.length; i++) {
      const l = layouts[i];
      if (!l.visible) {
        hidePlate(bus, i);
        forgetKey(keys, i);
        continue;
      }
      if (!keyChanged(keys, i, Math.round(l.x * 10), Math.round(l.y * 10), Math.round(l.scale * 1000), Math.round(l.opacity * 100))) continue;
      paintPlate(
        bus,
        i,
        `translate3d(${l.x.toFixed(1)}px,${l.y.toFixed(1)}px,0) translate(-50%,-100%) scale(${l.scale.toFixed(3)})`,
        l.opacity.toFixed(2),
      );
    }

    /* ---- the map -------------------------------------------------------- */
    // One attribute for the whole panning world: the land bitmap, the roads and every place
    // mark are drawn in world units inside this group, so they all move together.
    const n = anchors.length;
    if (keyChanged(keys, n + K_WORLD, Math.round(p.x * 100), Math.round(p.z * 100))) {
      paintNode(bus, "mapWorld", `translate(${MAP / 2} ${MAP / 2}) scale(${MAP_SCALE}) translate(${(-p.x).toFixed(2)} ${(-p.z).toFixed(2)})`);
    }
    const heading = headingDegrees(facing);
    if (keyChanged(keys, n + K_YOU, Math.round(heading * 10))) {
      paintNode(bus, "mapYou", `translate(${MAP / 2} ${MAP / 2}) rotate(${heading.toFixed(1)})`);
    }
    /**
     * The camera's own yaw, not the child's facing: the cone says what is on screen, and what
     * is on screen is decided by where the boom is, which the child steers with Q and E.
     *
     * The boom sits at `p + (sin yaw, cos yaw) * length` and looks back at the child, so the
     * VIEW direction is `-(sin yaw, cos yaw)` — the negative of the hero arrow's basis, which
     * is why this is `-yaw` where `headingDegrees` is `180 - facing`. At yaw 0 the camera is
     * due south of the child looking north, and the wedge points up the map.
     */
    const cone = -(yawRef.current * 180) / Math.PI;
    if (keyChanged(keys, n + K_CONE, Math.round(cone * 10))) {
      paintNode(bus, "mapCone", `translate(${MAP / 2} ${MAP / 2}) rotate(${cone.toFixed(1)})`);
    }
    // Home, as a rim arrow, once the castle has fallen off the window. It is the one mark a
    // lost child looks for, so it is the one that follows them to the edge.
    mapPoint(mp, CASTLE_POSITION.x, CASTLE_POSITION.z, p.x, p.z);
    rimMark(rim, mp, RIM_INSET);
    if (keyChanged(keys, n + K_HOME, rim.off ? 1 : 0, rim.off ? Math.round(rim.x * MAP * 100) : 0, rim.off ? Math.round(rim.y * MAP * 100) : 0, rim.off ? Math.round(rim.angle * 10) : 0)) {
      paintNode(bus, "mapHome", rim.off ? `translate(${(rim.x * MAP).toFixed(2)} ${(rim.y * MAP).toFixed(2)}) rotate(${rim.angle.toFixed(1)})` : "");
    }

    /* ---- the gold ! ------------------------------------------------------ */
    const goal = bus.goal;
    if (goal.on) {
      const ok = projectPoint(point, e, goal.x, goal.y, goal.z, size.width, size.height);
      placeGoal(goalMark, ok, point.x, point.y, size.width, size.height, p.x, p.z, goal.x, goal.z, yawRef.current, GOAL_INSET);
      // Distance in fives past twenty, so a walking child changes the words a few times a second
      // at most rather than every frame.
      const d = goalMark.dist;
      const state = !goalMark.show ? 0 : !goalMark.edge ? (d < GOAL_NAMED ? 1 : 2) : Math.abs(goalMark.angle) > 100 ? 4 : 3;
      const shown = d > 20 ? Math.round(d / 5) * 5 : d;
      if (keyChanged(keys, n + K_GOAL, state, Math.round(goalMark.x), Math.round(goalMark.y), Math.round(goalMark.angle), shown)) {
        paintGoal(
          bus,
          GOAL_STATES[state],
          `translate3d(${goalMark.x.toFixed(0)}px,${goalMark.y.toFixed(0)}px,0) translate(-50%,-50%)`,
          `rotate(${goalMark.angle.toFixed(0)}deg)`,
          `${shown} m`,
        );
      }
      mapPoint(mp, goal.x, goal.z, p.x, p.z);
      rimMark(rim, mp, RIM_INSET);
      if (keyChanged(keys, n + K_MAP_GOAL, rim.off ? 1 : 0, rim.off ? Math.round(rim.x * MAP * 100) : 0, rim.off ? Math.round(rim.y * MAP * 100) : 0, rim.off ? Math.round(rim.angle * 10) : 0)) {
        paintNode(bus, "mapGoal", rim.off ? `translate(${(rim.x * MAP).toFixed(2)} ${(rim.y * MAP).toFixed(2)}) rotate(${rim.angle.toFixed(1)})` : "");
      }
    } else {
      if (keyChanged(keys, n + K_GOAL, -1)) paintGoal(bus, "off", "", "", "");
      if (keyChanged(keys, n + K_MAP_GOAL, -1)) paintNode(bus, "mapGoal", "");
    }

    /* ---- ground covered --------------------------------------------------- */
    const o = odo.current;
    if (!bus.paused && o.x === o.x) {
      const sx = p.x - o.x;
      const sz = p.z - o.z;
      const step = Math.sqrt(sx * sx + sz * sz);
      if (step < WALK_JUMP_LIMIT) o.total += step;
      if (o.total - o.reported >= WALK_REPORT) {
        o.reported = o.total;
        bus.onWalked(o.total);
      }
    }
    o.x = p.x;
    o.z = p.z;

    /* ---- where am I ----------------------------------------------------- */
    const at = placeAt(p, world.landmarks, here.current);
    if (at !== here.current) {
      here.current = at;
      bus.onPlace(at);
      if (at) bus.onFound(at);
    }
  });

  return null;
}
