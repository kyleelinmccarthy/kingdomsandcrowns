"use client";

import "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { WORLD_SIZE, spriteSizeFor, type Prop, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { stepCompanion, stepHero, unstickHero, setMounted, HERO_SPEED, COMPANION_GAP_MOUNTED, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, edgeArrow, followCamera } from "@/lib/realm/camera";
import { projectToMap, worldBounds } from "@/lib/realm/minimap";
import { BEACON, facingAngle, GROUND_Y, shadowFootprint, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM } from "@/lib/realm/markers";
import { nearestVillager, villagerById, REACH } from "@/lib/realm/villagers";
import { deferSignal, keysFromWorldAxis, objectiveArrival, shouldEmitWalked, walkBucket, type TutorialSignal } from "@/lib/realm/tutorial";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { Surfaces } from "@/lib/realm/depth";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import type { CastRequest } from "./use-realm-input";
import type { TroubleSkin } from "@/lib/realm/spells/troubles";
import { stepSpellSim, useSpellSimRef, type SpellEvent, type SpellSimInput } from "./use-spell-sim";
import { stepRecessSim, useRecessSimRef, type RecessSimEvent, type RecessSimInput } from "./use-recess-sim";
import { SpellLayer } from "./spell-layer";
import { RecessLayer } from "./recess-layer";
import { CeremonyLayer } from "./ceremony-layer";
import { startCeremony, stepCeremony, skipCeremony, type CeremonyEvent, type CeremonyState } from "@/lib/realm/ceremony/ceremony";
import type { SpriteTextures } from "./sprite-source";
import { VillagerPlate } from "./villager-plate";

export type RealmSceneProps = {
  layout: WorldLayout;
  textures: SpriteTextures;
  settings: RenderSettings;
  surfaces: Surfaces; // the visit's complexity axis; the villager plates read `numerals` from it
  axisRef: RefObject<Vec2>;
  interactive: boolean; // false while a panel is open: ground taps are ignored
  reachId: string | null; // the villager the hero can talk to, as the shell last heard it
  onReachChange: (id: string | null) => void;
  onTalk: (villagerId: string) => void;
  risingId: string | null; // a building that just completed; the scene tweens it up once
  selectedSpell: SpellDefinition | null;
  selectedSlot: number | null;
  castRef: RefObject<CastRequest | null>;
  troubleSkin: TroubleSkin;
  spellsEnabled: boolean; // false for parents: the sim still steps, but never casts
  onSpellEvent: (e: SpellEvent) => void;
  seed: number;
  riding: boolean;
  mountSpeed: number;
  recessActive: boolean;
  onRecessEvent: (e: RecessSimEvent) => void;
  ceremonyActive: boolean; // true while the shell wants the ceremony running; the scene starts it once
  ceremonySkipRef: RefObject<boolean>; // the shell sets it; the scene reads and clears it
  onCeremonyEvent: (e: CeremonyEvent) => void;
  /**
   * The one door the tutorial's two world-measured signals leave by: `walked` (how far the
   * hero has walked, and which movement keys did it) and `reachedObjective`. Both exist only
   * inside the per-frame loop below, so both are accumulated in refs there and handed out
   * through `queueMicrotask` like every other scene -> React event in this file. Interacting
   * and casting are the shell's own to notice, and never travel through here.
   */
  onTutorialSignal: (s: TutorialSignal) => void;
  // The off-screen objective arrow, which lives in the HUD layer. A ref, so it is
  // referentially stable and the World memo never sees a changed prop; the scene
  // writes the element directly rather than routing a position through React.
  arrowRef: RefObject<HTMLDivElement | null>;
  // The minimap's hero dot, which lives in the HUD layer too. Same contract as `arrowRef`
  // for the same reason: the hero's position and facing exist only in a per-frame ref in
  // here, and routing them through React would re-render the HUD sixty times a second.
  // Everything else on the map is drawn from `layout` and `surfaces`, which change rarely.
  minimapRef: RefObject<SVGGElement | null>;
};

/** The minimap's SVG user-unit box (realm-minimap.tsx's own `SIZE`); the hero dot is written in it. */
const MAP_SIZE = 100;
const SPRITE_W = 1.5;
const SPRITE_H = 2;
export const RISE_MS = 900;
const CALM_FOUNDATION = "#5a5750";
const CALM_TINT = "#a9aaa4";
// §3.4's footprint table, every entry put through the one shared transform so
// the whole programme's shadows keep the same shape rule. Task 15 gives each
// villager the hero's 0.8 × 0.8.
const HERO_SHADOW = shadowFootprint({ w: 0.8, d: 0.8 });
const MOUNT_SHADOW = shadowFootprint({ w: 1.1, d: 1.1 });
const COMPANION_SHADOW = shadowFootprint({ w: 0.6, d: 0.6 });

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * ONE geometry and TWO materials for every contact shadow in the world.
 *
 * A castle, up to eight buildings, twelve decorations, up to eight villagers, the hero, the
 * mount and the companion is 17 to 32 shadows. Declared inline, each of them got its own
 * BufferGeometry and its own Material — so every one was a distinct VAO bind and forced
 * `refreshMaterial = true` in setProgram, re-uploading the whole uniform block instead of
 * taking the same-material fast path. Shared, the transparent pass binds one buffer and one
 * program for all of them.
 *
 * There is no polygonOffset: GROUND_Y already gives every decal in the programme its own
 * rung, so the offset bought nothing and cost a GL state toggle on either side of each draw.
 * Module scope, not a hook: they are stateless, immutable and live as long as the scene
 * module does — a per-component useMemo would hand a different pair to each subtree.
 */
const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.5, 4);
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: SHADOW_OPACITY, depthWrite: false });
const SHADOW_MATERIAL_CALM = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: SHADOW_OPACITY_CALM, depthWrite: false });

/**
 * The flat diamond a figure or a prop drops on the ground: a 4-segment circle
 * is an axis-aligned diamond, scaled to the footprint so a building's shadow is
 * its plan and never a bar. It is a child of the thing it belongs to and sits at
 * a named rung of GROUND_Y — and it never takes `bob`, which is the one detail
 * that turns "floating" into "standing" (D1.3, D1.4).
 */
function ContactShadow({ w, d, y, calm }: { w: number; d: number; y: number; calm: boolean }) {
  return (
    <mesh
      geometry={SHADOW_GEOMETRY}
      material={calm ? SHADOW_MATERIAL_CALM : SHADOW_MATERIAL}
      // Shared resources MUST opt out of unmount disposal. This is the documented,
      // version-proof opt-out rather than a reaction to one observed teardown path: under
      // the installed R3F 9 a leaving villager would not in fact free these (removeChild
      // disposes only objects that own a dispose(), which Mesh does not), but the guarantee
      // we need is that nothing ever frees a geometry and material every other shadow in the
      // world is still drawing with. `dispose={null}` propagates to children, so a shadow
      // inside an unmounting villager group opts out with it.
      dispose={null}
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[w, d, 1]}
    />
  );
}

const World = memo(function World({ layout, textures, settings, surfaces, axisRef, arrowRef, minimapRef, interactive, reachId, onReachChange, onTalk, risingId, selectedSpell, selectedSlot, castRef, spellsEnabled, onSpellEvent, seed, riding, mountSpeed, recessActive, onRecessEvent, ceremonyActive, ceremonySkipRef, onCeremonyEvent, onTutorialSignal }: RealmSceneProps) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null, mounted: false });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const mountSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const reachRef = useRef<string | null>(null);
  const buildingObjects = useRef(new Map<string, THREE.Object3D>()); // a sprite, or the fallback box mesh when its texture is missing
  const rising = useRef<{ id: string; startedAt: number } | null>(null);
  const simRef = useSpellSimRef();
  const recessRef = useRecessSimRef();
  const dazzledRef = useRef(false);
  const castingRef = useRef(false);
  const ceremonyRef = useRef<CeremonyState | null>(null);
  const beaconMaterial = useRef<THREE.MeshBasicMaterial>(null); // the breathing column; the ground ring holds still
  const arrowShown = useRef(false);
  const arrowAt = useRef({ x: 0, y: 0 });
  // The hero dot's last written place on the map, in the same 0..100 user units the SVG
  // uses. Seeded off the map so the first frame always writes.
  const heroDotAt = useRef({ x: -1, y: -1, deg: NaN });
  // The whole villager — sprite, plate and shadow — is one Object3D. The ceremony moves
  // the group, so every attachment travels with it and `ceremony.ts` needs no change.
  const villagerGroups = useRef(new Map<string, THREE.Object3D>());
  // A villager whose figure never rasterised is not in the world at all. This one list
  // feeds the render AND `nearestVillager` below, so a missing sprite can never leave a
  // Talk bubble floating over bare grass (sprite-source.tsx silently continues past a
  // villager whose SVG is not in the DOM).
  const shown = useMemo(() => layout.villagers.filter((v) => Boolean(textures.villagers[v.id])), [layout.villagers, textures]);
  const heroShadow = useRef<THREE.Group>(null);
  const mountShadow = useRef<THREE.Group>(null);
  const companionShadow = useRef<THREE.Group>(null);
  const heroRing = useRef<THREE.Group>(null);
  // ── The tutorial's two world-measured signals (§ task 13) ─────────────────────────────
  // The ACCUMULATORS live here, in refs, because the hero's position and the axis exist
  // nowhere else and nothing may set React state sixty times a second. Every DECISION taken
  // from them — which keys an axis means, whether a `walked` signal is due, whether an arrival
  // should speak — lives in `@/lib/realm/tutorial`, which imports no three and is under test.
  // This file cannot be unit-tested (it imports three, so the shell's suite mocks it whole),
  // and rules that decide whether a child can finish the tutorial have no business living
  // somewhere nothing can check them.
  const walkDistance = useRef(0);
  const walkKeys = useRef(new Set<string>());
  const walkEmitted = useRef(0); // the size of the key set the last `walked` signal carried
  // ...and which WALK_DISTANCE-sized stretch of ground it was sent from. The key set only ever
  // grows, so on its own it runs out after four; the bucket is what lets a child who REPLAYS
  // the tutorial (the help card resets the shell's state but never remounts this scene, so
  // every accumulator here survives) finish step one again by walking rather than by reloading.
  const walkBucketAt = useRef(0);
  const atObjective = useRef(false); // the edge-trigger latch for the lit site

  // Writes one frame of a rise straight onto the building. `s` of 1 is exactly what the
  // declarative JSX places, which is what makes this also the way to settle an abandoned one.
  const applyRise = useCallback((id: string, s: number) => {
    const obj = buildingObjects.current.get(id);
    if (!obj) return;
    if (obj.userData.box) {
      obj.scale.y = s;
      obj.position.y = ((obj.userData.boxH as number) * s) / 2; // the box's centre rises with it, base on the ground
    } else {
      const h = obj.userData.h as number;
      obj.scale.y = h * s;
      obj.position.y = (h * s) / 2;
    }
  }, []);

  // A completed building scales up from the ground once; with motion off it simply appears.
  useEffect(() => {
    // Settle whatever was mid-rise BEFORE dropping it. Both triggers here abandon it — the
    // motion setting flipping false, or a second building completing inside RISE_MS — and the
    // abandoned object keeps the scale.y and position.y of a half-risen building. R3F diffs
    // the declarative arrays element-wise, sees no change and never writes them again, so
    // without this the child's newly built mill stays half-sunk for the rest of the session.
    const abandoned = rising.current;
    if (abandoned) {
      applyRise(abandoned.id, 1);
      rising.current = null;
    }
    if (!risingId) return;
    if (settings.motion) rising.current = { id: risingId, startedAt: performance.now() };
  }, [risingId, settings.motion, applyRise]);

  // The frame loop is the only thing that ever reports reach, which leaves it one blind spot:
  // if the scene unmounts with a villager in reach, no final `onReachChange(null)` is sent and
  // the shell's `reachId` stays set — E would still open the deed panel for a villager who
  // is no longer on screen. No path reaches that today (a sprite retry re-keys SpriteSource,
  // not the scene, and `textures` never goes back to null), but `{textures && <RealmScene/>}`
  // puts it one line away, so the scene reports its own departure. Through a ref, with no deps:
  // `onReachChange` changes identity whenever the stick setting does, and a cleanup that ran on
  // that would clear a reach the hero is still standing in.
  const onReachChangeRef = useRef(onReachChange);
  useEffect(() => {
    onReachChangeRef.current = onReachChange;
  }, [onReachChange]);
  useEffect(() => () => {
    if (reachRef.current === null) return;
    reachRef.current = null;
    onReachChangeRef.current(null);
  }, []);

  // A foundation the hero was standing on can become a solid building between
  // frames; step them out rather than leaving them entombed inside it.
  useEffect(() => {
    hero.current = unstickHero(hero.current, layout.colliders);
  }, [layout.colliders]);

  // Mounting/dismounting drops any walk target; the flag itself only ever changes here.
  useEffect(() => {
    hero.current = setMounted(hero.current, riding);
  }, [riding]);

  // The one site the child is being sent to, read off the layout rather than out of
  // BUILDING_SLOTS: when slice 4 rewrites the town plan the beacon and the arrow move
  // with it and nothing needs re-siting. Null when the kingdom is complete, when the
  // load failed, and in every other state objectiveState calls `unknown` — no focus,
  // no beacon, no arrow.
  // The arrow element lives in the HUD layer, so the scene dresses it: gold, or the
  // muted ring colour at 0.7 under a calm palette — shown in every mode, never hidden
  // by a setting (§3.5) — plus the flag globals.css reads to still the pulse for a hero
  // who asked for no motion. The cleanup hides it when the world unmounts, because the
  // element outlives the canvas and nothing else would.
  useEffect(() => {
    const el = arrowRef.current;
    if (!el) return;
    el.style.color = settings.calmPalette ? RING_CALM : RING_GOLD;
    el.style.opacity = settings.calmPalette ? "0.7" : "1";
    el.dataset.motion = settings.motion ? "on" : "off";
    return () => {
      el.hidden = true;
      // Also clear the frame loop's "already shown" flag: that loop only rewrites
      // `hidden`/`transform` when the arrow's position moves past a half-pixel
      // threshold, and this cleanup can run — on every calmPalette/motion flip,
      // not just on unmount — while the hero stands still. Leaving the flag true
      // would hide the arrow here and then have nothing move it far enough to
      // re-show it, stranding it hidden until the hero happens to take a step.
      arrowShown.current = false;
    };
  }, [arrowRef, settings.calmPalette, settings.motion]);

  const objectiveSite = layout.props.find((p) => p.focus === "objective") ?? null;
  // The SAME bounds the shell's `minimapView` gave the dots, from the same layout and the
  // same function — so the hero dot and the site dots can never be drawn to two scales.
  const mapBounds = useMemo(() => worldBounds(layout), [layout]);

  // Hoisted out of the frame loop: two closures and two sizeable object literals that were
  // otherwise allocated sixty times a second for the whole visit. The emitters are stable
  // because the shell's handlers are (every scene callback is useCallback'd), and the two
  // input records are written field by field each frame — both steppers read their input
  // within the call and neither retains the object, so one instance can serve every frame.
  const emitSpell = useCallback((e: SpellEvent) => queueMicrotask(() => onSpellEvent(e)), [onSpellEvent]);
  const emitRecess = useCallback((e: RecessSimEvent) => queueMicrotask(() => onRecessEvent(e)), [onRecessEvent]);
  // The microtask boundary is `deferSignal`, beside the rules, so that removing it fails a
  // test rather than quietly turning the frame loop into a setState loop. `useMemo` rather
  // than `useCallback` because the function is built by a call, not written as a literal.
  const emitTutorial = useMemo(() => deferSignal(onTutorialSignal), [onTutorialSignal]);
  const spellInput = useRef<SpellSimInput>({ layout, hero: layout.spawn, dt: 0, selectedSpell: null, selectedSlot: null, castRequest: null, lowStimulus: false, reducedMotion: false, seed });
  const recessInput = useRef<RecessSimInput>({ layout, hero: layout.spawn, dt: 0, active: false, lowStimulus: false, seed });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // a tab that was hidden must not teleport the hero on return
    // Read and clear unconditionally: a cast request queued an instant before a
    // panel opened this frame must not fire later, once the world is interactive again.
    const request = castRef.current;
    castRef.current = null;
    if (ceremonyActive && !ceremonyRef.current) {
      const started = startCeremony(layout, hero.current.position, !settings.motion, hero.current.facing);
      ceremonyRef.current = started;
      const first = started.step;
      queueMicrotask(() => onCeremonyEvent({ kind: "step", step: first }));
    }
    const ceremony = ceremonyRef.current;
    if (ceremony && ceremony.step !== "done") {
      // The ceremony drives the hero and the villagers; input, spells and recess wait.
      let s = ceremony;
      if (ceremonySkipRef.current) {
        ceremonySkipRef.current = false;
        const skipped = skipCeremony(s);
        if (skipped !== s) {
          s = skipped;
          queueMicrotask(() => onCeremonyEvent({ kind: "step", step: "hail" }));
        }
      }
      const r = stepCeremony(s, dt, layout.colliders, !settings.motion);
      ceremonyRef.current = r.state;
      const entered = r.entered;
      if (entered) queueMicrotask(() => onCeremonyEvent({ kind: "step", step: entered }));
      hero.current = { ...hero.current, position: r.state.hero, target: null, facing: r.state.heroFacing };
      companion.current = stepCompanion(companion.current, hero.current, dt);
      for (const [id, group] of villagerGroups.current) {
        const v = r.state.villagers[id];
        if (v) group.position.set(v.x, 0, v.z);
      }
      if (r.state.step === "done") {
        // The people return to their sites, where Talk expects them — and their plates,
        // markers and shadows are children of the group, so they come home too.
        for (const v of layout.villagers) villagerGroups.current.get(v.id)?.position.set(v.position.x, 0, v.position.z);
      }
    } else if (interactive) {
      const frozen = dazzledRef.current || castingRef.current;
      const from = hero.current.position;
      hero.current = stepHero(hero.current, { axis: frozen ? { x: 0, z: 0 } : axisRef.current ?? { x: 0, z: 0 } }, dt, layout.colliders, riding ? mountSpeed : HERO_SPEED);
      companion.current = stepCompanion(companion.current, hero.current, dt, riding ? { gap: COMPANION_GAP_MOUNTED, speed: mountSpeed + 0.5 } : undefined);
      // ── The tutorial's first two steps, measured where the hero actually is ───────────
      // Only ground the hero really covered counts: a key held against a wall moves nothing
      // and teaches nothing, and `frozen` already zeroes the axis, so both fall out for free.
      const walked = Math.hypot(hero.current.position.x - from.x, hero.current.position.z - from.z);
      let walkedSignalled = false;
      if (walked > 0) {
        walkDistance.current += walked;
        for (const key of keysFromWorldAxis(axisRef.current ?? { x: 0, z: 0 })) walkKeys.current.add(key);
        if (shouldEmitWalked(walkDistance.current, walkKeys.current.size, walkEmitted.current, walkBucketAt.current)) {
          walkEmitted.current = walkKeys.current.size;
          walkBucketAt.current = walkBucket(walkDistance.current);
          walkedSignalled = true;
          emitTutorial({ kind: "walked", keys: [...walkKeys.current], distance: walkDistance.current });
        }
      }
      // "Go where the light is" finishes at the site's edge plus the same REACH a villager
      // is talkable from — the moment the person standing there becomes worth pressing E at,
      // which is the step that comes next. A complete kingdom has no lit site at all, and the
      // shell drops the whole prompt then rather than leaving one that cannot be obeyed.
      const here = objectiveSite !== null && Math.hypot(hero.current.position.x - objectiveSite.position.x, hero.current.position.z - objectiveSite.position.z) <= objectiveSite.size.w / 2 + REACH;
      const arrival = objectiveArrival(here, atObjective.current, walkedSignalled);
      atObjective.current = arrival.latched;
      if (arrival.emit) emitTutorial({ kind: "reachedObjective" });
      const spellIn = spellInput.current;
      spellIn.layout = layout;
      spellIn.hero = hero.current.position;
      spellIn.dt = dt;
      spellIn.selectedSpell = spellsEnabled ? selectedSpell : null;
      spellIn.selectedSlot = spellsEnabled ? selectedSlot : null;
      spellIn.castRequest = spellsEnabled ? request : null;
      spellIn.lowStimulus = settings.calmPalette;
      spellIn.reducedMotion = !settings.motion;
      spellIn.seed = seed;
      const stepped = stepSpellSim(simRef.current, spellIn, emitSpell);
      simRef.current = stepped.sim;
      dazzledRef.current = stepped.dazzled;
      castingRef.current = stepped.casting;
      const recessIn = recessInput.current;
      recessIn.layout = layout;
      recessIn.hero = hero.current.position;
      recessIn.dt = dt;
      recessIn.active = recessActive;
      recessIn.lowStimulus = settings.calmPalette;
      recessIn.seed = seed;
      recessRef.current = stepRecessSim(recessRef.current, recessIn, emitRecess);
    }
    camTarget.current = followCamera(camTarget.current, hero.current.position, dt, { reducedMotion: !settings.motion });
    const bob = settings.motion ? Math.sin(state.clock.elapsedTime * 3) * 0.05 : 0;
    const p = hero.current.position;
    if (heroSprite.current) {
      const flip = hero.current.facing === "w" ? -SPRITE_W : SPRITE_W;
      const material = heroSprite.current.material as THREE.SpriteMaterial;
      const wantMap = riding ? textures.heroMounted ?? textures.hero : textures.hero;
      if (material.map !== wantMap) {
        material.map = wantMap;
        material.needsUpdate = true;
      }
      heroSprite.current.position.set(p.x, (riding ? 1.4 : SPRITE_H / 2) + bob, p.z);
      heroSprite.current.scale.set(flip, SPRITE_H, 1);
      if (mountSprite.current) {
        mountSprite.current.visible = riding;
        mountSprite.current.position.set(p.x, 0.9 + bob, p.z);
        mountSprite.current.scale.set(flip, SPRITE_H, 1);
      }
    }
    // The marks on the ground take the figure's TRUE position. `bob` is applied
    // to the sprites above and to nothing down here: the hero rises, the shadow
    // does not, which is the difference between a hero who stands and one who hops.
    if (heroShadow.current) {
      heroShadow.current.position.set(p.x, 0, p.z);
      // The mount's wider shadow stands in for both while mounted — but only if there IS one.
      // `canRide` is gated on the unlocked list, not on the texture, so a mount sprite that
      // failed to rasterise renders no mount group at all; hiding the hero's shadow then
      // leaves a figure floating on the grass with nothing anchoring it (D1.3, D1.4).
      heroShadow.current.visible = !(riding && mountShadow.current);
    }
    if (mountShadow.current) {
      mountShadow.current.visible = riding;
      mountShadow.current.position.set(p.x, 0, p.z);
    }
    if (heroRing.current) {
      heroRing.current.position.set(p.x, GROUND_Y.heroRing, p.z);
      heroRing.current.rotation.set(-Math.PI / 2, 0, facingAngle(hero.current.facing));
    }
    const c = companion.current.position;
    if (companionSprite.current) {
      companionSprite.current.position.set(c.x, SPRITE_H / 2 + bob * 0.5, c.z);
      companionSprite.current.scale.set(c.x > p.x ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
    }
    if (companionShadow.current) companionShadow.current.position.set(c.x, 0, c.z);
    const t = camTarget.current;
    if (camera.current) {
      camera.current.position.set(t.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, t.z + CAMERA_OFFSET.z);
      camera.current.lookAt(t.x, 0, t.z);
    }
    // The column breathes 0.35↔0.55 on a 1.2 Hz sine (2π · 1.2 = Math.PI * 2.4). A hero
    // who asked for less motion gets it held at BEACON.opacity, and a calm palette holds
    // it quieter still: the mark is always there, it just stops moving.
    if (beaconMaterial.current) {
      beaconMaterial.current.opacity = settings.calmPalette
        ? BEACON.calmOpacity
        : settings.motion
          ? BEACON.opacity + Math.sin(state.clock.elapsedTime * Math.PI * 2.4) * 0.1
          : BEACON.opacity;
    }
    // The off-screen arrow is written straight to the DOM: no setState, no queueMicrotask,
    // no React at all, so a memoised World is not re-rendered sixty times a second to move
    // one triangle. `t` is this frame's camera target, so the arrow and the camera can
    // never disagree by a frame. A move under half a pixel is skipped, which means a
    // standing hero writes nothing at all.
    const arrowEl = arrowRef.current;
    if (arrowEl) {
      const arrow = objectiveSite ? edgeArrow(t, objectiveSite.position, state.size) : null;
      if (!arrow) {
        if (arrowShown.current) {
          arrowShown.current = false;
          arrowEl.hidden = true;
        }
      } else if (!arrowShown.current || Math.abs(arrow.x - arrowAt.current.x) >= 0.5 || Math.abs(arrow.y - arrowAt.current.y) >= 0.5) {
        arrowAt.current = { x: arrow.x, y: arrow.y };
        arrowShown.current = true;
        arrowEl.style.transform = `translate(${arrow.x}px, ${arrow.y}px) translate(-50%, -50%) rotate(${arrow.angle}rad)`;
        arrowEl.hidden = false;
      }
    }
    // The minimap's hero dot, written the same way and for the same reason: straight to the
    // DOM node, no React. `MAP_SIZE` mirrors the minimap's own viewBox, and a move under a
    // twentieth of a user unit (a fiftieth of a pixel on a 144px map) is skipped, so a
    // standing hero writes nothing. The projection is `projectToMap` — the one the dots
    // already went through — so a dot and the hero standing on it land on the same spot.
    const dotEl = minimapRef.current;
    if (dotEl) {
      const m = projectToMap(p, mapBounds);
      const x = m.x * MAP_SIZE;
      const y = m.y * MAP_SIZE;
      const deg = (facingAngle(hero.current.facing) * 180) / Math.PI;
      const at = heroDotAt.current;
      if (Math.abs(x - at.x) >= 0.05 || Math.abs(y - at.y) >= 0.05 || deg !== at.deg) {
        at.x = x;
        at.y = y;
        at.deg = deg;
        dotEl.setAttribute("transform", `translate(${x} ${y}) rotate(${deg})`);
      }
    }
    // Reach is reported only when it changes, and outside the frame loop, so React never sets state mid-render.
    const near = nearestVillager(p, shown);
    if (near !== reachRef.current) {
      reachRef.current = near;
      queueMicrotask(() => onReachChange(near));
    }
    const r = rising.current;
    if (r) {
      const k = Math.min(1, (performance.now() - r.startedAt) / RISE_MS);
      applyRise(r.id, 0.1 + 0.9 * easeOut(k)); // k === 1 gives exactly 1: the building settles at full size
      if (k >= 1) rising.current = null;
    }
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";
  const colorFor = (prop: Prop) => (prop.kind === "foundation" && settings.calmPalette ? CALM_FOUNDATION : prop.color);
  const reachVillager = reachId ? villagerById(reachId) : null;
  const reachPlacement = reachId ? shown.find((v) => v.id === reachId) ?? null : null;
  // The one thing a click in the world does (§4.1). The ground, a villager's sprite and a
  // site's building each hand over their own hit point, so a page aimed at a person is not
  // a page aimed at the grass three units behind them.
  const castAt = useCallback((point: Vec2) => {
    if (!interactive) return; // a panel is open: the world underneath it is not listening
    // The point the child aimed at, not the point the spell lands on: `stepSpellSim` puts
    // this through `pickTarget` alongside the number key's `{ nearest: true }`, so a click
    // on open grass takes the nearest trouble in range and a click with nothing in range
    // refuses there — one rule, one place, every entry point.
    if (selectedSpell) castRef.current = { target: point };
  }, [interactive, selectedSpell, castRef]);
  // stopPropagation first, so a click on a figure is not also a click on the ground behind it.
  const castHandler = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0) return; // left only, exactly like the ground: right click is not a second cast key
    castAt({ x: e.point.x, z: e.point.z });
  };
  // A site is a thing you can aim at, so its building and its bare foundation take the same
  // handler. Which villager keeps it no longer matters — it used to, when a tap on the well
  // walked you to Old Bram.
  const siteCast = (prop: Prop): { onPointerDown?: (e: ThreeEvent<PointerEvent>) => void } => {
    if (prop.kind !== "building" && prop.kind !== "foundation") return {};
    return { onPointerDown: castHandler };
  };
  const tint = settings.calmPalette ? CALM_TINT : "#ffffff";
  const ringColor = settings.calmPalette ? RING_CALM : RING_GOLD; // lowStimulus mutes the mark, never removes it
  const worldTex = (key: string): THREE.CanvasTexture | undefined => textures.world[key];
  const spriteFor = (prop: Prop): THREE.CanvasTexture | undefined => {
    if (prop.kind === "castle") return worldTex(`castle:${layout.castleType}`);
    if (prop.kind === "building") return worldTex(`building:${prop.id}`);
    if (prop.kind === "decor") return worldTex(`decor:${prop.variant ?? ""}`);
    return undefined;
  };
  const standing = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "decor" || p.kind === "barrier");
  // Calm shortens and quietens the beacon; it is never absent (§3.9, §6: lowStimulus mutes, never empties).
  // Same colour rule as `ringColor` above — reused rather than recomputed.
  const beaconHeight = settings.calmPalette ? BEACON.calmHeight : BEACON.height;
  const beaconOpacity = settings.calmPalette ? BEACON.calmOpacity : BEACON.opacity;
  const keyHint = !settings.showStick; // `Talk · E` for a keyboard, a plain `Talk` for a thumb

  return (
    <>
      <color attach="background" args={[sky]} />
      <OrthographicCamera ref={camera} makeDefault position={[CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z]} zoom={CAMERA_ZOOM} near={0.1} far={200} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 10, 5]} intensity={settings.calmPalette ? 0.5 : 0.8} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          // LEFT ONLY. Right click used to cast too — a duplicate of the verb §4.5 names,
          // which meant the browser menu key also fired a spell. It now does nothing in the
          // world at all; `onContextMenu` on the realm root still swallows the menu itself.
          if (e.button !== 0) return;
          // And then nothing else. A tap on open grass used to walk the hero there, which
          // was a second way to do the one thing the stick and WASD already do (§4.1);
          // with no page armed a tap on the world is now simply inert.
          castAt({ x: e.point.x, z: e.point.z });
        }}
      >
        {/* Visual only: the ground plane is drawn larger than the playable world so its edge never shows past the backdrop. */}
        <planeGeometry args={[WORLD_SIZE * 3, WORLD_SIZE * 3]} />
        {textures.tiles ? <meshStandardMaterial map={textures.tiles.grass} color={tint} /> : <meshStandardMaterial color={ground} />}
      </mesh>
      {layout.props.filter((p) => p.kind === "path").map((prop) => (
        <mesh key={prop.id} position={[prop.position.x, GROUND_Y.path, prop.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[prop.size.w, prop.size.d]} />
          {textures.tiles ? <meshStandardMaterial map={textures.tiles.cobble} color={tint} /> : <meshStandardMaterial color={prop.color} />}
        </mesh>
      ))}
      {objectiveSite && (
        <group position={[objectiveSite.position.x, 0, objectiveSite.position.z]}>
          {/* Geometry, not a sprite and not DOM (D3.2): a gold column reads across the
              field, costs no rasterised kind, and survives a failed sprite or a broken
              overlay — the cue of last resort for "where am I meant to go". */}
          <mesh position={[0, beaconHeight / 2, 0]}>
            <cylinderGeometry args={[BEACON.radius, BEACON.radius, beaconHeight, 8]} />
            <meshBasicMaterial ref={beaconMaterial} color={ringColor} transparent opacity={beaconOpacity} depthWrite={false} />
          </mesh>
          {/* Its own rung, never `heroRing - 0.005`: that is exactly GROUND_Y.figureShadow, and two
              coplanar transparent decals swap order with the camera — the gold "go here" ring
              flickering against the hero's own shadow the moment the child arrives. */}
          <mesh position={[0, GROUND_Y.objectiveRing, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[objectiveSite.size.w / 2 + 0.22, objectiveSite.size.w / 2 + 0.3, 32]} />
            <meshBasicMaterial color={ringColor} transparent opacity={beaconOpacity} depthWrite={false} />
          </mesh>
        </group>
      )}
      {layout.props.filter((p) => p.kind === "foundation").map((prop) => {
        const foundationTex = worldTex("foundation");
        return (
          <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...siteCast(prop)}>
            <mesh position={[0, GROUND_Y.foundation, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[prop.size.w, prop.size.d]} />
              {foundationTex ? (
                <meshStandardMaterial map={foundationTex} color={tint} transparent alphaTest={0.1} />
              ) : (
                <meshStandardMaterial color={colorFor(prop)} />
              )}
            </mesh>
          </group>
        );
      })}
      {standing.map((prop) => {
        const texture = spriteFor(prop);
        const { w, h } = spriteSizeFor(prop);
        const shadow = shadowFootprint(prop.size);
        const register = (obj: THREE.Object3D | null) => {
          if (prop.kind !== "building") return;
          if (obj) {
            obj.userData.h = h;
            obj.userData.box = !texture;
            obj.userData.boxH = prop.size.h;
            buildingObjects.current.set(prop.id, obj);
          } else {
            buildingObjects.current.delete(prop.id);
          }
        };
        if (texture) {
          return (
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...siteCast(prop)}>
              <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
              <sprite ref={register} position={[0, h / 2, 0]} scale={[w, h, 1]}>
                <spriteMaterial map={texture} color={tint} transparent alphaTest={0.1} />
              </sprite>
            </group>
          );
        }
        if (prop.kind === "decor") return null; // a decor figure that failed to rasterise never falls back to a box
        // No texture for this prop (a barrier, or a figure that failed to draw): the slice 4 box.
        return (
          <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...siteCast(prop)}>
            <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
            <mesh ref={register} position={[0, prop.size.h / 2, 0]}>
              <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
              <meshStandardMaterial color={colorFor(prop)} />
            </mesh>
          </group>
        );
      })}
      {shown.map((v) => (
        <group
          key={v.id}
          ref={(el) => {
            if (el) villagerGroups.current.set(v.id, el);
            else villagerGroups.current.delete(v.id);
          }}
          position={[v.position.x, 0, v.position.z]}
        >
          <ContactShadow w={HERO_SHADOW.w} d={HERO_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
          <sprite position={[0, SPRITE_H / 2, 0]} scale={[SPRITE_W, SPRITE_H, 1]} onPointerDown={castHandler}>
            <spriteMaterial map={textures.villagers[v.id]} transparent alphaTest={0.1} />
          </sprite>
          <Html position={[0, SPRITE_H + 0.35, 0]} center zIndexRange={[12, 0]}>
            <VillagerPlate
              villager={v}
              surfaces={surfaces}
              calm={settings.calmPalette}
              motion={settings.motion}
              // In reach the plate is the same door the bubble's Talk button and `E` are, and
              // out of reach it says so rather than going quiet. It used to walk the hero over
              // and talk on arrival, which was tap-to-move wearing a nameplate. One gate, in
              // the plate, so the announcement and the refusal can never disagree.
              inReach={reachId === v.id}
              onPick={onTalk}
            />
          </Html>
        </group>
      ))}
      {layout.props.filter((prop) => prop.kind === "banner").map((prop) => (
        <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
          <mesh position={[0, prop.size.h / 2, 0]}>
            <boxGeometry args={[0.12, prop.size.h, 0.12]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
          {textures.castleBanner && (
            <sprite position={[0.4, prop.size.h - 0.1, 0]} scale={[0.9, 0.7, 1]}>
              <spriteMaterial map={textures.castleBanner} color={prop.color} transparent alphaTest={0.1} />
            </sprite>
          )}
        </group>
      ))}
      <SpellLayer sim={simRef} textures={textures} calm={settings.calmPalette} motion={settings.motion} />
      <RecessLayer sim={recessRef} textures={textures} calm={settings.calmPalette} motion={settings.motion} />
      <CeremonyLayer sim={ceremonyRef} heroRef={hero} textures={textures} calm={settings.calmPalette} motion={settings.motion} />
      {reachVillager && reachPlacement && interactive && (
        <Html position={[reachPlacement.position.x, SPRITE_H + 0.9, reachPlacement.position.z]} center zIndexRange={[15, 0]}>
          {/*
            The greeting paragraph is gone: it was the SiteCard's subtitle
            verbatim, read twice, and it covered the villager it belonged to.
            What is left is one thing to press, at the size a six-year-old's
            thumb needs.
          */}
          <div
            className="realm-bubble"
            role="group"
            aria-label={reachVillager.name}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="realm-bubble-talk"
              aria-label={`Talk to ${reachVillager.name}`}
              onClick={() => onTalk(reachVillager.id)}
            >
              Talk{keyHint && <span className="realm-bubble-key"> · E</span>}
            </button>
          </div>
        </Html>
      )}
      {textures.mount && (
        <>
          <group ref={mountShadow} visible={false} position={[layout.spawn.x, 0, layout.spawn.z]}>
            <ContactShadow w={MOUNT_SHADOW.w} d={MOUNT_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
          </group>
          <sprite ref={mountSprite} visible={false} scale={[SPRITE_W, SPRITE_H, 1]}>
            <spriteMaterial map={textures.mount} transparent alphaTest={0.1} />
          </sprite>
        </>
      )}
      <group ref={heroShadow} position={[layout.spawn.x, 0, layout.spawn.z]}>
        <ContactShadow w={HERO_SHADOW.w} d={HERO_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
      </group>
      {/* The hero's own mark: a gold ring with a 60° gap in the direction they will walk,
          and a solid arrowhead filling that gap so the cue is a positive mark and not only a hole.
          After the -π/2 X rotation, local +Y is world north, so the group's local-Z rotation is facingAngle(). */}
      <group ref={heroRing} position={[layout.spawn.x, GROUND_Y.heroRing, layout.spawn.z]} rotation={[-Math.PI / 2, 0, facingAngle("s")]}>
        <mesh>
          <ringGeometry args={[RING_INNER, RING_OUTER, 32, 1, Math.PI / 2 + RING_NOTCH_ARC / 2, Math.PI * 2 - RING_NOTCH_ARC]} />
          <meshBasicMaterial color={ringColor} transparent depthWrite={false} />
        </mesh>
        <mesh position={[0, RING_OUTER + 0.06, 0]}>
          <circleGeometry args={[0.16, 3, Math.PI / 2]} />
          <meshBasicMaterial color={ringColor} transparent depthWrite={false} />
        </mesh>
      </group>
      <sprite ref={heroSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
        <spriteMaterial map={textures.hero} transparent alphaTest={0.1} />
      </sprite>
      {textures.companion && (
        <>
          <group ref={companionShadow} position={[layout.spawn.x, 0, layout.spawn.z + 1.2]}>
            <ContactShadow w={COMPANION_SHADOW.w} d={COMPANION_SHADOW.d} y={GROUND_Y.figureShadow} calm={settings.calmPalette} />
          </group>
          <sprite ref={companionSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z + 1.2]} scale={[SPRITE_W, SPRITE_H, 1]}>
            <spriteMaterial map={textures.companion} transparent alphaTest={0.1} />
          </sprite>
        </>
      )}
    </>
  );
});

export default function RealmScene(props: RealmSceneProps) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
      <World {...props} />
    </Canvas>
  );
}
