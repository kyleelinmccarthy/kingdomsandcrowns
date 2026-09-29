"use client";

/**
 * THE DOORSTEP — the island's half of going indoors, and the promise that nobody vanishes.
 *
 * Mounted once inside `World`, with the hero's own refs. Three jobs, all per frame and all
 * allocation-free (the rules are `lib/realm3d/doorways.ts`):
 *
 *   1. WALKING IN. A child pushing squarely into the doorway of a raised building (or of their
 *      unlocked castle) for `DOOR_DWELL` seconds fires `bus.onDoor(site)`. The frame decides what
 *      that means; this only says which door.
 *   2. COMING OUT. When the frame writes `bus.leaving`, the child is put down just outside that
 *      door, facing away from it, clear of every wall and of the villager waiting there, with the
 *      camera behind them, looking out at the village.
 *   3. NEVER BURIED. "I go into them but then I just disappear": a hero inside a solid is a hero
 *      the camera cannot see and the solver will never let out again, because every step from
 *      inside a box is a step that ends inside the box. The houses are solid now, but a building
 *      can still RISE round a child who was standing on its site when they finished its last side
 *      quest. So every frame, if the hero is inside something they could not have walked into,
 *      they are moved to the nearest open ground. It never fires on a hero merely touching a wall.
 *
 * It also draws what says "this building is open": the doorway of every raised building glows
 * warm, as if the door stood open on a lit room, and the garden gets the glasshouse porch its
 * inside needs.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Prop } from "@/lib/realm/layout";
import { CASTLE_TIERS, GATE_FRONT, type CastlePlan } from "@/lib/realm3d/castle-plan";
import { HERO_RADIUS, type Collider, type Pt } from "@/lib/realm3d/collision";
import { chaseLens, makeMoveIntent, moveIntent, terrainClearance, wrapAngle, type LookState, type MoveIntent, type MoveKeys } from "@/lib/realm3d/controls";
import { buildDoors, buried, doorAhead, exitSpot, freeSpot, DOOR_DWELL, type Door } from "@/lib/realm3d/doorways";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { rideFace, rideRadius, type RideBus } from "@/lib/realm3d/riding";
import { bodyFor, bodyReach } from "@/lib/realm3d/mount-body";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { LENS_HERO } from "./geo-kit";

type CastleInfo = { prop: Prop; plan: CastlePlan; ground: number } | null;

export function Doorstep({
  bus,
  heroRef,
  yawRef,
  aimRef,
  keys,
  view,
  solids,
  props,
  sitePlan,
  castle,
  castleTier,
  castleUnlocked,
  world,
  ride = null,
}: {
  bus: HudBus;
  heroRef: React.RefObject<THREE.Vector3>;
  yawRef: React.RefObject<number>;
  aimRef: React.RefObject<number>;
  keys: React.RefObject<MoveKeys>;
  /** The child's own camera — its pitch and length — to frame them as they come out. Read, never written. */
  view: React.RefObject<LookState>;
  solids: Collider[];
  props: readonly Prop[];
  sitePlan: number;
  castle: CastleInfo;
  castleTier: string;
  castleUnlocked: boolean;
  world: RealmWorld;
  /** Riding: the rescue below measures the body the solver is actually pushing, a mount's. */
  ride?: RideBus | null;
}) {
  const { camera } = useThree();
  const doors = useMemo<Door[]>(() => {
    const gate =
      castle && castleUnlocked
        ? { x: castle.prop.position.x + castle.plan.gate.x, face: castle.prop.position.z + GATE_FRONT, hw: castle.plan.gate.hw - 0.3 }
        : null;
    return buildDoors({ props, sitePlan, castle: gate });
  }, [props, sitePlan, castle, castleUnlocked]);
  /** Where the villagers stand: a child coming out of a door is not put down on top of one. */
  const avoid = useMemo<Pt[]>(() => props.filter((p) => p.kind === "villager").map((p) => ({ x: p.position.x, z: p.position.z })), [props]);
  const intent = useMemo<MoveIntent>(() => makeMoveIntent(), []);
  const spot = useMemo(() => ({ x: 0, z: 0, face: 0 }), []);
  const free = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const push = useRef({ door: -1, t: 0 });

  useFrame((_, rawDt) => {
    const p = heroRef.current;
    // The world's view of the hero, for the foreground dissolve (see `seeThrough`).
    LENS_HERO.value.set(p.x, p.y, p.z);

    /* ---- coming out of a door ------------------------------------------ */
    const leaving = bus.leaving;
    if (leaving !== null) {
      bus.setLeaving(null);
      const d = doors.find((x) => x.site === leaving);
      if (d) {
        exitSpot(spot, d, solids, avoid);
        placeHero(p, spot.x, spot.z, world.heightAt(spot.x, spot.z));
        // Face out, into the village, with the camera straight behind them, looking out, so W walks
        // away from the door. The house behind the lens is the see-through's to thin, not the
        // camera's to dodge. Put there now, rather than swung through the house from wherever it
        // was when the child went in.
        aimRef.current = spot.face;
        yawRef.current = wrapAngle(spot.face + Math.PI);
        const v = view.current;
        chaseLens(camera.position, p.x, p.y, p.z, yawRef.current, v.pitch, v.dist, world.heightAt, terrainClearance(v.pitch) + 0.6);
        camera.lookAt(p.x, p.y + 1.6, p.z);
      }
      push.current.door = -1;
      push.current.t = 0;
      return;
    }
    if (bus.paused) {
      push.current.t = 0;
      return;
    }

    /* ---- never inside a wall ------------------------------------------- */
    const r = rideRadius(ride, HERO_RADIUS);
    if (buried(solids, p.x, p.z, p.y, r)) {
      freeSpot(free, p.x, p.z, solids, r);
      placeHero(p, free.x, free.z, Math.max(p.y, world.heightAt(free.x, free.z)));
    }

    /* ---- walking into a door ------------------------------------------- */
    const k = keys.current;
    moveIntent(intent, yawRef.current, k);
    // Riding, the push counts from the mount's nose (or rump, backing in), which is what reaches the door.
    const reach = bodyReach(bodyFor(ride), rideFace(ride, intent), 0, -1, HERO_RADIUS);
    const i = intent.moving ? doorAhead(doors, p.x, p.z, intent.x, intent.z, reach) : -1;
    const pu = push.current;
    if (i < 0 || i !== pu.door) {
      pu.door = i;
      pu.t = 0;
      return;
    }
    pu.t += Math.min(0.05, rawDt);
    if (pu.t >= DOOR_DWELL) {
      pu.t = -1e9; // once per push: the frame has it now
      bus.onDoor(doors[i].site);
    }
  });

  // What says a building is open: its doorway, lit.
  return <DoorGlows doors={doors} props={props} sitePlan={sitePlan} castle={castle} castleTier={castleTier} world={world} />;
}

/** A free function, so the hero's position is never written to as a prop. */
function placeHero(p: THREE.Vector3, x: number, z: number, y: number): void {
  p.set(x, y, z);
}

/* ------------------------------------------------------------------ the lit doorways */

const GLOW = "#ffd79a";

function DoorGlows({
  doors,
  props,
  sitePlan,
  castle,
  castleTier,
  world,
}: {
  doors: readonly Door[];
  props: readonly Prop[];
  sitePlan: number;
  castle: CastleInfo;
  castleTier: string;
  world: RealmWorld;
}) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }), []);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6f0f0", transparent: true, opacity: 0.45, roughness: 0.1 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2efe6", flatShading: true }), []);
  useEffect(
    () => () => {
      mat.dispose();
      glass.dispose();
      wood.dispose();
    },
    [mat, glass, wood],
  );
  const panels = useMemo(() => {
    const out: { key: string; x: number; y: number; z: number; w: number; h: number; porch: boolean }[] = [];
    for (const d of doors) {
      if (d.site === "castle") {
        if (!castle) continue;
        const t = CASTLE_TIERS[castleTier] ?? CASTLE_TIERS.castle;
        const doorW = 2 * (castle.plan.gate.hw - 0.3);
        const doorH = Math.max(3.2, 5.2 * t.tall);
        out.push({ key: d.site, x: d.x, y: castle.ground + doorH * 0.45, z: castle.prop.position.z + GATE_FRONT + 0.16, w: doorW * 0.8, h: doorH * 0.9, porch: false });
        continue;
      }
      const p = props.find((q) => q.id === d.site);
      if (!p) continue;
      const g = world.heightAt(p.position.x, p.position.z);
      const dz = (p.size.d * sitePlan) / 2;
      if (d.site === "garden") {
        out.push({ key: d.site, x: d.x, y: g + 1.15, z: d.face + 0.05, w: 1.5, h: 2.1, porch: true });
        continue;
      }
      // Just proud of the door leaf the scene draws (2.4 high, 1.3 wide, at the wall's face).
      out.push({ key: d.site, x: d.x, y: g + 1.12, z: p.position.z + dz + 0.1, w: 1.08, h: 2.2, porch: false });
    }
    return out;
  }, [doors, props, sitePlan, castle, castleTier, world]);

  return (
    <>
      {panels.map((q) => (
        <group key={q.key} position={[q.x, q.y, q.z]}>
          <mesh material={mat}>
            <planeGeometry args={[q.w, q.h]} />
          </mesh>
          {q.porch && (
            <>
              {/* The glasshouse porch at the front of the garden: two white posts, a glass roof. */}
              {[-1, 1].map((s) => (
                <mesh key={s} material={wood} position={[s * 0.9, 0.35, 0.05]} castShadow>
                  <boxGeometry args={[0.16, 2.9, 0.16]} />
                </mesh>
              ))}
              <mesh material={wood} position={[0, 1.85, 0.05]} castShadow>
                <boxGeometry args={[2.1, 0.16, 0.2]} />
              </mesh>
              <mesh material={glass} position={[0, 1.95, -0.45]} rotation={[0.35, 0, 0]}>
                <boxGeometry args={[2.1, 0.04, 1.1]} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </>
  );
}
