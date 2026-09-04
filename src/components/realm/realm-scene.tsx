"use client";

import "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";
import { WORLD_SIZE, type WorldLayout, type Vec2 } from "@/lib/realm/layout";
import { setTarget, stepCompanion, stepHero, type CompanionState, type HeroState } from "@/lib/realm/movement";
import { CAMERA_OFFSET, CAMERA_ZOOM, followCamera } from "@/lib/realm/camera";
import type { RenderSettings } from "@/lib/realm/render-settings";
import type { SpriteTextures } from "./sprite-source";

type Props = { layout: WorldLayout; textures: SpriteTextures; settings: RenderSettings; axisRef: RefObject<Vec2> };

const SPRITE_W = 1.5;
const SPRITE_H = 2;

function World({ layout, textures, settings, axisRef }: Props) {
  // Per-frame state lives in refs: nothing here re-renders React sixty times a second.
  const hero = useRef<HeroState>({ position: layout.spawn, facing: "s", target: null });
  const companion = useRef<CompanionState>({ position: { x: layout.spawn.x, z: layout.spawn.z + 1.2 } });
  const camTarget = useRef<Vec2>({ ...layout.spawn });
  const heroSprite = useRef<THREE.Sprite>(null);
  const companionSprite = useRef<THREE.Sprite>(null);
  const camera = useRef<THREE.OrthographicCamera>(null);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // a tab that was hidden must not teleport the hero on return
    hero.current = stepHero(hero.current, { axis: axisRef.current ?? { x: 0, z: 0 } }, dt, layout.colliders);
    companion.current = stepCompanion(companion.current, hero.current, dt);
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
  });

  const ground = settings.calmPalette ? "#3b4a3f" : "#2e5a3a";
  const sky = settings.calmPalette ? "#101820" : "#0a1220";

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
          hero.current = setTarget(hero.current, { x: e.point.x, z: e.point.z }, layout.colliders);
        }}
      >
        {/* Visual only: the ground plane is drawn larger than the playable world so its edge never shows past the backdrop. */}
        <planeGeometry args={[WORLD_SIZE * 3, WORLD_SIZE * 3]} />
        <meshStandardMaterial color={ground} />
      </mesh>
      {layout.props.map((prop) => (
        <group key={prop.id} position={[prop.position.x, prop.size.h / 2, prop.position.z]}>
          <mesh>
            <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
            <meshStandardMaterial color={prop.color} />
          </mesh>
          {prop.kind !== "path" && (
            <Html position={[0, prop.size.h / 2 + 0.6, 0]} center zIndexRange={[10, 0]}>
              <span className="realm-label">{prop.label}</span>
            </Html>
          )}
        </group>
      ))}
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

export default function RealmScene(props: Props) {
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
      <World {...props} />
    </Canvas>
  );
}
