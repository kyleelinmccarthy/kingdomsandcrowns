"use client";

/**
 * SPIKE — throwaway. The child's own avatar, as geometry.
 *
 * `hero-look.ts` has already flattened the catalog to a handful of silhouette families; this
 * file is the other half — one chunky low-poly figure that wears them. Everything here is
 * primitives, because the thing being judged is whether a child walking around says "that's me",
 * and at this camera distance that answer is decided by hair shape, body shape, a cape, a crown,
 * and the colours they picked. Nothing finer survives the trip to the screen.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HairShape, HeroLook } from "@/lib/realm3d/hero-look";
import { heightAt } from "@/lib/realm3d/heightfield";

/** Written by the mover each frame: how fast (0..1 of top speed) and where in the walk cycle. */
export type Gait = { speed: number; phase: number };

/* ------------------------------------------------------------ proportions */

const FOOT_TOP = 0.26;
const HIP = 0.95;
const TORSO_TOP = 1.7;
const SHOULDER = 1.6;
const HEAD_Y = 1.98;
const HEAD_W = 0.58;
const HEAD_H = 0.56;
const HEAD_D = 0.54;
const HEAD_TOP = HEAD_Y + HEAD_H / 2;
const FACE = HEAD_D / 2 + 0.01;

/** Where a hat sits, given what the hair does to the top of the head. */
const HAIR_LIFT: Record<HairShape, number> = {
  cap: 0.1, long: 0.1, tail: 0.1, twin: 0.12, spiky: 0.24, puff: 0.42, bun: 0.34,
};

const DARK = "#241c16";

function mix(hex: string, other: string, t: number): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(other), t).getHexString()}`;
}

function shade(hex: string, t = 0.28): string {
  return mix(hex, "#1b1a22", t);
}

/* ------------------------------------------------------------------ parts */

function Flat({ color, ...rest }: { color: string } & Record<string, unknown>) {
  return <meshStandardMaterial color={color} flatShading roughness={0.82} {...rest} />;
}

function Steel({ color }: { color: string }) {
  return <meshStandardMaterial color={color} flatShading roughness={0.38} metalness={0.62} />;
}

function Hair({ shape, color }: { shape: HairShape; color: string }) {
  const cap = (
    <>
      <mesh castShadow position={[0, HEAD_TOP - 0.05, -0.01]}>
        <boxGeometry args={[HEAD_W + 0.05, 0.19, HEAD_D + 0.05]} />
        <Flat color={color} />
      </mesh>
      {/* a fringe, so the face has a top edge and does not read as a bare block */}
      <mesh castShadow position={[0, HEAD_Y + 0.15, FACE - 0.01]}>
        <boxGeometry args={[HEAD_W + 0.04, 0.12, 0.08]} />
        <Flat color={color} />
      </mesh>
    </>
  );
  switch (shape) {
    case "long":
      return (
        <>
          {cap}
          <mesh castShadow position={[0, HEAD_Y - 0.24, -(HEAD_D / 2 + 0.06)]}>
            <boxGeometry args={[HEAD_W - 0.02, 0.82, 0.14]} />
            <Flat color={color} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[(s * (HEAD_W + 0.06)) / 2, HEAD_Y - 0.06, -0.06]}>
              <boxGeometry args={[0.1, 0.5, HEAD_D * 0.8]} />
              <Flat color={color} />
            </mesh>
          ))}
        </>
      );
    case "spiky":
      return (
        <>
          {cap}
          {[-0.2, 0, 0.2].map((x, i) => (
            <mesh key={i} castShadow position={[x, HEAD_TOP + 0.12, -0.04 + i * 0.03]} rotation={[-0.3, 0, x * 1.4]}>
              <coneGeometry args={[0.12, 0.34, 5]} />
              <Flat color={color} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.26, HEAD_TOP + 0.02, -0.16]} rotation={[-0.5, 0, s * 0.9]}>
              <coneGeometry args={[0.1, 0.26, 5]} />
              <Flat color={color} />
            </mesh>
          ))}
        </>
      );
    case "puff":
      return (
        <mesh castShadow position={[0, HEAD_Y + 0.31, -0.09]}>
          <icosahedronGeometry args={[0.43, 0]} />
          <Flat color={color} />
        </mesh>
      );
    case "tail":
      return (
        <>
          {cap}
          <mesh castShadow position={[0, HEAD_Y - 0.14, -0.38]} rotation={[0.38, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.07, 0.72, 6]} />
            <Flat color={color} />
          </mesh>
        </>
      );
    case "bun":
      return (
        <>
          {cap}
          <mesh castShadow position={[0, HEAD_TOP + 0.16, -0.05]}>
            <icosahedronGeometry args={[0.21, 0]} />
            <Flat color={color} />
          </mesh>
        </>
      );
    case "twin":
      return (
        <>
          {cap}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.38, HEAD_Y + 0.02, -0.06]}>
              <icosahedronGeometry args={[0.2, 0]} />
              <Flat color={color} />
            </mesh>
          ))}
        </>
      );
    default:
      return cap;
  }
}

function Leg({ look, side, swingRef }: { look: HeroLook; side: number; swingRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = swingRef.current * side;
  });
  const bare = look.legs.shape === "skirt";
  const shortLeg = look.legs.shape === "shorts";
  const skin = look.skin;
  const legColor = look.legs.metal ? mix(look.legs.color, "#9aa3ad", 0.5) : look.legs.color;
  const bootH = look.feet.shape === "tall" ? 0.46 : look.feet.shape === "shoe" ? 0.14 : 0.3;

  return (
    <group ref={g} position={[side * 0.17, HIP, 0]}>
      {bare ? (
        <mesh castShadow position={[0, -0.36, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.22]} />
          <Flat color={skin} />
        </mesh>
      ) : shortLeg ? (
        <>
          <mesh castShadow position={[0, -0.2, 0]}>
            <boxGeometry args={[0.24, 0.36, 0.26]} />
            <Flat color={legColor} />
          </mesh>
          <mesh castShadow position={[0, -0.52, 0]}>
            <boxGeometry args={[0.2, 0.34, 0.22]} />
            <Flat color={skin} />
          </mesh>
        </>
      ) : (
        <mesh castShadow position={[0, -0.36, 0]}>
          <boxGeometry args={[0.23, 0.72, 0.25]} />
          {look.legs.metal ? <Steel color={legColor} /> : <Flat color={legColor} />}
        </mesh>
      )}
      {/* the foot, hung off the same hip so it swings with the leg */}
      <mesh castShadow position={[0, -HIP + FOOT_TOP - 0.13 + bootH / 2, 0.04]}>
        <boxGeometry args={[0.27, bootH, 0.36]} />
        <Flat color={look.feet.color} />
      </mesh>
      {look.feet.winged &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.16, -HIP + 0.3, -0.06]} rotation={[0, 0, s * 0.5]}>
            <boxGeometry args={[0.22, 0.14, 0.04]} />
            <meshStandardMaterial color="#f4f8ff" flatShading emissive="#bcd9ff" emissiveIntensity={0.35} />
          </mesh>
        ))}
    </group>
  );
}

function Arm({ look, side, swingRef }: { look: HeroLook; side: number; swingRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = -swingRef.current * side;
  });
  // A shade off the body on purpose: same colour and the arms vanish into the torso.
  const sleeve = look.outfit.metal
    ? mix(look.outfit.color, "#9aa3ad", 0.45)
    : mix(look.outfit.color, "#ffffff", 0.08);
  const wide = look.outfit.shape === "robe";
  return (
    <group ref={g} position={[side * 0.4, SHOULDER, 0]} rotation={[0, 0, side * 0.07]}>
      <mesh castShadow position={[0, -0.32, 0]}>
        <boxGeometry args={[wide ? 0.25 : 0.2, wide ? 0.68 : 0.64, wide ? 0.25 : 0.22]} />
        {look.outfit.metal ? <Steel color={sleeve} /> : <Flat color={sleeve} />}
      </mesh>
      <mesh castShadow position={[0, -0.72, 0.01]}>
        <boxGeometry args={[0.19, 0.18, 0.2]} />
        <Flat color={look.skin} />
      </mesh>
    </group>
  );
}

function Torso({ look }: { look: HeroLook }) {
  const { shape, color, metal } = look.outfit;
  const body = metal ? mix(color, "#9aa3ad", 0.55) : color;
  const Skin = metal ? Steel : Flat;

  if (shape === "robe") {
    // Flares to the ground and swallows the legs — the one silhouette nobody mistakes.
    return (
      <>
        <mesh castShadow receiveShadow position={[0, 0.98, 0]}>
          <cylinderGeometry args={[0.3, 0.56, 1.46, 9]} />
          <Flat color={body} />
        </mesh>
        <mesh castShadow position={[0, TORSO_TOP - 0.12, 0]}>
          <cylinderGeometry args={[0.33, 0.4, 0.26, 9]} />
          <Flat color={shade(body, 0.24)} />
        </mesh>
        <mesh position={[0, 1.18, 0]}>
          <cylinderGeometry args={[0.41, 0.41, 0.1, 9]} />
          <Flat color={shade(body, 0.4)} />
        </mesh>
      </>
    );
  }

  if (shape === "plate") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
          <boxGeometry args={[0.66, 0.8, 0.46]} />
          <Steel color={body} />
        </mesh>
        {/* the child's colour, kept where it can be seen: the tabard band and the belt */}
        <mesh position={[0, 1.24, 0.01]}>
          <boxGeometry args={[0.22, 0.66, 0.48]} />
          <Flat color={color} />
        </mesh>
        <mesh position={[0, 0.96, 0]}>
          <boxGeometry args={[0.7, 0.13, 0.5]} />
          <Flat color={shade(color, 0.2)} />
        </mesh>
      </>
    );
  }

  const tunic = (
    <>
      <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.31, 0.39, 0.8, 9]} />
        <Skin color={body} />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.11, 9]} />
        <Flat color={shade(body, 0.42)} />
      </mesh>
    </>
  );

  if (shape === "coat") {
    return (
      <>
        {tunic}
        {/* a knee-length coat, open at the front so the legs still show through */}
        <mesh castShadow position={[0, 0.7, -0.06]}>
          <cylinderGeometry args={[0.42, 0.54, 0.66, 9, 1, true, Math.PI * 0.2, Math.PI * 1.6]} />
          <meshStandardMaterial color={shade(body, 0.16)} flatShading side={THREE.DoubleSide} roughness={0.82} />
        </mesh>
      </>
    );
  }
  return tunic;
}

function Head({ look }: { look: HeroLook }) {
  const hooded = look.gear.head === "hood";
  return (
    <>
      <mesh castShadow receiveShadow position={[0, HEAD_Y, 0]}>
        <boxGeometry args={[HEAD_W, HEAD_H, HEAD_D]} />
        <Flat color={look.skin} />
      </mesh>
      {/* a neck, so the head does not float off the collar when the hero turns */}
      <mesh position={[0, TORSO_TOP - 0.02, 0]}>
        <boxGeometry args={[0.22, 0.14, 0.22]} />
        <Flat color={look.skin} />
      </mesh>
      {/* the face. It is four small dark blocks and it is the whole of Job 1 up close. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.14, HEAD_Y + 0.03, FACE]}>
          <boxGeometry args={[0.1, 0.11, 0.03]} />
          <meshStandardMaterial color={DARK} flatShading />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * 0.14, HEAD_Y + 0.15, FACE]}>
          <boxGeometry args={[0.13, 0.04, 0.03]} />
          <meshStandardMaterial color={shade(look.hair.color, 0.2)} flatShading />
        </mesh>
      ))}
      <mesh position={[0, HEAD_Y - 0.16, FACE]}>
        <boxGeometry args={[0.16, 0.04, 0.03]} />
        <meshStandardMaterial color="#7a4436" flatShading />
      </mesh>
      {look.gear.glasses && (
        <mesh position={[0, HEAD_Y + 0.03, FACE + 0.02]}>
          <boxGeometry args={[0.46, 0.13, 0.03]} />
          <meshStandardMaterial color="#2b3038" flatShading metalness={0.5} roughness={0.35} />
        </mesh>
      )}
      {!hooded && <Hair shape={look.hair.shape} color={look.hair.color} />}
      {hooded && (
        <mesh castShadow position={[0, HEAD_Y + 0.1, -0.03]}>
          <coneGeometry args={[0.48, 0.86, 8, 1, true, Math.PI * 0.55, Math.PI * 0.9]} />
          <meshStandardMaterial color={look.gear.color} flatShading side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

function HeadGearMesh({ look }: { look: HeroLook }) {
  const lift = HAIR_LIFT[look.hair.shape] ?? 0.1;
  const y = HEAD_TOP + lift;

  // An earned crown outranks any accessory, exactly as the 2D avatar draws it. It is also the
  // single most valuable object on the figure: a child who earned one should see it from orbit.
  if (look.crown) {
    const pts = Array.from({ length: look.crown.points }, (_, i) => (i / look.crown!.points) * Math.PI * 2);
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.32, 0.34, 0.15, 12]} />
          <meshStandardMaterial color={look.crown.color} flatShading metalness={0.8} roughness={0.24} emissive={look.crown.color} emissiveIntensity={0.18} />
        </mesh>
        {pts.map((a, i) => (
          <mesh key={i} castShadow position={[Math.cos(a) * 0.29, 0.19, Math.sin(a) * 0.29]}>
            <coneGeometry args={[0.07, 0.26, 5]} />
            <meshStandardMaterial color={look.crown!.color} flatShading metalness={0.8} roughness={0.24} emissive={look.crown!.color} emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>
    );
  }

  switch (look.gear.head) {
    case "circlet":
      return (
        <group position={[0, y - 0.03, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.32, 0.33, 0.1, 12]} />
            <meshStandardMaterial color={look.gear.color} flatShading metalness={0.7} roughness={0.3} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[Math.cos((i / 3) * Math.PI * 2) * 0.28, 0.12, Math.sin((i / 3) * Math.PI * 2) * 0.28]}>
              <coneGeometry args={[0.06, 0.18, 5]} />
              <meshStandardMaterial color={look.gear.color} flatShading metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "halo":
      return (
        <mesh position={[0, y + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.045, 6, 14]} />
          <meshStandardMaterial color="#fff0b8" emissive="#ffd766" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      );
    case "horns":
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.26, HEAD_Y + 0.26, -0.02]} rotation={[0, 0, s * 0.62]}>
              <coneGeometry args={[0.09, 0.34, 5]} />
              <Flat color={look.gear.color} />
            </mesh>
          ))}
        </>
      );
    case "band":
      return (
        <mesh castShadow position={[0, HEAD_Y + 0.17, 0]}>
          <boxGeometry args={[HEAD_W + 0.1, 0.11, HEAD_D + 0.1]} />
          <Flat color={look.gear.color} />
        </mesh>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------- hero */

export function HeroFigure({ look, gait }: { look: HeroLook; gait: React.RefObject<Gait> }) {
  const swing = useRef(0);
  const cape = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const g = gait.current;
    swing.current = Math.sin(g.phase) * 0.55 * g.speed;
    const c = cape.current;
    if (c) {
      // It swings. That is the entire justification for the cape: a child reads motion long
      // before they read a costume.
      const lift = 0.16 + g.speed * (0.4 + Math.sin(g.phase * 0.5) * 0.12);
      c.rotation.x = THREE.MathUtils.damp(c.rotation.x, lift, 7, dt);
      c.rotation.z = THREE.MathUtils.damp(c.rotation.z, Math.sin(g.phase * 0.5) * 0.12 * g.speed, 7, dt);
    }
  });

  const skirt = look.legs.shape === "skirt" && look.outfit.shape !== "robe";

  return (
    <>
      {/* SUN_DIR rakes from behind — right for the hills, wrong for a face. This is a small
          warm fill that rides with the hero and reaches barely past him, so the one figure a
          child is looking for is never the dullest thing on the screen. */}
      <pointLight position={[0.4, 2.2, 1.2]} intensity={3.4} distance={3.0} decay={2} color="#ffeccf" />
      <Leg look={look} side={-1} swingRef={swing} />
      <Leg look={look} side={1} swingRef={swing} />
      {skirt && (
        <mesh castShadow position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.36, 0.56, 0.54, 9]} />
          <Flat color={look.legs.color} />
        </mesh>
      )}
      <Torso look={look} />
      <Arm look={look} side={-1} swingRef={swing} />
      <Arm look={look} side={1} swingRef={swing} />
      <Head look={look} />
      <HeadGearMesh look={look} />

      {look.gear.pauldrons &&
        [-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * 0.42, SHOULDER + 0.02, 0]}>
            <icosahedronGeometry args={[0.21, 0]} />
            <meshStandardMaterial color={look.outfit.color} flatShading metalness={0.55} roughness={0.35} />
          </mesh>
        ))}

      {look.gear.charm && (
        <mesh position={[0, 1.42, 0.3]}>
          <icosahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial color={look.gear.color} emissive={look.gear.color} emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
      )}

      {look.gear.wings &&
        [-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * 0.34, 1.52, -0.26]} rotation={[0.1, s * 0.6, s * 0.34]}>
            <boxGeometry args={[0.72, 0.5, 0.06]} />
            <meshStandardMaterial color="#f2f7ff" flatShading emissive="#c9ddff" emissiveIntensity={0.45} side={THREE.DoubleSide} />
          </mesh>
        ))}

      {look.cape.on && (
        <group ref={cape} position={[0, TORSO_TOP - 0.06, -0.15]}>
          <mesh castShadow position={[0, -0.74, 0]}>
            <coneGeometry args={[0.6, 1.52, 9, 1, false, Math.PI * 0.52, Math.PI * 0.96]} />
            <meshStandardMaterial color={look.cape.color} flatShading side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.02, 0.06]}>
            <boxGeometry args={[0.44, 0.1, 0.16]} />
            <meshStandardMaterial color={look.crown?.color ?? "#d4a843"} flatShading metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </>
  );
}

/* -------------------------------------------------------------- companion */

/** Trots a pace behind the hero's shoulder. A child's pet is theirs too, and it moves. */
export function Companion({
  look,
  heroRef,
  facingRef,
}: {
  look: NonNullable<HeroLook["companion"]>;
  heroRef: React.RefObject<THREE.Vector3>;
  facingRef: React.RefObject<number>;
}) {
  const g = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const t = useRef(0);
  const flier = look.shape === "flier";
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    t.current += dt;
    const grp = g.current;
    if (!grp) return;
    const p = heroRef.current;
    const f = facingRef.current;
    // Behind the hero's left shoulder, in the hero's own frame.
    const ox = -1.15;
    const oz = -0.95;
    const wx = p.x + ox * Math.cos(f) + oz * Math.sin(f);
    const wz = p.z - ox * Math.sin(f) + oz * Math.cos(f);
    target.set(wx, heightAt(wx, wz), wz);
    grp.position.x = THREE.MathUtils.damp(grp.position.x, target.x, 4.2, dt);
    grp.position.z = THREE.MathUtils.damp(grp.position.z, target.z, 4.2, dt);
    grp.position.y = heightAt(grp.position.x, grp.position.z);
    grp.rotation.y = THREE.MathUtils.damp(grp.rotation.y, f, 6, dt);

    const b = body.current;
    if (!b) return;
    if (flier) {
      b.position.y = 1.15 + Math.sin(t.current * 3.4) * 0.14;
      b.rotation.z = Math.sin(t.current * 9) * 0.4;
    } else if (look.shape === "blob") {
      const hop = Math.abs(Math.sin(t.current * 4.4));
      b.position.y = hop * 0.22;
      b.scale.set(1 + (1 - hop) * 0.18, 1 - (1 - hop) * 0.22, 1 + (1 - hop) * 0.18);
    } else {
      b.position.y = Math.abs(Math.sin(t.current * 7)) * 0.07;
    }
  });

  const emissive = look.glow ? { emissive: look.color, emissiveIntensity: 0.7 } : {};

  return (
    <group ref={g}>
      <group ref={body}>
        {look.shape === "beast" && (
          <>
            <mesh castShadow position={[0, 0.42, 0]}>
              <boxGeometry args={[0.36, 0.34, 0.68]} />
              <meshStandardMaterial color={look.color} flatShading {...emissive} />
            </mesh>
            <mesh castShadow position={[0, 0.55, 0.42]}>
              <boxGeometry args={[0.3, 0.3, 0.28]} />
              <meshStandardMaterial color={look.color} flatShading {...emissive} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} castShadow position={[s * 0.1, 0.74, 0.4]} rotation={[0, 0, s * 0.2]}>
                <coneGeometry args={[0.08, 0.18, 4]} />
                <meshStandardMaterial color={look.color} flatShading {...emissive} />
              </mesh>
            ))}
            {[-1, 1].map((s) =>
              [-1, 1].map((f2) => (
                <mesh key={`${s}${f2}`} castShadow position={[s * 0.14, 0.13, f2 * 0.22]}>
                  <boxGeometry args={[0.11, 0.28, 0.12]} />
                  <meshStandardMaterial color={look.color} flatShading {...emissive} />
                </mesh>
              )),
            )}
            <mesh castShadow position={[0, 0.58, -0.4]} rotation={[0.7, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.03, 0.4, 5]} />
              <meshStandardMaterial color={look.color} flatShading {...emissive} />
            </mesh>
            {look.horn && (
              <mesh castShadow position={[0, 0.76, 0.5]} rotation={[0.5, 0, 0]}>
                <coneGeometry args={[0.05, 0.3, 5]} />
                <meshStandardMaterial color="#fff2c4" flatShading emissive="#ffd766" emissiveIntensity={0.8} />
              </mesh>
            )}
          </>
        )}
        {flier && (
          <>
            <mesh castShadow position={[0, 0, 0]}>
              <icosahedronGeometry args={[0.24, 0]} />
              <meshStandardMaterial color={look.color} flatShading {...emissive} />
            </mesh>
            <mesh castShadow position={[0, 0.06, 0.22]}>
              <icosahedronGeometry args={[0.15, 0]} />
              <meshStandardMaterial color={look.color} flatShading {...emissive} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} castShadow position={[s * 0.3, 0.06, -0.04]} rotation={[0, 0, s * 0.35]}>
                <boxGeometry args={[0.44, 0.05, 0.26]} />
                <meshStandardMaterial color={look.color} flatShading {...emissive} />
              </mesh>
            ))}
          </>
        )}
        {look.shape === "blob" && (
          <mesh castShadow position={[0, 0.26, 0]}>
            <icosahedronGeometry args={[0.31, 0]} />
            <meshStandardMaterial color={look.color} flatShading transparent opacity={0.92} {...emissive} />
          </mesh>
        )}
      </group>
    </group>
  );
}
