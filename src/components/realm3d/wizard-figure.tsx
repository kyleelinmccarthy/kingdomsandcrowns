"use client";

/**
 * THE QUEST-GIVER: who a parent walks as when they drop into their child's realm.
 *
 * Not the child's avatar — the realm is the child's, and a grown-up visiting it should look like
 * a visitor, not like the child wearing a costume. So the parent is the realm's little wizard:
 * the one who hands out the quests. A round, short figure in a starry robe, a floppy pointed hat
 * with a star on the band, a white beard to the belt, and a staff with a glowing stone that
 * bobs as they walk. Built to the same scale as the child's figure (the nameplate hangs at the
 * same height, the hands are where a cast gathers) and driven by the same `Gait`, so walking,
 * jumping and casting all read without a line of new logic in the mover.
 *
 * No companion walks with the wizard: the child's pet is the child's, and it stays with them.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Gait } from "./hero-figure";

const ROBE = "#3f35a3";
const ROBE_DEEP = "#2e2779";
const TRIM = "#e2b84a";
const SKIN = "#f2cba8";
const BEARD = "#f4f1ea";
const BOOT = "#4a2f22";
const WOOD = "#6b4a2e";
const GLOW = "#9ff0ff";

function Flat({ color, emissive, power = 0 }: { color: string; emissive?: string; power?: number }) {
  return <meshStandardMaterial color={color} emissive={emissive ?? "#000000"} emissiveIntensity={power} flatShading roughness={0.85} />;
}

export function WizardFigure({ gait }: { gait: React.RefObject<Gait> }) {
  const body = useRef<THREE.Group>(null);
  const robe = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const staff = useRef<THREE.Group>(null);
  const stone = useRef<THREE.Mesh>(null);
  const hatTip = useRef<THREE.Group>(null);

  // Stars scattered on the robe: fixed, so every visit is the same wizard.
  const stars = useMemo(() => {
    const out: [number, number, number][] = [];
    const pts = [
      [0.55, 0.55],
      [1.9, 0.9],
      [3.1, 0.45],
      [4.2, 1.05],
      [5.3, 0.62],
      [2.5, 0.25],
      [0.2, 1.1],
    ];
    for (const [a, y] of pts) {
      // The robe's radius at this height, from its taper: 0.62 at the hem to 0.3 at the chest.
      const r = 0.62 - ((y - 0.06) / 1.35) * 0.32 + 0.01;
      out.push([Math.sin(a) * r, y, Math.cos(a) * r]);
    }
    return out;
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const g = gait.current;
    const s = Math.sin(g.phase);
    const walk = g.speed;
    const t = state.clock.elapsedTime;
    const b = body.current;
    // A little bounce over each step, and a waddle side to side: short legs under a long robe.
    if (b) {
      b.position.y = Math.abs(s) * 0.07 * walk;
      b.rotation.z = s * 0.06 * walk;
    }
    if (robe.current) robe.current.rotation.x = THREE.MathUtils.damp(robe.current.rotation.x, -0.08 * walk, 6, dt);
    if (left.current) left.current.rotation.x = -s * 0.55 * walk;
    if (right.current) right.current.rotation.x = s * 0.25 * walk - 0.15;
    if (footL.current) footL.current.position.z = s * 0.2 * walk;
    if (footR.current) footR.current.position.z = -s * 0.2 * walk;
    // The staff is planted and lifted with the right-hand stride.
    if (staff.current) staff.current.rotation.x = s * 0.18 * walk;
    // The stone breathes, whether or not anyone is walking.
    if (stone.current) {
      stone.current.position.y = 1.57 + Math.sin(t * 2.1) * 0.04;
      stone.current.rotation.y = t * 0.9;
    }
    // The tip of the hat flops behind a walking wizard.
    if (hatTip.current) hatTip.current.rotation.x = THREE.MathUtils.damp(hatTip.current.rotation.x, -0.5 - 0.25 * walk + s * 0.06 * walk, 6, dt);
  });

  return (
    <group ref={body}>
      {/* A soft warm fill, as the child's figure has: the one figure a child is looking for, and
          here the one the parent is, should never be the dullest thing on the screen. */}
      <pointLight position={[0.4, 2.1, 1.2]} intensity={3} distance={3} decay={2} color="#ffeccf" />

      {/* Boots, peeking out under the hem. */}
      {(
        [
          [-0.18, footL],
          [0.18, footR],
        ] as const
      ).map(([x, ref]) => (
        <group key={x} ref={ref}>
          <mesh castShadow position={[x, 0.09, 0.08]}>
            <boxGeometry args={[0.2, 0.18, 0.36]} />
            <Flat color={BOOT} />
          </mesh>
        </group>
      ))}

      {/* The robe: wide at the hem, a trim of gold, stars. */}
      <group ref={robe} position={[0, 0.06, 0]}>
        <mesh castShadow position={[0, 0.675, 0]}>
          <cylinderGeometry args={[0.3, 0.62, 1.35, 12]} />
          <Flat color={ROBE} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.63, 0.64, 0.1, 12]} />
          <Flat color={TRIM} />
        </mesh>
        {stars.map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, Math.atan2(x, z), 0]}>
            <octahedronGeometry args={[0.055, 0]} />
            <Flat color="#ffe27a" emissive="#ffcf3a" power={0.8} />
          </mesh>
        ))}
      </group>
      {/* Belt and buckle. */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.37, 0.39, 0.09, 12]} />
        <Flat color={ROBE_DEEP} />
      </mesh>
      <mesh position={[0, 1.2, 0.38]}>
        <boxGeometry args={[0.12, 0.11, 0.04]} />
        <Flat color={TRIM} />
      </mesh>
      {/* Shoulders: a short cape collar over the top of the robe. */}
      <mesh castShadow position={[0, 1.47, 0]}>
        <coneGeometry args={[0.46, 0.34, 12]} />
        <Flat color={ROBE_DEEP} />
      </mesh>

      {/* Arms: wide sleeves, swinging from the shoulder, a hand at each cuff. */}
      <group ref={left} position={[-0.36, 1.46, 0]}>
        <mesh castShadow position={[0, -0.3, 0]} rotation={[0, 0, -0.18]}>
          <coneGeometry args={[0.17, 0.62, 8, 1, true]} />
          <meshStandardMaterial color={ROBE} flatShading side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.06, -0.62, 0]}>
          <sphereGeometry args={[0.085, 8, 6]} />
          <Flat color={SKIN} />
        </mesh>
      </group>
      <group ref={right} position={[0.36, 1.46, 0]}>
        <mesh castShadow position={[0, -0.3, 0]} rotation={[0, 0, 0.18]}>
          <coneGeometry args={[0.17, 0.62, 8, 1, true]} />
          <meshStandardMaterial color={ROBE} flatShading side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.06, -0.62, 0]}>
          <sphereGeometry args={[0.085, 8, 6]} />
          <Flat color={SKIN} />
        </mesh>
      </group>

      {/* The staff, in the right hand, and its glowing stone. */}
      <group ref={staff} position={[0.46, 0.85, 0.12]}>
        <mesh castShadow position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.04, 0.05, 2.1, 6]} />
          <Flat color={WOOD} />
        </mesh>
        {/* A little crook of wood cradling the stone. */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * 0.07, 1.46, 0]} rotation={[0, 0, k * -0.5]}>
            <cylinderGeometry args={[0.025, 0.03, 0.26, 5]} />
            <Flat color={WOOD} />
          </mesh>
        ))}
        <mesh ref={stone} position={[0, 1.57, 0]}>
          <icosahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1.6} flatShading toneMapped={false} />
        </mesh>
      </group>

      {/* The head: round, rosy-nosed, bushy-browed. */}
      <mesh castShadow position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.27, 12, 10]} />
        <Flat color={SKIN} />
      </mesh>
      {[-1, 1].map((k) => (
        <group key={k}>
          <mesh position={[k * 0.1, 1.82, 0.24]}>
            <sphereGeometry args={[0.035, 6, 5]} />
            <Flat color="#241c16" />
          </mesh>
          <mesh position={[k * 0.11, 1.9, 0.235]} rotation={[0, 0, k * -0.25]}>
            <boxGeometry args={[0.13, 0.04, 0.04]} />
            <Flat color={BEARD} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.75, 0.27]}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <Flat color="#e79a86" />
      </mesh>
      {/* The beard, down to the belt, and a moustache over it. */}
      <mesh castShadow position={[0, 1.44, 0.16]} rotation={[Math.PI + 0.12, 0, 0]}>
        <coneGeometry args={[0.24, 0.62, 10]} />
        <Flat color={BEARD} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 0.08, 1.69, 0.26]} rotation={[0, 0, k * 0.35]}>
          <boxGeometry args={[0.15, 0.05, 0.05]} />
          <Flat color={BEARD} />
        </mesh>
      ))}

      {/* The hat: a wide brim, a gold band with a star, and a tall crown that flops at the tip. */}
      <mesh castShadow position={[0, 1.98, 0]}>
        <cylinderGeometry args={[0.56, 0.58, 0.05, 16]} />
        <Flat color={ROBE_DEEP} />
      </mesh>
      <mesh castShadow position={[0, 2.22, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.46, 12]} />
        <Flat color={ROBE} />
      </mesh>
      <mesh position={[0, 2.06, 0]}>
        <cylinderGeometry args={[0.305, 0.31, 0.08, 12]} />
        <Flat color={TRIM} />
      </mesh>
      <mesh position={[0, 2.13, 0.3]}>
        <octahedronGeometry args={[0.07, 0]} />
        <Flat color="#ffe27a" emissive="#ffcf3a" power={1} />
      </mesh>
      <group ref={hatTip} position={[0, 2.44, 0]} rotation={[-0.5, 0, 0]}>
        <mesh castShadow position={[0, 0.2, 0]}>
          <coneGeometry args={[0.2, 0.42, 12]} />
          <Flat color={ROBE} />
        </mesh>
      </group>
    </group>
  );
}
