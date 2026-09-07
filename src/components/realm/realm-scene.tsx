"use client";

import "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, type Prop, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, unstickHero, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import { nearestVillager, villagerById } from "@/lib/realm/villagers";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { SpellDefinition } from "@/lib/utils/spell-catalog";
import type { CastRequest } from "./use-realm-input";
import type { TroubleSkin } from "@/lib/realm/spells/troubles";
import { stepSpellSim, useSpellSimRef, type SpellEvent } from "./use-spell-sim";
import { SpellLayer } from "./spell-layer";
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
};

const SPRITE_W = 1.5;
const SPRITE_H = 2;
export const RISE_MS = 900;
const CALM_FOUNDATION = "#5a5750";

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function World({ layout, textures, settings, axisRef, interactive, reachId, onReachChange, onTalk, risingId, selectedSpell, selectedSlot, castRef, spellsEnabled, onSpellEvent, seed }: RealmSceneProps) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const reachRef = useRef<string | null>(null);
  const buildingMeshes = useRef(new Map<string, THREE.Mesh>());
  const rising = useRef<{ id: string; startedAt: number } | null>(null);
  const wasInteractive = useRef(interactive);
  const simRef = useSpellSimRef();
  const dazzledRef = useRef(false);
  const castingRef = useRef(false);
  const frozenRef = useRef(false); // dazzled or mid-cast; read by onPointerDown too

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

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // a tab that was hidden must not teleport the hero on return
    // Read and clear unconditionally: a cast request queued an instant before a
    // panel opened this frame must not fire later, once the world is interactive again.
    const request = castRef.current;
    castRef.current = null;
    if (interactive) {
      const frozen = dazzledRef.current || castingRef.current;
      frozenRef.current = frozen;
      // While frozen, a walk target (from a tap that landed the same frame the
      // freeze began, or one queued moments earlier) is dropped every frame,
      // not just on the transition into frozen.
      if (frozen && hero.current.target) hero.current = { ...hero.current, target: null };
      hero.current = stepHero(hero.current, { axis: frozen ? { x: 0, z: 0 } : axisRef.current ?? { x: 0, z: 0 } }, dt, layout.colliders);
      companion.current = stepCompanion(companion.current, hero.current, dt);
      const stepped = stepSpellSim(
        simRef.current,
        { layout, hero: hero.current.position, dt, selectedSpell: spellsEnabled ? selectedSpell : null, selectedSlot: spellsEnabled ? selectedSlot : null, castRequest: spellsEnabled ? request : null, lowStimulus: settings.calmPalette, reducedMotion: !settings.motion, seed },
        (e) => queueMicrotask(() => onSpellEvent(e))
      );
      simRef.current = stepped.sim;
      dazzledRef.current = stepped.dazzled;
      castingRef.current = stepped.casting;
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
      heroSprite.current.position.set(p.x, SPRITE_H / 2 + bob, p.z);
      heroSprite.current.scale.set(hero.current.facing === "w" ? -SPRITE_W : SPRITE_W, SPRITE_H, 1);
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
      {layout.props.filter((prop) => prop.kind !== "villager").map((prop) => (
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
          <sprite key={v.id} position={[v.position.x, SPRITE_H / 2, v.position.z]} scale={[SPRITE_W, SPRITE_H, 1]}>
            <spriteMaterial map={texture} transparent alphaTest={0.1} />
          </sprite>
        );
      })}
      <SpellLayer sim={simRef} textures={textures} calm={settings.calmPalette} motion={settings.motion} />
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
}

export default function RealmScene(props: RealmSceneProps) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
      <World {...props} />
    </Canvas>
  );
}
