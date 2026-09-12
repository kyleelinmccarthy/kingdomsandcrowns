"use client";

import "@react-three/fiber";
import { memo, useCallback, useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, spriteSizeFor, type Prop, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, unstickHero, setMounted, HERO_SPEED, COMPANION_GAP_MOUNTED, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import { facingAngle, GROUND_Y, shadowFootprint, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM } from "@/lib/realm/markers";
import { nearestVillager, villagerById, villagerForBuilding } from "@/lib/realm/villagers";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import type { CastRequest } from "./use-realm-input";
import type { TroubleSkin } from "@/lib/realm/spells/troubles";
import { stepSpellSim, useSpellSimRef, type SpellEvent } from "./use-spell-sim";
import { stepRecessSim, useRecessSimRef, type RecessSimEvent } from "./use-recess-sim";
import { SpellLayer } from "./spell-layer";
import { RecessLayer } from "./recess-layer";
import { CeremonyLayer } from "./ceremony-layer";
import { startCeremony, stepCeremony, skipCeremony, type CeremonyEvent, type CeremonyState } from "@/lib/realm/ceremony/ceremony";
import type { SpriteTextures } from "./sprite-source";

export type RealmSceneProps = {
  layout: WorldLayout;
  textures: SpriteTextures;
  settings: RenderSettings;
  axisRef: RefObject<Vec2>;
  interactive: boolean; // false while a panel is open: ground taps are ignored
  reachId: string | null; // the villager the hero can talk to, as the shell last heard it
  onReachChange: (id: string | null) => void;
  onTalk: (villagerId: string) => void;
  // A tap on a villager, on a villager's nameplate, or on a site. The shell
  // passes the same door `onTalk` opens; they are two props so a later slice
  // can tell a pointer from a keypress without rewiring the scene.
  onVillagerPick: (villagerId: string) => void;
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
};

const SPRITE_W = 1.5;
const SPRITE_H = 2;
export const RISE_MS = 900;
/**
 * How long a tap on a distant villager stays queued. A talk that fires four
 * seconds after the child's mind moved on is worse than no talk at all.
 */
const PENDING_TALK_MS = 8000;
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
 * The flat diamond a figure or a prop drops on the ground: a 4-segment circle
 * is an axis-aligned diamond, scaled to the footprint so a building's shadow is
 * its plan and never a bar. It is a child of the thing it belongs to and sits at
 * a named rung of GROUND_Y — and it never takes `bob`, which is the one detail
 * that turns "floating" into "standing" (D1.3, D1.4).
 */
function ContactShadow({ w, d, y, calm }: { w: number; d: number; y: number; calm: boolean }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, d, 1]}>
      <circleGeometry args={[0.5, 4]} />
      <meshBasicMaterial
        color="#000000"
        transparent
        opacity={calm ? SHADOW_OPACITY_CALM : SHADOW_OPACITY}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

function PropLabel({ prop, y }: { prop: Prop; y: number }) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[10, 0]}>
      <span className="realm-label">
        {prop.label}
        {prop.tag && <span className="realm-label-tag">{prop.tag}</span>}
      </span>
    </Html>
  );
}

const World = memo(function World({ layout, textures, settings, axisRef, interactive, reachId, onReachChange, onTalk, onVillagerPick, risingId, selectedSpell, selectedSlot, castRef, spellsEnabled, onSpellEvent, seed, riding, mountSpeed, recessActive, onRecessEvent, ceremonyActive, ceremonySkipRef, onCeremonyEvent }: RealmSceneProps) {
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
  const wasInteractive = useRef(interactive);
  const simRef = useSpellSimRef();
  const recessRef = useRecessSimRef();
  const dazzledRef = useRef(false);
  const castingRef = useRef(false);
  const frozenRef = useRef(false); // dazzled or mid-cast; read by onPointerDown too
  const ceremonyRef = useRef<CeremonyState | null>(null);
  const villagerSprites = useRef(new Map<string, THREE.Sprite>());
  const pendingTalk = useRef<{ id: string; until: number } | null>(null);
  const heroShadow = useRef<THREE.Group>(null);
  const mountShadow = useRef<THREE.Group>(null);
  const companionShadow = useRef<THREE.Group>(null);
  const heroRing = useRef<THREE.Group>(null);

  // A completed building scales up from the ground once; with motion off it simply appears.
  useEffect(() => {
    if (!risingId) return;
    rising.current = settings.motion ? { id: risingId, startedAt: performance.now() } : null;
  }, [risingId, settings.motion]);

  // A foundation the hero was standing on can become a solid building between
  // frames; step them out rather than leaving them entombed inside it.
  useEffect(() => {
    hero.current = unstickHero(hero.current, layout.colliders);
  }, [layout.colliders]);

  // Mounting/dismounting drops any walk target; the flag itself only ever changes here.
  useEffect(() => {
    hero.current = setMounted(hero.current, riding);
  }, [riding]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // a tab that was hidden must not teleport the hero on return
    // Read and clear unconditionally: a cast request queued an instant before a
    // panel opened this frame must not fire later, once the world is interactive again.
    const request = castRef.current;
    castRef.current = null;
    // A pending talk belongs to the walking hero alone: the deed panel opening,
    // the help card opening and the crown ceremony starting each cancel it.
    if (pendingTalk.current && (!interactive || ceremonyActive)) pendingTalk.current = null;
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
      for (const [id, sprite] of villagerSprites.current) {
        const v = r.state.villagers[id];
        if (v) sprite.position.set(v.x, SPRITE_H / 2, v.z);
      }
      if (r.state.step === "done") {
        // The people return to their sites, where Talk expects them.
        for (const v of layout.villagers) villagerSprites.current.get(v.id)?.position.set(v.position.x, SPRITE_H / 2, v.position.z);
      }
    } else if (interactive) {
      const frozen = dazzledRef.current || castingRef.current;
      frozenRef.current = frozen;
      // While frozen, a walk target (from a tap that landed the same frame the
      // freeze began, or one queued moments earlier) is dropped every frame,
      // not just on the transition into frozen.
      if (frozen && hero.current.target) hero.current = { ...hero.current, target: null };
      hero.current = stepHero(hero.current, { axis: frozen ? { x: 0, z: 0 } : axisRef.current ?? { x: 0, z: 0 } }, dt, layout.colliders, riding ? mountSpeed : HERO_SPEED);
      companion.current = stepCompanion(companion.current, hero.current, dt, riding ? { gap: COMPANION_GAP_MOUNTED, speed: mountSpeed + 0.5 } : undefined);
      const stepped = stepSpellSim(
        simRef.current,
        { layout, hero: hero.current.position, dt, selectedSpell: spellsEnabled ? selectedSpell : null, selectedSlot: spellsEnabled ? selectedSlot : null, castRequest: spellsEnabled ? request : null, lowStimulus: settings.calmPalette, reducedMotion: !settings.motion, seed },
        (e) => queueMicrotask(() => onSpellEvent(e))
      );
      simRef.current = stepped.sim;
      dazzledRef.current = stepped.dazzled;
      castingRef.current = stepped.casting;
      recessRef.current = stepRecessSim(
        recessRef.current,
        { layout, hero: hero.current.position, dt, active: recessActive, lowStimulus: settings.calmPalette, seed },
        (e) => queueMicrotask(() => onRecessEvent(e))
      );
    } else if (wasInteractive.current) {
      // A pointerdown that reached the ground before a panel opened this frame
      // can leave a stale walk target; drop it once so the hero doesn't creep
      // toward it while the panel is up.
      hero.current = { ...hero.current, target: null };
    }
    wasInteractive.current = interactive;
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
      heroShadow.current.visible = !riding; // the mount's wider shadow stands in for both while mounted
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
    // Reach is reported only when it changes, and outside the frame loop, so React never sets state mid-render.
    const near = nearestVillager(p, layout.villagers);
    if (near !== reachRef.current) {
      reachRef.current = near;
      queueMicrotask(() => onReachChange(near));
    }
    // A tap on a distant villager becomes a talk on arrival — fired through
    // queueMicrotask, never as a synchronous setState from useFrame.
    const pending = pendingTalk.current;
    if (pending) {
      if (near === pending.id) {
        pendingTalk.current = null;
        queueMicrotask(() => onVillagerPick(pending.id));
      } else if (performance.now() >= pending.until || hero.current.target === null) {
        // The deadline passed, or `stepHero` dropped a target it could not reach.
        pendingTalk.current = null;
      }
    }
    const r = rising.current;
    if (r) {
      const obj = buildingObjects.current.get(r.id);
      const k = Math.min(1, (performance.now() - r.startedAt) / RISE_MS);
      const s = 0.1 + 0.9 * easeOut(k);
      if (obj) {
        if (obj.userData.box) {
          obj.scale.y = s;
          obj.position.y = ((obj.userData.boxH as number) * s) / 2; // the box's centre rises with it, base on the ground
        } else {
          const h = obj.userData.h as number;
          obj.scale.y = h * s;
          obj.position.y = (h * s) / 2;
        }
      }
      if (k >= 1) rising.current = null;
    }
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";
  const colorFor = (prop: Prop) => (prop.kind === "foundation" && settings.calmPalette ? CALM_FOUNDATION : prop.color);
  const reachVillager = reachId ? villagerById(reachId) : null;
  const reachPlacement = reachId ? layout.villagers.find((v) => v.id === reachId) ?? null : null;
  // One pick, wherever the child aimed it: a villager's sprite, a villager's
  // nameplate, a site's building or its bare foundation. In reach it talks;
  // otherwise it walks the hero over and the frame loop talks on arrival.
  const pickVillager = useCallback((id: string, point: Vec2) => {
    if (!interactive) return;
    if (selectedSpell) {
      // A page is selected: the tap casts where it landed, exactly as the ground
      // does. stopPropagation means the ground mesh never sees this one.
      castRef.current = { target: point };
      return;
    }
    if (reachRef.current === id) {
      onVillagerPick(id);
      return;
    }
    const v = layout.villagers.find((s) => s.id === id);
    if (!v) return;
    pendingTalk.current = { id, until: performance.now() + PENDING_TALK_MS };
    // The approach point is one unit toward spawn. `setTarget` refuses a point
    // inside a collider and hands back the state unchanged; a villager's own
    // square is never a collider, so that is the retry that always works.
    const before = hero.current;
    const walked = setTarget(before, { x: v.position.x, z: v.position.z + 1 }, layout.colliders);
    hero.current = walked === before ? setTarget(before, v.position, layout.colliders) : walked;
  }, [interactive, selectedSpell, onVillagerPick, layout, castRef]);
  // stopPropagation first, so the tap never falls through to the ground mesh and
  // walks the hero vaguely nearby instead of to the person they pointed at.
  const pickHandler = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0 && e.button !== 2) return; // left and right pick or cast; the wheel does nothing
    pickVillager(id, { x: e.point.x, z: e.point.z });
  };
  // Tapping the well's foundation walks you to Old Bram. With no villager on a
  // site (the kingdom failed to load) no handler is attached at all, so the tap
  // still reaches the ground and the hero still walks.
  const sitePick = (prop: Prop): { onPointerDown?: (e: ThreeEvent<PointerEvent>) => void } => {
    if (prop.kind !== "building" && prop.kind !== "foundation") return {};
    const v = villagerForBuilding(prop.id);
    if (!v || !layout.villagers.some((s) => s.id === v.id)) return {};
    return { onPointerDown: pickHandler(v.id) };
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
  const keyHint = !settings.showStick; // `Talk · Enter` for a keyboard, a plain `Talk` for a thumb

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
          if (e.button !== 0 && e.button !== 2) return; // left and right buttons walk or cast; the wheel does nothing
          if (!interactive) return;
          if (selectedSpell) {
            castRef.current = { target: { x: e.point.x, z: e.point.z } };
            return;
          }
          if (frozenRef.current) return; // dazzled or mid-cast: a tap must not queue a walk target
          const before = hero.current;
          const walked = setTarget(before, { x: e.point.x, z: e.point.z }, layout.colliders);
          // A tap on open ground REPLACES the target rather than nulling it, so none
          // of the frame loop's five clears see it. Only a redirect that actually
          // takes (not one a wall refused) cancels a villager the hero was walking
          // toward — the frame loop can't tell "replaced by a tap" from "still
          // being pursued," so this has to live beside the setTarget call that
          // owns the redirect, not as a sixth condition there.
          if (walked !== before) pendingTalk.current = null;
          hero.current = walked;
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
      {layout.props.filter((p) => p.kind === "foundation").map((prop) => {
        const foundationTex = worldTex("foundation");
        return (
          <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
            <mesh position={[0, GROUND_Y.foundation, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[prop.size.w, prop.size.d]} />
              {foundationTex ? (
                <meshStandardMaterial map={foundationTex} color={tint} transparent alphaTest={0.1} />
              ) : (
                <meshStandardMaterial color={colorFor(prop)} />
              )}
            </mesh>
            <PropLabel prop={prop} y={0.8} />
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
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
              <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
              <sprite ref={register} position={[0, h / 2, 0]} scale={[w, h, 1]}>
                <spriteMaterial map={texture} color={tint} transparent alphaTest={0.1} />
              </sprite>
              {prop.kind !== "decor" && <PropLabel prop={prop} y={h + 0.4} />}
            </group>
          );
        }
        if (prop.kind === "decor") return null; // a decor figure that failed to rasterise never falls back to a box
        // No texture for this prop (a barrier, or a figure that failed to draw): the slice 4 box.
        return (
          <group key={prop.id} position={[prop.position.x, 0, prop.position.z]} {...sitePick(prop)}>
            <ContactShadow w={shadow.w} d={shadow.d} y={GROUND_Y.propShadow} calm={settings.calmPalette} />
            <mesh ref={register} position={[0, prop.size.h / 2, 0]}>
              <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
              <meshStandardMaterial color={colorFor(prop)} />
            </mesh>
            {prop.kind !== "barrier" && <PropLabel prop={prop} y={prop.size.h + 0.6} />}
          </group>
        );
      })}
      {layout.villagers.map((v) => {
        const texture = textures.villagers[v.id];
        if (!texture) return null;
        return (
          <sprite
            key={v.id}
            ref={(el) => {
              if (el) villagerSprites.current.set(v.id, el);
              else villagerSprites.current.delete(v.id);
            }}
            position={[v.position.x, SPRITE_H / 2, v.position.z]}
            scale={[SPRITE_W, SPRITE_H, 1]}
            onPointerDown={pickHandler(v.id)}
          >
            <spriteMaterial map={texture} transparent alphaTest={0.1} />
          </sprite>
        );
      })}
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
              Talk{keyHint && <span className="realm-bubble-key"> · Enter</span>}
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
