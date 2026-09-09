"use client";

import "@react-three/fiber";
import { memo, useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, type Prop, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, unstickHero, setMounted, HERO_SPEED, COMPANION_GAP_MOUNTED, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import { nearestVillager, villagerById } from "@/lib/realm/villagers";
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
const CALM_FOUNDATION = "#5a5750";

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

const World = memo(function World({ layout, textures, settings, axisRef, interactive, reachId, onReachChange, onTalk, risingId, selectedSpell, selectedSlot, castRef, spellsEnabled, onSpellEvent, seed, riding, mountSpeed, recessActive, onRecessEvent, ceremonyActive, ceremonySkipRef, onCeremonyEvent }: RealmSceneProps) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null, mounted: false });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const mountSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const reachRef = useRef<string | null>(null);
  const buildingMeshes = useRef(new Map<string, THREE.Mesh>());
  const rising = useRef<{ id: string; startedAt: number } | null>(null);
  const wasInteractive = useRef(interactive);
  const simRef = useSpellSimRef();
  const recessRef = useRecessSimRef();
  const dazzledRef = useRef(false);
  const castingRef = useRef(false);
  const frozenRef = useRef(false); // dazzled or mid-cast; read by onPointerDown too
  const ceremonyRef = useRef<CeremonyState | null>(null);
  const villagerSprites = useRef(new Map<string, THREE.Sprite>());

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
    const c = companion.current.position;
    if (companionSprite.current) {
      companionSprite.current.position.set(c.x, SPRITE_H / 2 + bob * 0.5, c.z);
      companionSprite.current.scale.set(c.x > p.x ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
    }
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
    const r = rising.current;
    if (r) {
      const mesh = buildingMeshes.current.get(r.id);
      const k = Math.min(1, (performance.now() - r.startedAt) / RISE_MS);
      const s = 0.1 + 0.9 * easeOut(k);
      if (mesh) {
        mesh.scale.y = s;
        mesh.position.y = (mesh.userData.h as number) * (s - 1) / 2; // keep the base on the ground while it grows
      }
      if (k >= 1) rising.current = null;
    }
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";
  const colorFor = (prop: Prop) => (prop.kind === "foundation" && settings.calmPalette ? CALM_FOUNDATION : prop.color);
  const reachVillager = reachId ? villagerById(reachId) : null;
  const reachPlacement = reachId ? layout.villagers.find((v) => v.id === reachId) ?? null : null;

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
          hero.current = setTarget(hero.current, { x: e.point.x, z: e.point.z }, layout.colliders);
        }}
      >
        {/* Visual only: the ground plane is drawn larger than the playable world so its edge never shows past the backdrop. */}
        <planeGeometry args={[WORLD_SIZE * 3, WORLD_SIZE * 3]} />
        <meshStandardMaterial color={ground} />
      </mesh>
      {layout.props.filter((prop) => prop.kind !== "villager" && prop.kind !== "banner").map((prop) => (
        <group key={prop.id} position={[prop.position.x, prop.size.h / 2, prop.position.z]}>
          <mesh
            ref={(mesh) => {
              if (prop.kind !== "building") return;
              if (mesh) {
                mesh.userData.h = prop.size.h;
                buildingMeshes.current.set(prop.id, mesh);
              } else {
                buildingMeshes.current.delete(prop.id);
              }
            }}
          >
            <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
            <meshStandardMaterial color={colorFor(prop)} />
          </mesh>
          {prop.kind !== "path" && (
            <Html position={[0, prop.size.h / 2 + 0.6, 0]} center zIndexRange={[10, 0]}>
              <span className="realm-label">
                {prop.label}
                {prop.tag && <span className="realm-label-tag">{prop.tag}</span>}
              </span>
            </Html>
          )}
        </group>
      ))}
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
          <div
            className="realm-bubble"
            role="group"
            aria-label={reachVillager.name}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="realm-bubble-text">{reachVillager.greeting}</p>
            <button type="button" className="realm-bubble-talk" onClick={() => onTalk(reachVillager.id)}>Talk</button>
          </div>
        </Html>
      )}
      {textures.mount && (
        <sprite ref={mountSprite} visible={false} scale={[SPRITE_W, SPRITE_H, 1]}>
          <spriteMaterial map={textures.mount} transparent alphaTest={0.1} />
        </sprite>
      )}
      <sprite ref={heroSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
        <spriteMaterial map={textures.hero} transparent alphaTest={0.1} />
      </sprite>
      {textures.companion && (
        <sprite ref={companionSprite} position={[layout.spawn.x, SPRITE_H / 2, layout.spawn.z + 1.2]} scale={[SPRITE_W, SPRITE_H, 1]}>
          <spriteMaterial map={textures.companion} transparent alphaTest={0.1} />
        </sprite>
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
