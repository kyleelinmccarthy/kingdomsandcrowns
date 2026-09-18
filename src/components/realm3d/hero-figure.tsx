"use client";

/**
 * SPIKE — throwaway. The child's own avatar, as geometry.
 *
 * `hero-look.ts` has already turned the saved `AvatarConfig` into a precise description; this
 * file is the other half — one chunky low-poly figure that wears it, and whichever of the
 * twenty-three companions walks beside them.
 *
 * The rule here is that EARNED THINGS GET THEIR OWN SHAPE. A quill is a shaft and a vane, not a
 * gem. A fox has a brush tail and a fox's ears, not a wolf's. Low-poly does not mean "the same
 * box in a different colour" — it means the shape reads with ten triangles instead of ten
 * thousand, and shape is exactly what a child is looking for when they go and find the item they
 * spent a hundred hours on.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CompanionLook, GearLook, HeroLook } from "@/lib/realm3d/hero-look";
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
const EYE_Y = HEAD_Y + 0.03;
const DARK = "#241c16";
const GOLD = "#d4a843";
const BONE = "#f2ece0";

function mix(hex: string, other: string, t: number): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(other), t).getHexString()}`;
}

function shade(hex: string, t = 0.28): string {
  return mix(hex, "#1b1a22", t);
}

function lift(hex: string, t = 0.22): string {
  return mix(hex, "#ffffff", t);
}

/* ------------------------------------------------------------------ parts */

function Flat({ color, ...rest }: { color: string } & Record<string, unknown>) {
  return <meshStandardMaterial color={color} flatShading roughness={0.82} {...rest} />;
}

function Steel({ color }: { color: string }) {
  return <meshStandardMaterial color={color} flatShading roughness={0.38} metalness={0.62} />;
}

/** Anything that should be findable across the village: it makes its own light. */
function Lit({ color, power = 1.6 }: { color: string; power?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      emissive={color}
      emissiveIntensity={power}
      toneMapped={false}
    />
  );
}

/* ------------------------------------------------------------------- hair */

/** How far above the skull a hat has to sit to clear the hair underneath. */
function hairLift(h: HeroLook["hair"]): number {
  if (h.base === "puff") return 0.34 + h.volume * 0.1;
  if (h.top === "mohawk" || h.top === "spikes" || h.top === "crest") return 0.26;
  if (h.top === "knot") return 0.34;
  if (h.back === "bun") return 0.16;
  return 0.1;
}

function Hair({ h }: { h: HeroLook["hair"] }) {
  const color = h.color;
  const glow = h.glow ? { emissive: lift(color, 0.5), emissiveIntensity: 0.5 } : {};
  // One material element, reused at every position in the tree — cheaper to read than
  // repeating the glow spread nine times.
  const m = <Flat color={color} {...glow} />;
  const L = h.length;

  // The skull cap. When one side is shaved the cap slides off that side and leaves scalp.
  const capW = (HEAD_W + 0.05) * (h.shaved ? 0.62 : 1) * (h.base === "puff" ? 1 : h.volume);
  const capX = h.shaved ? -(HEAD_W + 0.05 - capW) / 2 : 0;
  const cap = h.base === "puff" ? null : (
    <>
      <mesh castShadow position={[capX, HEAD_TOP - 0.05, -0.01]}>
        <boxGeometry args={[capW, 0.19, HEAD_D + 0.05]} />
        {m}
      </mesh>
      {/* a fringe, so the face has a top edge and does not read as a bare block */}
      <mesh castShadow position={[capX * 0.5, HEAD_Y + 0.15, FACE - 0.01]}>
        <boxGeometry args={[capW * 0.96, 0.12, 0.08]} />
        {m}
      </mesh>
      {!h.shaved &&
        [-1, 1].map((s) => (
          <mesh key={s} castShadow position={[(s * (HEAD_W + 0.06)) / 2, HEAD_Y + 0.04, -0.02]}>
            <boxGeometry args={[0.07, 0.3, HEAD_D * 0.8]} />
            {m}
          </mesh>
        ))}
      {h.shaved && (
        // the stubble on the cut side, a shade down — without it the head looks bald, not shaved
        <mesh position={[(HEAD_W + 0.06) / 2 - 0.01, HEAD_Y + 0.08, -0.02]}>
          <boxGeometry args={[0.03, 0.34, HEAD_D * 0.78]} />
          <Flat color={shade(color, 0.45)} />
        </mesh>
      )}
    </>
  );

  const puff = h.base === "puff" && (
    <mesh castShadow position={[0, HEAD_Y + 0.28, -0.08]}>
      <icosahedronGeometry args={[0.4 * h.volume, 0]} />
      {m}
    </mesh>
  );

  return (
    <>
      {cap}
      {puff}

      {h.back === "slab" && (
        <>
          <mesh castShadow position={[0, HEAD_Y - 0.1 - 0.2 * L, -(HEAD_D / 2 + 0.06)]}>
            <boxGeometry args={[(HEAD_W - 0.02) * h.volume, 0.82 * L, 0.14]} />
            {m}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[(s * (HEAD_W + 0.08)) / 2, HEAD_Y - 0.12, -0.08]}>
              <boxGeometry args={[0.1, 0.55 * L, HEAD_D * 0.7]} />
              {m}
            </mesh>
          ))}
        </>
      )}

      {h.back === "flare" && (
        // Shag: mid-length, and it kicks out at the sides rather than hanging flat.
        <>
          <mesh castShadow position={[0, HEAD_Y - 0.14, -(HEAD_D / 2 + 0.05)]}>
            <boxGeometry args={[HEAD_W, 0.42, 0.13]} />
            {m}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.36, HEAD_Y - 0.1, -0.04]} rotation={[0, 0, s * 0.42]}>
              <boxGeometry args={[0.16, 0.44, HEAD_D * 0.8]} />
              {m}
            </mesh>
          ))}
        </>
      )}

      {h.back === "tail" && (
        <>
          <mesh position={[0, HEAD_Y + 0.02, -(HEAD_D / 2 + 0.04)]}>
            <boxGeometry args={[0.16, 0.12, 0.08]} />
            <Flat color={shade(color, 0.35)} />
          </mesh>
          <mesh castShadow position={[0, HEAD_Y - 0.1 - 0.12 * L, -0.34 - 0.06 * L]} rotation={[0.38, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.06, 0.72 * L, 6]} />
            {m}
          </mesh>
        </>
      )}

      {h.back === "braid" && (
        // A braid is a tail with knuckles in it. Three beads and a tie, and it stops being a rope.
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[0, HEAD_Y - 0.12 - i * 0.26 * L, -0.34 - i * 0.03]}>
              <icosahedronGeometry args={[0.13 - i * 0.015, 0]} />
              {m}
            </mesh>
          ))}
          <mesh position={[0, HEAD_Y - 0.78 * L, -0.4]}>
            <cylinderGeometry args={[0.06, 0.06, 0.06, 6]} />
            <Flat color={shade(color, 0.5)} />
          </mesh>
        </>
      )}

      {h.back === "twin-tail" &&
        [-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * 0.3, HEAD_Y + 0.08, -0.16]}>
              <boxGeometry args={[0.12, 0.1, 0.12]} />
              <Flat color={shade(color, 0.35)} />
            </mesh>
            <mesh
              castShadow
              position={[s * (0.34 + 0.06 * L), HEAD_Y - 0.16 - 0.12 * L, -0.2]}
              rotation={[0.2, 0, s * 0.3]}
            >
              <cylinderGeometry args={[0.1, 0.05, 0.62 * L, 6]} />
              {m}
            </mesh>
          </group>
        ))}

      {h.back === "twin-puff" &&
        [-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * 0.38, HEAD_Y - 0.02, -0.06]}>
            <icosahedronGeometry args={[0.19, 0]} />
            {m}
          </mesh>
        ))}

      {h.back === "dreads" &&
        [-0.22, -0.08, 0.08, 0.22].map((x, i) => (
          <mesh
            key={i}
            castShadow
            position={[x, HEAD_Y - 0.18 - (i % 2) * 0.05, -(HEAD_D / 2 + 0.05)]}
            rotation={[0.1, 0, x * 0.5]}
          >
            <cylinderGeometry args={[0.055, 0.045, 0.8 * L, 5]} />
            {m}
          </mesh>
        ))}

      {h.back === "bun" && (
        <mesh castShadow position={[0, HEAD_TOP - 0.02, -0.24]}>
          <icosahedronGeometry args={[0.2, 0]} />
          {m}
        </mesh>
      )}

      {h.top === "spikes" && (
        <>
          {[-0.2, 0, 0.2].map((x, i) => (
            <mesh key={i} castShadow position={[x, HEAD_TOP + 0.12, -0.04 + i * 0.03]} rotation={[-0.3, 0, x * 1.4]}>
              <coneGeometry args={[0.12, 0.34, 5]} />
              {m}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.26, HEAD_TOP + 0.02, -0.16]} rotation={[-0.5, 0, s * 0.9]}>
              <coneGeometry args={[0.1, 0.26, 5]} />
              {m}
            </mesh>
          ))}
        </>
      )}

      {h.top === "mohawk" &&
        // One strip down the middle, standing up. The shaved sides come from `shaved`.
        [-0.18, -0.06, 0.06, 0.18].map((z, i) => (
          <mesh key={i} castShadow position={[0, HEAD_TOP + 0.14 - Math.abs(z) * 0.3, z]}>
            <boxGeometry args={[0.13, 0.36 - Math.abs(z) * 0.5, 0.12]} />
            {m}
          </mesh>
        ))}

      {h.top === "crest" &&
        // Phoenix Crest: a fin swept back off the skull, and it burns.
        [0, 1, 2, 3].map((i) => (
          <mesh key={i} castShadow position={[0, HEAD_TOP + 0.2 - i * 0.05, -0.02 - i * 0.11]} rotation={[-0.55, 0, 0]}>
            <coneGeometry args={[0.11 - i * 0.015, 0.4 - i * 0.05, 4]} />
            <meshStandardMaterial
              color={color}
              flatShading
              emissive={lift(color, 0.55)}
              emissiveIntensity={0.85}
            />
          </mesh>
        ))}

      {h.top === "knot" && (
        <>
          <mesh castShadow position={[0, HEAD_TOP + 0.12, -0.02]}>
            <cylinderGeometry args={[0.08, 0.11, 0.18, 6]} />
            {m}
          </mesh>
          <mesh castShadow position={[0, HEAD_TOP + 0.28, -0.02]}>
            <icosahedronGeometry args={[0.16, 0]} />
            {m}
          </mesh>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- legs */

function Leg({ look, side, swingRef }: { look: HeroLook; side: number; swingRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = swingRef.current * side;
  });
  const bare = look.legs.shape === "skirt";
  const shortLeg = look.legs.shape === "shorts";
  const skin = look.skin;
  const f = look.feet;
  const legColor = look.legs.metal ? mix(look.legs.color, "#9aa3ad", 0.5) : look.legs.color;
  const bootH = f.shape === "tall" ? 0.46 : f.shape === "shoe" ? 0.14 : 0.3;
  const footY = -HIP + FOOT_TOP - 0.13 + bootH / 2;
  const bootMat = f.metal ? <Steel color={f.color} /> : <Flat color={f.color} />;

  return (
    <group ref={g} position={[side * 0.17, HIP, 0]}>
      {look.legs.glow && (
        <mesh position={[0, -0.62, 0]}>
          <boxGeometry args={[0.25, 0.1, 0.27]} />
          <Lit color={lift(look.legs.color, 0.35)} power={1.1} />
        </mesh>
      )}
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
      {f.strap ? (
        // Sandals: a bare foot with two straps over it. Anything else is just a small boot.
        <>
          <mesh castShadow position={[0, footY, 0.04]}>
            <boxGeometry args={[0.25, 0.1, 0.34]} />
            <Flat color={skin} />
          </mesh>
          {[-0.04, 0.1].map((z, i) => (
            <mesh key={i} position={[0, footY + 0.06, z]}>
              <boxGeometry args={[0.27, 0.05, 0.05]} />
              <Flat color={f.color} />
            </mesh>
          ))}
        </>
      ) : (
        <mesh castShadow position={[0, footY, 0.04]}>
          <boxGeometry args={[0.27, bootH, 0.36]} />
          {bootMat}
        </mesh>
      )}

      {f.cuff && (
        <mesh castShadow position={[0, footY + bootH / 2 + 0.03, 0.02]}>
          <boxGeometry args={[0.32, 0.1, 0.4]} />
          <Flat color={lift(f.color, 0.3)} />
        </mesh>
      )}

      {f.claw &&
        [-1, 0, 1].map((s) => (
          <mesh key={s} castShadow position={[s * 0.08, footY - bootH / 2 + 0.04, 0.22]} rotation={[1.2, 0, 0]}>
            <coneGeometry args={[0.035, 0.12, 4]} />
            <Flat color={BONE} />
          </mesh>
        ))}

      {f.glow && (
        <mesh position={[0, footY - bootH / 2 + 0.03, 0.04]}>
          <boxGeometry args={[0.3, 0.05, 0.39]} />
          <Lit color={lift(f.color, 0.45)} power={1.3} />
        </mesh>
      )}

      {f.winged &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.16, -HIP + 0.3, -0.06]} rotation={[0, 0, s * 0.5]}>
            <boxGeometry args={[0.22, 0.14, 0.04]} />
            <meshStandardMaterial color="#f4f8ff" flatShading emissive="#bcd9ff" emissiveIntensity={0.35} />
          </mesh>
        ))}
    </group>
  );
}

/* ------------------------------------------------------------------- arms */

function Arm({ look, side, swingRef }: { look: HeroLook; side: number; swingRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = -swingRef.current * side;
  });
  // A shade off the body on purpose: same colour and the arms vanish into the torso.
  const o = look.outfit;
  const sleeve = o.metal ? mix(o.color, "#9aa3ad", 0.45) : mix(o.color, "#ffffff", 0.08);
  const wide = o.sleeves === "wide";
  const bare = o.sleeves === "bare";
  const gear = look.gear;
  // Hand-worn things live in the arm group so they swing with it, on the left hand as the 2D
  // avatar draws them.
  const handSide = side === -1;

  return (
    <group ref={g} position={[side * 0.4, SHOULDER, 0]} rotation={[0, 0, side * 0.07]}>
      <mesh castShadow position={[0, -0.32, 0]}>
        <boxGeometry args={[wide ? 0.25 : 0.2, wide ? 0.68 : 0.64, wide ? 0.25 : 0.22]} />
        {bare ? <Flat color={look.skin} /> : o.metal ? <Steel color={sleeve} /> : <Flat color={sleeve} />}
      </mesh>
      {wide && (
        // A robe's sleeve bells out at the wrist; it is half of what makes a mage a mage.
        <mesh castShadow position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.15, 0.24, 0.26, 7]} />
          <Flat color={sleeve} />
        </mesh>
      )}
      <mesh castShadow position={[0, -0.72, 0.01]}>
        <boxGeometry args={[0.19, 0.18, 0.2]} />
        <Flat color={look.skin} />
      </mesh>

      {handSide && gear?.id === "enchanted-ring" && (
        <>
          <mesh position={[0, -0.8, 0.06]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.08, 0.03, 4, 10]} />
            <meshStandardMaterial color={gear.color} flatShading metalness={0.8} roughness={0.25} />
          </mesh>
          {/* a ring is small at this scale, so the stone is what carries it: it glows and it lights
              the hand around it, which is how a child finds the thing they earned at level 45 */}
          <mesh position={[0, -0.8, 0.12]}>
            <icosahedronGeometry args={[0.055, 0]} />
            <Lit color={lift(gear.color, 0.4)} power={3} />
          </mesh>
          <pointLight position={[0, -0.8, 0.14]} intensity={0.9} distance={1.1} decay={2} color={lift(gear.color, 0.4)} />
        </>
      )}

      {handSide && gear?.id === "wisdom-orb" && (
        // It floats at the palm rather than sitting in it — an orb you hold is a ball.
        <mesh position={[-0.2, -0.46, 0.28]}>
          <icosahedronGeometry args={[0.16, 1]} />
          <meshStandardMaterial
            color={gear.color}
            transparent
            opacity={0.72}
            emissive={gear.color}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
      )}

      {handSide && gear?.id === "chrono-gauntlet" && (
        <>
          <mesh castShadow position={[0, -0.56, 0]}>
            <boxGeometry args={[0.26, 0.26, 0.27]} />
            <Steel color={gear.color} />
          </mesh>
          <mesh position={[0, -0.56, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.03, 10]} />
            <Flat color={BONE} />
          </mesh>
          {/* two hands on the dial, at ten past two, so it reads as a clock and not a button */}
          <mesh position={[0.02, -0.53, 0.17]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[0.02, 0.08, 0.01]} />
            <Flat color={DARK} />
          </mesh>
          <mesh position={[-0.03, -0.57, 0.17]} rotation={[0, 0, 1.1]}>
            <boxGeometry args={[0.02, 0.06, 0.01]} />
            <Flat color={DARK} />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ torso */

/**
 * The mark that separates one outfit from the others in its family. Every one of these is three
 * or four primitives, which is the whole point: there was never a rendering reason to collapse
 * Dragonscale and Titan's Plate into the same box.
 */
function OutfitMarks({ o, front }: { o: HeroLook["outfit"]; front: number }) {
  const a = o.accent;
  /** Proud of the body's surface. Anything behind it is invisible, which was the old bug. */
  const z = front + 0.02;
  const metal = { metalness: 0.62, roughness: 0.32 } as const;
  /** A collar ring, centred on the body rather than pushed at the camera. */
  const collar = (
    <mesh position={[0, 1.56, 0]}>
      <cylinderGeometry args={[0.37, 0.37, 0.12, 9]} />
      <Flat color={a} {...metal} />
    </mesh>
  );

  switch (o.mark) {
    case "sash":
      // A plain robe's one feature: a broad sash over one shoulder, a shade up from the cloth
      // so it is actually visible against it.
      return (
        <mesh position={[0, 1.22, 0]} rotation={[0, 0, 0.42]}>
          <boxGeometry args={[0.16, 1.0, 0.76]} />
          <Flat color={lift(o.color, 0.28)} />
        </mesh>
      );
    case "wizard":
      // Rope belt, and a moon-and-star on the chest. Nobody confuses this with a plain robe.
      return (
        <>
          <mesh position={[0, 1.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.035, 5, 12]} />
            <Flat color={a} />
          </mesh>
          <mesh position={[-0.02, 1.36, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.03, 10]} />
            <Lit color={a} power={1.6} />
          </mesh>
          <mesh position={[0.05, 1.38, z + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.04, 10]} />
            <Flat color={o.color} />
          </mesh>
          <mesh position={[0.16, 1.2, z]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.07, 0.07, 0.03]} />
            <Lit color={a} power={2} />
          </mesh>
        </>
      );
    case "vee":
      // A vest: open at the front, two panels either side of the chest.
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.17, 1.3, z - 0.06]} rotation={[0, -s * 0.45, 0]}>
              <boxGeometry args={[0.22, 0.78, 0.06]} />
              <Flat color={shade(o.color, 0.4)} />
            </mesh>
          ))}
        </>
      );
    case "runes":
      return (
        <>
          {[[-0.17, 1.4], [0.17, 1.3], [0, 1.08]].map(([x, y], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[0, 0, i * 0.7]}>
              <boxGeometry args={[0.11, 0.11, 0.03]} />
              <Lit color={a} power={2.2} />
            </mesh>
          ))}
          <mesh position={[0, 1.24, z]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.04, 0.5, 0.03]} />
            <Lit color={a} power={1.2} />
          </mesh>
        </>
      );
    case "gems":
      return (
        <>
          {collar}
          {(["#8b5cf6", "#3b82f6", "#ec4899", "#22c55e"] as const).map((cc, i) => (
            <mesh key={cc} position={[-0.17 + (i % 2) * 0.34, 1.36 - Math.floor(i / 2) * 0.22, z]}>
              <icosahedronGeometry args={[0.06, 0]} />
              <Lit color={cc} power={2.2} />
            </mesh>
          ))}
        </>
      );
    case "stars":
      return (
        <>
          {collar}
          {[[-0.19, 1.4], [0.2, 1.46], [-0.09, 1.12], [0.15, 1.2], [0, 0.92]].map(([x, y], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[0, 0, 0.8]}>
              <boxGeometry args={[0.06, 0.06, 0.03]} />
              <Lit color="#ffe98a" power={2.4} />
            </mesh>
          ))}
        </>
      );
    case "leaves":
      return (
        <>
          {[[-0.16, 1.4, 0.4], [0.2, 1.18, -0.5], [-0.05, 0.98, 0.9]].map(([x, y, r], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[0, 0, r]}>
              <coneGeometry args={[0.09, 0.2, 4]} />
              <Flat color="#4d8a3e" />
            </mesh>
          ))}
          <mesh position={[0, 0.96, 0]}>
            <cylinderGeometry args={[0.45, 0.45, 0.12, 9]} />
            <Flat color={a} />
          </mesh>
        </>
      );
    case "royal":
      // Gold from the collar to the hem, down both front edges. Unmistakably the quest robe.
      return (
        <>
          {collar}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.24, 1.2, z - 0.03]} rotation={[0, -s * 0.5, 0]}>
              <boxGeometry args={[0.08, 0.9, 0.05]} />
              <Flat color={a} {...metal} />
            </mesh>
          ))}
          <mesh position={[0, 1.34, z]}>
            <boxGeometry args={[0.12, 0.12, 0.04]} />
            <Lit color={a} power={0.9} />
          </mesh>
        </>
      );
    case "bodice":
      // Battle Dress: an armoured bodice over a flared skirt. A gown, but one you fight in.
      return (
        <>
          <mesh castShadow position={[0, 1.34, z - 0.06]}>
            <boxGeometry args={[0.46, 0.5, 0.12]} />
            <Flat color={lift(o.color, 0.3)} {...metal} />
          </mesh>
          <mesh position={[0, 1.52, z - 0.03]}>
            <boxGeometry args={[0.42, 0.08, 0.06]} />
            <Flat color={a} {...metal} />
          </mesh>
          <mesh position={[0, 1.06, 0]}>
            <cylinderGeometry args={[0.44, 0.44, 0.12, 9]} />
            <Flat color={a} {...metal} />
          </mesh>
        </>
      );
    case "scales":
      // Three overlapping rows. A scaled chest is the entire identity of Dragonscale.
      return (
        <>
          {[0, 1, 2].map((row) =>
            [-1, 0, 1].map((col) => (
              <mesh
                key={`${row}${col}`}
                position={[col * 0.17 + (row % 2 ? 0.085 : 0), 1.52 - row * 0.19, z]}
                rotation={[0.3, 0, 0]}
              >
                <coneGeometry args={[0.1, 0.1, 4]} />
                <Flat color={lift(o.color, 0.2)} metalness={0.5} roughness={0.42} />
              </mesh>
            )),
          )}
        </>
      );
    case "flame":
      return (
        <>
          {[-0.14, 0, 0.14].map((x, i) => (
            <mesh key={i} position={[x, 1.3 + (i === 1 ? 0.1 : 0), z]}>
              <coneGeometry args={[0.09, 0.34 + (i === 1 ? 0.12 : 0), 4]} />
              <Lit color={a} power={1.5} />
            </mesh>
          ))}
        </>
      );
    case "lava":
      return (
        <>
          {[[1.42, 0.5], [1.16, -0.4], [0.94, 0.2]].map(([y, r], i) => (
            <mesh key={i} position={[0, y, z]} rotation={[0, 0, r]}>
              <boxGeometry args={[0.52, 0.045, 0.03]} />
              <Lit color={a} power={2.6} />
            </mesh>
          ))}
        </>
      );
    case "frost":
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.18, 1.3, z]} rotation={[0, 0, s * 0.3]}>
              <coneGeometry args={[0.07, 0.42, 4]} />
              <Flat color={a} />
            </mesh>
          ))}
          <mesh position={[0, 1.42, z]}>
            <coneGeometry args={[0.08, 0.5, 4]} />
            <Flat color="#ffffff" />
          </mesh>
        </>
      );
    case "chain":
      // Mail is small and repeated. Four rows of studs, and it stops being a plate cuirass.
      return (
        <>
          {[0, 1, 2, 3].map((row) =>
            [-1, 0, 1].map((col) => (
              <mesh key={`${row}${col}`} position={[col * 0.15 + (row % 2 ? 0.075 : 0), 1.56 - row * 0.16, z]}>
                <icosahedronGeometry args={[0.04, 0]} />
                <Steel color="#b0b0b0" />
              </mesh>
            )),
          )}
        </>
      );
    case "slab":
      // A single big chest plate with the child's colour inset in it.
      return (
        <>
          <mesh castShadow position={[0, 1.34, z - 0.04]}>
            <boxGeometry args={[0.48, 0.52, 0.1]} />
            <Steel color={lift(o.color, 0.55)} />
          </mesh>
          <mesh position={[0, 1.34, z + 0.03]}>
            <boxGeometry args={[0.24, 0.3, 0.04]} />
            <Flat color={a} {...metal} />
          </mesh>
        </>
      );
    case "sunburst":
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[0, 1.34, z]} rotation={[0, 0, (i / 6) * Math.PI * 2]}>
              <boxGeometry args={[0.05, 0.34, 0.03]} />
              <Flat color={a} {...metal} />
            </mesh>
          ))}
          <mesh position={[0, 1.34, z + 0.02]}>
            <icosahedronGeometry args={[0.08, 0]} />
            <Lit color={a} power={1.2} />
          </mesh>
        </>
      );
    case "strap":
      return (
        <>
          <mesh position={[0, 1.3, 0]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[0.1, 0.96, 0.7]} />
            <Flat color={a} />
          </mesh>
          <mesh position={[0, 0.98, z - 0.02]}>
            <boxGeometry args={[0.16, 0.16, 0.08]} />
            <Flat color={GOLD} {...metal} />
          </mesh>
        </>
      );
    case "clasp":
      // A cloak's throat clasp: two gold plates and a chain between them.
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.16, 1.6, z - 0.06]}>
              <boxGeometry args={[0.13, 0.13, 0.06]} />
              <Flat color={a} {...metal} />
            </mesh>
          ))}
          <mesh position={[0, 1.6, z - 0.06]}>
            <boxGeometry args={[0.2, 0.03, 0.03]} />
            <Flat color={a} {...metal} />
          </mesh>
        </>
      );
    case "collar":
      // Shadow Cloak: a high standing collar that swallows the neck. Nothing else has one.
      return (
        <>
          <mesh castShadow position={[0, 1.86, -0.06]}>
            <cylinderGeometry args={[0.46, 0.3, 0.56, 9, 1, true, Math.PI * 0.18, Math.PI * 1.64]} />
            <meshStandardMaterial color={shade(o.color, 0.4)} flatShading side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 1.56, z - 0.04]}>
            <icosahedronGeometry args={[0.07, 0]} />
            <Lit color={a} power={1.1} />
          </mesh>
        </>
      );
    case "emblem":
      return (
        <mesh position={[0, 1.34, z]}>
          <boxGeometry args={[0.18, 0.18, 0.04]} />
          <Flat color={o.color} />
        </mesh>
      );
    default:
      return null;
  }
}


function Torso({ look }: { look: HeroLook }) {
  const o = look.outfit;
  const base = o.metal ? mix(o.color, "#9aa3ad", 0.55) : o.color;
  const body = o.tone ? shade(base, o.tone) : base;

  if (o.shape === "robe") {
    // Flares to the ground and swallows the legs — the one silhouette nobody mistakes.
    const drop = 1.46 * (o.length / 2);
    return (
      <>
        <mesh castShadow receiveShadow position={[0, TORSO_TOP - drop / 2 - 0.02, 0]}>
          <cylinderGeometry args={[0.3, 0.56, drop, 9]} />
          <Flat
            color={body}
            {...(o.glow && o.mark === "stars" ? { emissive: body, emissiveIntensity: 0.18 } : {})}
          />
        </mesh>
        <mesh castShadow position={[0, TORSO_TOP - 0.12, 0]}>
          <cylinderGeometry args={[0.33, 0.4, 0.26, 9]} />
          <Flat color={shade(body, 0.24)} />
        </mesh>
        <OutfitMarks o={o} front={0.36} />
        {o.hem && (
          <mesh position={[0, TORSO_TOP - drop + 0.06, 0]}>
            <cylinderGeometry args={[0.56, 0.56, 0.1, 9]} />
            <Flat color={o.hem} metalness={0.6} roughness={0.34} />
          </mesh>
        )}
      </>
    );
  }

  if (o.shape === "plate") {
    const wide = o.pauldrons === "huge";
    return (
      <>
        <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
          <boxGeometry args={[wide ? 0.74 : 0.66, 0.8, wide ? 0.5 : 0.46]} />
          <Steel color={body} />
        </mesh>
        {/* the child's colour, kept where it can be seen: the tabard band and the belt */}
        <mesh position={[0, 1.24, 0.01]}>
          <boxGeometry args={[0.22, 0.66, wide ? 0.52 : 0.48]} />
          <Flat color={o.color} />
        </mesh>
        <mesh position={[0, 0.96, 0]}>
          <boxGeometry args={[wide ? 0.78 : 0.7, 0.13, wide ? 0.54 : 0.5]} />
          <Flat color={o.hem ?? shade(o.color, 0.2)} {...(o.hem ? { metalness: 0.6, roughness: 0.32 } : {})} />
        </mesh>
        <OutfitMarks o={o} front={wide ? 0.26 : 0.24} />
      </>
    );
  }

  const tunic = (
    <>
      <mesh castShadow receiveShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.31, 0.39, 0.8, 9]} />
        <Flat color={body} />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.11, 9]} />
        <Flat color={shade(body, 0.42)} />
      </mesh>
    </>
  );

  if (o.shape === "coat") {
    return (
      <>
        {tunic}
        {/* a knee-length coat, open at the front so the legs still show through */}
        <mesh castShadow position={[0, 1.02 - 0.33 * o.length, -0.06]}>
          <cylinderGeometry args={[0.42, 0.54, 0.66 * o.length, 9, 1, true, Math.PI * 0.2, Math.PI * 1.6]} />
          <meshStandardMaterial color={shade(body, 0.16)} flatShading side={THREE.DoubleSide} roughness={0.82} />
        </mesh>
        <OutfitMarks o={o} front={0.34} />
      </>
    );
  }

  return (
    <>
      {tunic}
      <OutfitMarks o={o} front={0.34} />
    </>
  );
}

/* --------------------------------------------------------------- shoulders */

function Pauldrons({ look }: { look: HeroLook }) {
  const o = look.outfit;
  const kind = o.pauldrons;
  if (kind === "none") return null;
  const metal = { flatShading: true, metalness: 0.55, roughness: 0.35 } as const;

  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.42, SHOULDER + 0.02, 0]}>
          {kind === "round" && (
            <mesh castShadow>
              <icosahedronGeometry args={[0.21, 0]} />
              <meshStandardMaterial color={o.color} {...metal} />
            </mesh>
          )}
          {kind === "square" && (
            <mesh castShadow position={[s * 0.04, 0.04, 0]}>
              <boxGeometry args={[0.28, 0.2, 0.42]} />
              <meshStandardMaterial color={lift(o.color, 0.5)} {...metal} />
            </mesh>
          )}
          {kind === "huge" && (
            <>
              <mesh castShadow position={[s * 0.08, 0.06, 0]}>
                <boxGeometry args={[0.36, 0.28, 0.5]} />
                <meshStandardMaterial color={lift(o.color, 0.45)} {...metal} />
              </mesh>
              <mesh position={[s * 0.08, 0.22, 0]}>
                <boxGeometry args={[0.3, 0.06, 0.44]} />
                <meshStandardMaterial color={o.accent} {...metal} />
              </mesh>
            </>
          )}
          {kind === "spiked" && (
            <>
              <mesh castShadow>
                <icosahedronGeometry args={[0.21, 0]} />
                <meshStandardMaterial color={o.color} {...metal} />
              </mesh>
              <mesh castShadow position={[s * 0.1, 0.16, 0]} rotation={[0, 0, -s * 0.5]}>
                <coneGeometry args={[0.07, 0.3, 4]} />
                <meshStandardMaterial color={o.accent} {...metal} />
              </mesh>
            </>
          )}
          {kind === "shard" && (
            <>
              <mesh castShadow>
                <icosahedronGeometry args={[0.19, 0]} />
                <meshStandardMaterial color={o.color} {...metal} />
              </mesh>
              {[-0.4, 0, 0.4].map((r, i) => (
                <mesh key={i} castShadow position={[s * 0.06, 0.18, r * 0.3]} rotation={[r, 0, -s * 0.3]}>
                  <coneGeometry args={[0.05, 0.3, 4]} />
                  <meshStandardMaterial color={o.accent} flatShading transparent opacity={0.85} />
                </mesh>
              ))}
            </>
          )}
          {kind === "winged" && (
            <>
              <mesh castShadow>
                <icosahedronGeometry args={[0.2, 0]} />
                <meshStandardMaterial color={lift(o.color, 0.6)} {...metal} />
              </mesh>
              <mesh castShadow position={[s * 0.14, 0.1, -0.02]} rotation={[0, 0, -s * 0.9]}>
                <boxGeometry args={[0.3, 0.06, 0.22]} />
                <meshStandardMaterial color={o.accent} {...metal} />
              </mesh>
            </>
          )}
          {kind === "leaf" &&
            [-0.3, 0.3].map((r, i) => (
              <mesh key={i} castShadow position={[s * 0.04, 0.08, r * 0.3]} rotation={[r, 0, -s * 0.7]}>
                <coneGeometry args={[0.1, 0.26, 4]} />
                <Flat color="#4d8a3e" />
              </mesh>
            ))}
        </group>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- head */

function Head({ look }: { look: HeroLook }) {
  const g = look.gear;
  const hooded = g?.id === "hood";
  const masked = g?.id === "face-mask";
  const patched = g?.id === "eyepatch";

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
      {[-1, 1].map((s) =>
        patched && s === -1 ? null : (
          <mesh key={s} position={[s * 0.14, EYE_Y, FACE]}>
            <boxGeometry args={[0.1, 0.11, 0.03]} />
            <meshStandardMaterial color={DARK} flatShading />
          </mesh>
        ),
      )}
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * 0.14, HEAD_Y + 0.15, FACE]}>
          <boxGeometry args={[0.13, 0.04, 0.03]} />
          <meshStandardMaterial color={shade(look.hair.color, 0.2)} flatShading />
        </mesh>
      ))}
      {!masked && (
        <mesh position={[0, HEAD_Y - 0.16, FACE]}>
          <boxGeometry args={[0.16, 0.04, 0.03]} />
          <meshStandardMaterial color="#7a4436" flatShading />
        </mesh>
      )}
      {!hooded && <Hair h={look.hair} />}
      {hooded && g && (
        <mesh castShadow position={[0, HEAD_Y + 0.1, -0.03]}>
          <coneGeometry args={[0.48, 0.86, 8, 1, true, Math.PI * 0.55, Math.PI * 0.9]} />
          <meshStandardMaterial color={g.color} flatShading side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- crown */

function CrownMesh({ crown, y }: { crown: NonNullable<HeroLook["crown"]>; y: number }) {
  const pts = Array.from({ length: crown.points }, (_, i) => (i / crown.points) * Math.PI * 2);
  const mat = {
    color: crown.color,
    flatShading: true,
    metalness: 0.8,
    roughness: 0.24,
    emissive: crown.color,
  } as const;
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.34, 0.15, 12]} />
        <meshStandardMaterial {...mat} emissiveIntensity={0.18} />
      </mesh>
      {pts.map((a, i) => (
        <mesh key={i} castShadow position={[Math.cos(a) * 0.29, 0.19, Math.sin(a) * 0.29]}>
          <coneGeometry args={[0.07, 0.26, 5]} />
          <meshStandardMaterial {...mat} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------- accessory */

/**
 * Thirty-three earned items, one case each. This is the heart of the fix: nothing in here is a
 * family, everything is the object the child was promised when they unlocked it.
 *
 * Hand-worn items (ring, orb, gauntlet) are drawn up in `Arm` instead, so they swing.
 */
function Accessory({ look, hatY, front }: { look: HeroLook; hatY: number; front: number }) {
  const g = look.gear;
  const orbit = useRef<THREE.Group>(null);
  useFrame((state) => {
    // Only the star map uses this, and only when it is on. Cheap enough to always compute.
    if (orbit.current) orbit.current.rotation.y = state.clock.elapsedTime * 0.7;
  });
  if (!g) return null;

  // The earned crown outranks anything worn on top of the head, exactly as the 2D avatar
  // layers them. Everything on the face, the neck, the back or behind an ear stays on.
  if (look.crown && g.slot === "head") return null;

  const c = g.color;
  const hi = lift(c, 0.3);
  const metal = { flatShading: true, metalness: 0.7, roughness: 0.28 } as const;
  /** Just proud of whatever the body's front surface is — a robe is fatter than a breastplate. */
  const z = front + 0.02;
  /**
   * A cord in a vee from the collar down to the chest. A ring round the neck would be swallowed
   * by a robe's collar; this hangs on the front of the body, where a child can see it.
   */
  const cord = (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.09, 1.55, z - 0.03]} rotation={[0, 0, s * 0.36]}>
          <boxGeometry args={[0.022, 0.28, 0.022]} />
          <Flat color={shade(c, 0.45)} />
        </mesh>
      ))}
    </>
  );

  switch (g.id) {
    /* ---------------------------------------------------------------- head */
    case "crown":
      return (
        <group position={[0, hatY, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.31, 0.33, 0.14, 10]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            return (
              <group key={i} position={[Math.cos(a) * 0.27, 0.16, Math.sin(a) * 0.27]}>
                <mesh castShadow>
                  <coneGeometry args={[0.08, 0.24, 4]} />
                  <meshStandardMaterial color={c} {...metal} />
                </mesh>
                <mesh position={[0, 0.03, 0.05]}>
                  <icosahedronGeometry args={[0.04, 0]} />
                  <Lit color={["#ef4444", "#3b82f6", "#22c55e"][i]} power={2} />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    case "tiara":
      // Slimmer than a crown, one point, one stone. It is the difference a child asked for.
      return (
        <group position={[0, hatY - 0.02, 0]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.29, 0.024, 4, 12]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          <mesh castShadow position={[0, 0.08, 0.27]}>
            <coneGeometry args={[0.06, 0.16, 4]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          <mesh position={[0, 0.16, 0.27]}>
            <icosahedronGeometry args={[0.042, 0]} />
            <Lit color={hi} power={2.2} />
          </mesh>
        </group>
      );
    case "titans-circlet":
      return (
        <group position={[0, hatY - 0.04, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.33, 0.34, 0.11, 10]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          <mesh castShadow position={[0, 0.14, 0.28]}>
            <coneGeometry args={[0.08, 0.22, 4]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.2, 0.06, 0.24]}>
              <icosahedronGeometry args={[0.05, 0]} />
              <Lit color={s < 0 ? "#8b5cf6" : "#3b82f6"} power={2} />
            </mesh>
          ))}
        </group>
      );
    case "flower-crown":
      return (
        <group position={[0, hatY - 0.04, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.03, 4, 12]} />
            <Flat color="#3f8a35" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            const petal = [c, hi, shade(c, 0.25), hi, c][i];
            return (
              <group key={i} position={[Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3]}>
                {[0, 1, 2, 3].map((p) => (
                  <mesh key={p} position={[Math.cos((p / 4) * 6.28) * 0.05, 0, Math.sin((p / 4) * 6.28) * 0.05]}>
                    <icosahedronGeometry args={[0.045, 0]} />
                    <Flat color={petal} />
                  </mesh>
                ))}
                <mesh>
                  <icosahedronGeometry args={[0.035, 0]} />
                  <Flat color="#ffe08a" />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    case "champions-laurel":
      // Two sprays of leaves climbing the sides of the head, open at the front. Not a band.
      return (
        <group position={[0, hatY - 0.06, 0]}>
          {[-1, 1].map((s) =>
            [0, 1, 2, 3].map((i) => (
              <mesh
                key={`${s}${i}`}
                castShadow
                position={[s * (0.3 - i * 0.05), i * 0.075, 0.1 - i * 0.09]}
                rotation={[0.4 - i * 0.2, s * 0.6, s * (0.9 - i * 0.15)]}
              >
                <coneGeometry args={[0.045, 0.16, 4]} />
                <Flat color={c} metalness={0.5} roughness={0.4} />
              </mesh>
            )),
          )}
        </group>
      );
    case "bandana":
      return (
        <>
          <mesh castShadow position={[0, HEAD_Y + 0.17, 0]}>
            <boxGeometry args={[HEAD_W + 0.06, 0.12, HEAD_D + 0.06]} />
            <Flat color={c} />
          </mesh>
          {/* the knot and its tail, hanging off the right side */}
          <mesh castShadow position={[HEAD_W / 2 + 0.06, HEAD_Y + 0.15, -0.1]}>
            <icosahedronGeometry args={[0.07, 0]} />
            <Flat color={c} />
          </mesh>
          <mesh castShadow position={[HEAD_W / 2 + 0.08, HEAD_Y - 0.06, -0.16]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.08, 0.3, 0.05]} />
            <Flat color={shade(c, 0.18)} />
          </mesh>
        </>
      );
    case "horns":
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh castShadow position={[s * 0.26, HEAD_Y + 0.24, -0.02]} rotation={[0, 0, s * 0.5]}>
                <coneGeometry args={[0.09, 0.26, 5]} />
                <Flat color={c} />
              </mesh>
              {/* a second, thinner segment that curves — one cone alone reads as a party hat */}
              <mesh castShadow position={[s * 0.38, HEAD_Y + 0.42, -0.02]} rotation={[0, 0, s * 1.0]}>
                <coneGeometry args={[0.055, 0.22, 5]} />
                <Flat color={lift(c, 0.25)} />
              </mesh>
            </group>
          ))}
        </>
      );
    case "halo":
      return (
        <mesh position={[0, hatY + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.045, 6, 14]} />
          <meshStandardMaterial color="#fff0b8" emissive="#ffd766" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      );

    /* ----------------------------------------------------------------- ear */
    case "scholars-quill":
      // A shaft, a vane and a dark nib, tucked behind the ear. A quill. Not a gem.
      return (
        <group position={[HEAD_W / 2 + 0.05, HEAD_Y + 0.12, -0.08]} rotation={[0.25, 0, -0.45]}>
          <mesh castShadow position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.014, 0.022, 0.56, 5]} />
            <Flat color={BONE} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 0.16 + i * 0.09, 0]} rotation={[0, 0, 0.5]} scale={[1, 1, 0.25]}>
              <boxGeometry args={[0.11 - i * 0.012, 0.11, 0.08]} />
              <Flat color={c} />
            </mesh>
          ))}
          <mesh position={[0, -0.07, 0]}>
            <coneGeometry args={[0.02, 0.09, 4]} />
            <Flat color={DARK} />
          </mesh>
        </group>
      );
    case "phoenix-feather":
      // One long feather, and it burns. Same construction as the quill, other temperature.
      return (
        <group position={[HEAD_W / 2 + 0.04, HEAD_Y + 0.18, -0.1]} rotation={[0.3, 0, -0.7]}>
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.012, 0.02, 0.5, 5]} />
            <Flat color={shade(c, 0.3)} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 0.14 + i * 0.12, 0]} rotation={[0, 0, 0.45]} scale={[1, 1, 0.22]}>
              <boxGeometry args={[0.14 - i * 0.02, 0.14, 0.09]} />
              <Lit color={i > 1 ? lift(c, 0.45) : c} power={1.2} />
            </mesh>
          ))}
        </group>
      );

    /* ---------------------------------------------------------------- face */
    case "glasses":
      return (
        <group position={[0, EYE_Y, FACE + 0.015]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.14, 0, 0]}>
              <torusGeometry args={[0.085, 0.017, 4, 8]} />
              <meshStandardMaterial color={c} flatShading metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color={c} flatShading metalness={0.6} roughness={0.3} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={`t${s}`} position={[s * 0.25, 0, -0.06]}>
              <boxGeometry args={[0.12, 0.02, 0.02]} />
              <meshStandardMaterial color={c} flatShading metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "monocle":
      return (
        <group position={[0.14, EYE_Y, FACE + 0.015]}>
          <mesh>
            <torusGeometry args={[0.095, 0.018, 4, 10]} />
            <meshStandardMaterial color={c} flatShading metalness={0.75} roughness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.01, 10]} />
            <meshStandardMaterial color="#cfe6ff" transparent opacity={0.3} />
          </mesh>
          {/* the chain, which is the half of a monocle that makes it a monocle */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0.1 + i * 0.03, -0.09 - i * 0.07, -0.02]}>
              <boxGeometry args={[0.02, 0.06, 0.02]} />
              <Flat color={c} metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "eyepatch":
      return (
        <>
          <mesh position={[-0.14, EYE_Y, FACE + 0.01]}>
            <boxGeometry args={[0.17, 0.16, 0.03]} />
            <Flat color={c} />
          </mesh>
          <mesh position={[0, HEAD_Y + 0.12, 0]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[HEAD_W + 0.05, 0.04, HEAD_D + 0.05]} />
            <Flat color={shade(c, 0.3)} />
          </mesh>
        </>
      );
    case "third-eye":
      return (
        <>
          <mesh position={[0, HEAD_Y + 0.2, FACE]}>
            <icosahedronGeometry args={[0.07, 0]} />
            <Lit color={c} power={2.2} />
          </mesh>
          <mesh position={[0, HEAD_Y + 0.2, FACE + 0.03]}>
            <boxGeometry args={[0.02, 0.07, 0.02]} />
            <Flat color={DARK} />
          </mesh>
        </>
      );
    case "war-paint":
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.15, HEAD_Y - 0.08, FACE]}>
                <boxGeometry args={[0.15, 0.045, 0.02]} />
                <Flat color={c} />
              </mesh>
              <mesh position={[s * 0.19, HEAD_Y - 0.14, FACE]}>
                <boxGeometry args={[0.07, 0.04, 0.02]} />
                <Flat color={c} />
              </mesh>
            </group>
          ))}
        </>
      );
    case "battle-scars":
      return (
        <mesh position={[0.17, HEAD_Y + 0.02, FACE]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.025, 0.26, 0.02]} />
          <Flat color="#c46a63" />
        </mesh>
      );
    case "face-mask":
      return (
        <mesh castShadow position={[0, HEAD_Y - 0.14, FACE - 0.03]}>
          <boxGeometry args={[HEAD_W + 0.02, 0.22, HEAD_D + 0.02]} />
          <Flat color={c} />
        </mesh>
      );

    /* ---------------------------------------------------------------- neck */
    case "necklace":
      return (
        <>
          {cord}
          <mesh position={[0, 1.41, z]}>
            <icosahedronGeometry args={[0.07, 0]} />
            <Lit color={hi} power={1.4} />
          </mesh>
        </>
      );
    case "cape-pin":
      // A clasp high on the chest, holding the cape it also switches on.
      return (
        <>
          <mesh position={[0, 1.56, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.05, 8]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          <mesh position={[0, 1.56, z + 0.03]}>
            <icosahedronGeometry args={[0.04, 0]} />
            <Flat color={hi} />
          </mesh>
        </>
      );
    case "dragon-fang":
      return (
        <>
          {cord}
          <mesh castShadow position={[0, 1.38, z]} rotation={[0.2, 0, Math.PI]}>
            <coneGeometry args={[0.055, 0.26, 4]} />
            <Flat color={BONE} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.08, 1.48, z]}>
              <icosahedronGeometry args={[0.032, 0]} />
              <Flat color={c} />
            </mesh>
          ))}
        </>
      );
    case "scarf":
      return (
        <>
          {/* the wrap sits ABOVE the collar, round the neck itself, or a robe eats it */}
          <mesh castShadow position={[0, TORSO_TOP + 0.02, 0]}>
            <cylinderGeometry args={[0.33, 0.33, 0.14, 8]} />
            <Flat color={c} />
          </mesh>
          {/* one long tail down the front, the way a scarf actually sits */}
          <mesh castShadow position={[-0.13, 1.35, z + 0.02]} rotation={[0.06, 0, 0.12]}>
            <boxGeometry args={[0.15, 0.62, 0.07]} />
            <Flat color={c} />
          </mesh>
          <mesh castShadow position={[-0.17, 1.05, z + 0.02]}>
            <boxGeometry args={[0.15, 0.1, 0.07]} />
            <Flat color={shade(c, 0.25)} />
          </mesh>
        </>
      );
    case "moon-charm":
      // A crescent: a disc with a second disc cut out of it by sitting in front, dark.
      return (
        <>
          {cord}
          <group position={[0, 1.4, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.03, 10]} />
              <Lit color={lift(c, 0.5)} power={1.5} />
            </mesh>
            <mesh position={[0.055, 0.02, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.082, 0.082, 0.04, 10]} />
              <meshStandardMaterial color="#141420" />
            </mesh>
          </group>
        </>
      );
    case "sun-pendant":
      return (
        <>
          {cord}
          <group position={[0, 1.4, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.035, 10]} />
              <Lit color={lift(c, 0.4)} power={2} />
            </mesh>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <mesh key={i} rotation={[0, 0, (i / 8) * Math.PI * 2]}>
                <boxGeometry args={[0.03, 0.22, 0.02]} />
                <Lit color={c} power={1.4} />
              </mesh>
            ))}
          </group>
        </>
      );

    /* --------------------------------------------------------------- chest */
    case "shield-badge":
      return (
        <group position={[0, 1.34, z]}>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.2, 0.05]} />
            <Flat color={c} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.16, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.14, 0.16, 4]} />
            <Flat color={c} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[0.09, 0.09, 0.03]} />
            <Flat color={hi} />
          </mesh>
        </group>
      );
    case "lightning-bolt":
      return (
        <group position={[0, 1.34, z]}>
          {[
            [0.06, 0.13, -0.5],
            [-0.02, 0, -0.5],
            [-0.06, -0.14, -0.5],
          ].map(([x, y, r], i) => (
            <mesh key={i} position={[x, y, 0]} rotation={[0, 0, i % 2 ? -r : r]}>
              <boxGeometry args={[0.07, 0.2, 0.03]} />
              <Lit color={c} power={2.6} />
            </mesh>
          ))}
        </group>
      );

    /* ------------------------------------------------------------ shoulder */
    case "shoulder-guard":
      // One shoulder, the left, as the 2D avatar draws it. A pair is armour; one is a guard.
      return (
        <group position={[-0.44, SHOULDER + 0.04, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.2, 0.4]} />
            <meshStandardMaterial color={c} {...metal} />
          </mesh>
          <mesh castShadow position={[-0.04, 0.12, 0]}>
            <boxGeometry args={[0.24, 0.07, 0.36]} />
            <meshStandardMaterial color={hi} {...metal} />
          </mesh>
        </group>
      );

    /* ---------------------------------------------------------------- back */
    case "angel-wings":
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.26, 1.5, -0.2]} rotation={[0.1, s * 0.55, 0]}>
              {[0, 1, 2].map((i) => (
                <mesh key={i} castShadow position={[s * (0.2 + i * 0.22), 0.08 - i * 0.16, 0]} rotation={[0, 0, -s * (0.2 + i * 0.2)]}>
                  <boxGeometry args={[0.36, 0.42 - i * 0.08, 0.05]} />
                  <meshStandardMaterial
                    color="#f6f9ff"
                    flatShading
                    emissive="#cfe0ff"
                    emissiveIntensity={0.5}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              ))}
            </group>
          ))}
        </>
      );
    case "wings":
      // The quest pair: bigger, angular, and in the child's own colour rather than white.
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.26, 1.48, -0.22]} rotation={[0.08, s * 0.6, s * 0.3]}>
              <mesh castShadow>
                <boxGeometry args={[0.9, 0.62, 0.05]} />
                <meshStandardMaterial color={c} flatShading side={THREE.DoubleSide} transparent opacity={0.9} />
              </mesh>
              <mesh castShadow position={[s * 0.4, 0.24, 0.01]} rotation={[0, 0, -s * 0.5]}>
                <boxGeometry args={[0.4, 0.26, 0.04]} />
                <meshStandardMaterial color={hi} flatShading side={THREE.DoubleSide} transparent opacity={0.85} />
              </mesh>
            </group>
          ))}
        </>
      );

    /* ---------------------------------------------------------------- aura */
    case "star-map":
      // Not a chart in a pocket — the constellation itself, turning slowly at the shoulder.
      return (
        <group ref={orbit} position={[0, 1.9, 0]}>
          {[
            [0.62, 0.22, 0.1],
            [0.5, 0.42, -0.3],
            [0.72, -0.05, -0.2],
            [0.42, 0.12, 0.4],
            [0.66, 0.34, 0.34],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]}>
              <icosahedronGeometry args={[0.035 + (i % 2) * 0.012, 0]} />
              <Lit color={i % 2 ? "#ffe98a" : c} power={2.6} />
            </mesh>
          ))}
        </group>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------- hero */

export function HeroFigure({ look, gait }: { look: HeroLook; gait: React.RefObject<Gait> }) {
  const swing = useRef(0);
  const cape = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const g = gait.current;
    swing.current = Math.sin(g.phase) * 0.55 * g.speed;
    // A walk is legs AND a body that rises over each step. Two lines, and the hero stops
    // looking like a statue being pushed along the ground.
    const b = bob.current;
    if (b) b.position.y = Math.abs(Math.sin(g.phase)) * 0.055 * g.speed;
    const c = cape.current;
    if (c) {
      // It swings. That is the entire justification for the cape: a child reads motion long
      // before they read a costume.
      const lift2 = 0.16 + g.speed * (0.4 + Math.sin(g.phase * 0.5) * 0.12);
      c.rotation.x = THREE.MathUtils.damp(c.rotation.x, lift2, 7, dt);
      c.rotation.z = THREE.MathUtils.damp(c.rotation.z, Math.sin(g.phase * 0.5) * 0.12 * g.speed, 7, dt);
    }
  });

  const skirt = look.legs.shape === "skirt" && look.outfit.shape !== "robe";
  const hatY = HEAD_TOP + hairLift(look.hair);
  // How far forward the chest actually is, so a pendant hangs ON the body rather than inside it.
  const bodyFront =
    look.outfit.shape === "plate"
      ? look.outfit.pauldrons === "huge"
        ? 0.27
        : 0.25
      : look.outfit.shape === "robe"
        ? 0.37
        : 0.35;

  return (
    <group ref={bob}>
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
      <Pauldrons look={look} />
      <Arm look={look} side={-1} swingRef={swing} />
      <Arm look={look} side={1} swingRef={swing} />
      <Head look={look} />
      {look.crown && <CrownMesh crown={look.crown} y={hatY} />}
      <Accessory look={look} hatY={hatY} front={bodyFront} />

      {look.cape.on && (
        <group ref={cape} position={[0, TORSO_TOP - 0.06, -0.15]}>
          {/* the Cape outfit's whole point is the cape, so it gets a bigger one than a clasp does */}
          <mesh castShadow position={[0, look.outfit.id === "cape" ? -0.86 : -0.74, 0]}>
            <coneGeometry
              args={
                look.outfit.id === "cape"
                  ? [0.74, 1.76, 9, 1, false, Math.PI * 0.5, Math.PI]
                  : [0.6, 1.52, 9, 1, false, Math.PI * 0.52, Math.PI * 0.96]
              }
            />
            <meshStandardMaterial color={look.cape.color} flatShading side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.02, 0.06]}>
            <boxGeometry args={[0.44, 0.1, 0.16]} />
            <meshStandardMaterial color={look.crown?.color ?? GOLD} flatShading metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* -------------------------------------------------------------- companion */

/** A limb that swings from its top end, on a shared phase. Four of these make a walk. */
function Limb({
  phase,
  offset,
  amp,
  x,
  y,
  z,
  w,
  h,
  d,
  children,
}: {
  phase: React.RefObject<number>;
  offset: number;
  amp: React.RefObject<number>;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  children: React.ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = Math.sin(phase.current + offset) * amp.current;
  });
  return (
    <group ref={g} position={[x, y, z]}>
      <mesh castShadow position={[0, -h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        {children}
      </mesh>
    </group>
  );
}

/** A wing that beats, on its own clock so two fliers never look like one animation. */
function Wing({
  side,
  beat,
  x,
  y,
  z,
  len,
  span,
  tilt = 0,
  children,
}: {
  side: number;
  beat: React.RefObject<number>;
  x: number;
  y: number;
  z: number;
  len: number;
  span: number;
  tilt?: number;
  children: React.ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.z = side * (tilt + beat.current);
  });
  return (
    <group ref={g} position={[x, y, z]}>
      <mesh castShadow position={[(side * len) / 2, 0, 0]}>
        <boxGeometry args={[len, 0.04, span]} />
        {children}
      </mesh>
    </group>
  );
}

/**
 * Trots a pace behind the hero's shoulder.
 *
 * The first version of this slid along at a fixed height with its legs welded still, which is
 * exactly what a child sees and calls "floating". So: it is driven by how far it actually
 * travelled this frame (no foot-sliding), it stands on the real terrain under its own feet, it
 * breaks into a proper run when it has fallen behind, and it stops — legs still, standing — when
 * the hero stops. Fliers hover on purpose instead, out of phase with the hero's steps, and beat
 * whatever wings they have.
 */
export function Companion({
  look,
  heroRef,
  facingRef,
}: {
  look: CompanionLook;
  heroRef: React.RefObject<THREE.Vector3>;
  facingRef: React.RefObject<number>;
}) {
  const g = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const t = useRef(0);
  /** Distance-driven, so a foot on the ground stays on that spot while it is down. */
  const phase = useRef(0);
  /** How far the legs swing right now: 0 standing, up to ~0.7 at a run. */
  const amp = useRef(0);
  const beat = useRef(0);
  const speed = useRef(0);
  const target = useMemo(() => new THREE.Vector3(), []);
  const prev = useMemo(() => new THREE.Vector3(), []);
  const flier = look.gait === "fly";
  const hop = look.gait === "hop" || look.gait === "bob";

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
    target.set(wx, 0, wz);

    prev.copy(grp.position);
    const dx = target.x - grp.position.x;
    const dz = target.z - grp.position.z;
    const dist = Math.hypot(dx, dz);

    // A real chase, not a spring: it holds station inside the dead zone (so it STOPS when the
    // hero stops, rather than creeping), and winds up to a run the further behind it falls.
    const DEAD = flier ? 0.5 : 0.32;
    const want = dist < DEAD ? 0 : Math.min(9, (dist - DEAD) * 4.2 + 1.2);
    speed.current = THREE.MathUtils.damp(speed.current, want, 6, dt);
    if (speed.current > 0.02 && dist > 0.001) {
      const step = Math.min(speed.current * dt, dist);
      grp.position.x += (dx / dist) * step;
      grp.position.z += (dz / dist) * step;
    }

    // Its feet, on the ground that is actually under them.
    const groundY = heightAt(grp.position.x, grp.position.z);
    grp.position.y = flier ? groundY : THREE.MathUtils.damp(grp.position.y, groundY, 12, dt);

    const moved = Math.hypot(grp.position.x - prev.x, grp.position.z - prev.z);

    // Face where it is going while it moves; fall in with the hero once it arrives.
    if (moved > 0.004) {
      const heading = Math.atan2(dx, dz);
      grp.rotation.y = dampAngle(grp.rotation.y, heading, 8, dt);
    } else {
      grp.rotation.y = dampAngle(grp.rotation.y, f, 5, dt);
    }

    const b = body.current;
    if (flier) {
      // Deliberate hover: slow, and on its own clock so it never looks like a stuck walk.
      beat.current = Math.sin(t.current * 8.5) * 0.55;
      if (b) {
        b.position.y = look.scale * (1.2 + Math.sin(t.current * 2.2) * 0.13);
        b.rotation.z = Math.sin(t.current * 2.2 + 1) * 0.07;
        b.rotation.x = -Math.min(0.3, speed.current * 0.04);
      }
      amp.current = 0;
      return;
    }

    // One stride per ~0.62m travelled: the legs turn over because the ground went past.
    phase.current += (moved / (0.62 * look.scale)) * Math.PI * 2;
    const run = Math.min(1, speed.current / 4.5);
    amp.current = THREE.MathUtils.damp(amp.current, moved > 0.0008 ? 0.35 + run * 0.35 : 0, 8, dt);

    if (!b) return;
    if (hop) {
      // Hoppers leave the ground properly, and only when they are going somewhere.
      const h = Math.abs(Math.sin(phase.current * 0.5));
      const on = Math.min(1, speed.current / 2);
      b.position.y = h * 0.3 * look.scale * on;
      b.rotation.x = -h * 0.25 * on;
      const squash = 1 - (1 - h) * 0.2 * on;
      b.scale.set(look.scale * (2 - squash), look.scale * squash, look.scale * (2 - squash));
    } else if (look.gait === "slither") {
      b.position.y = 0;
      b.rotation.y = Math.sin(phase.current * 0.5) * 0.3 * Math.min(1, speed.current);
      b.position.x = Math.sin(phase.current * 0.5) * 0.06 * Math.min(1, speed.current);
    } else {
      // A walker's body rises twice per stride, in time with the feet that are carrying it.
      b.position.y = Math.abs(Math.sin(phase.current)) * 0.045 * look.scale * amp.current * 2.6;
      b.rotation.x = Math.sin(phase.current * 2) * 0.03 * amp.current;
    }
  });

  return (
    <group ref={g}>
      <group ref={body} scale={hop ? undefined : look.scale}>
        <Beast look={look} phase={phase} amp={amp} beat={beat} />
      </group>
    </group>
  );
}

/** Shortest-way-round damping for a heading, so a companion never spins the long way. */
function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * (1 - Math.exp(-lambda * dt));
}

/* ------------------------------------------------------------- the beasts */

type BeastProps = {
  look: CompanionLook;
  phase: React.RefObject<number>;
  amp: React.RefObject<number>;
  beat: React.RefObject<number>;
};

/** One material for a whole animal: its colour, its ghostliness and its glow in one place. */
function hide(look: CompanionLook, color?: string) {
  const c = color ?? look.color;
  return (
    <meshStandardMaterial
      color={c}
      flatShading
      roughness={0.75}
      transparent={look.ghost}
      opacity={look.ghost ? 0.5 : 1}
      {...(look.glow ? { emissive: c, emissiveIntensity: 0.6 } : {})}
    />
  );
}

/**
 * The four-legged frame every walker is built on: body, four swinging legs, a neck and a head.
 * Ears, snout and tail are what tell a cat from a wolf, so those are always spelled out by the
 * caller rather than shared.
 */
function Quad({
  look,
  phase,
  amp,
  bodyL,
  bodyH,
  bodyW,
  legH,
  legW = 0.1,
  headY,
  headSize,
  color,
  children,
}: BeastProps & {
  bodyL: number;
  bodyH: number;
  bodyW: number;
  legH: number;
  legW?: number;
  headY: number;
  headSize: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const bodyY = legH + bodyH / 2;
  const mat = () => hide(look, color);
  return (
    <>
      <mesh castShadow position={[0, bodyY, 0]}>
        <boxGeometry args={[bodyW, bodyH, bodyL]} />
        {mat()}
      </mesh>
      {/* the four legs, on diagonal pairs, which is what an animal actually does */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Limb
            key={`${sx}${sz}`}
            phase={phase}
            offset={sx * sz > 0 ? 0 : Math.PI}
            amp={amp}
            x={sx * (bodyW / 2 - legW / 2)}
            y={legH}
            z={sz * (bodyL / 2 - legW)}
            w={legW}
            h={legH}
            d={legW * 1.1}
          >
            {mat()}
          </Limb>
        )),
      )}
      <mesh castShadow position={[0, bodyY + headY, bodyL / 2 + headSize / 2 - 0.02]}>
        <boxGeometry args={[headSize, headSize, headSize]} />
        {mat()}
      </mesh>
      {children}
    </>
  );
}

function Ears({
  look,
  y,
  z,
  kind,
  spread,
  size,
}: {
  look: CompanionLook;
  y: number;
  z: number;
  kind: "point" | "flop" | "round" | "tall" | "tuft";
  spread: number;
  size: number;
}) {
  return (
    <>
      {[-1, 1].map((s) => {
        if (kind === "flop") {
          return (
            <mesh key={s} castShadow position={[s * spread, y - size * 0.5, z]} rotation={[0, 0, s * 0.25]}>
              <boxGeometry args={[size * 0.5, size * 1.5, size * 0.3]} />
              {hide(look, shade(look.color, 0.2))}
            </mesh>
          );
        }
        if (kind === "round") {
          return (
            <mesh key={s} castShadow position={[s * spread, y, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[size * 0.55, size * 0.55, size * 0.3, 7]} />
              {hide(look)}
            </mesh>
          );
        }
        if (kind === "tall") {
          return (
            <mesh key={s} castShadow position={[s * spread, y + size, z]} rotation={[0, 0, s * 0.16]}>
              <boxGeometry args={[size * 0.5, size * 2.6, size * 0.35]} />
              {hide(look)}
            </mesh>
          );
        }
        return (
          <mesh key={s} castShadow position={[s * spread, y, z]} rotation={[0, 0, s * (kind === "tuft" ? 0.5 : 0.18)]}>
            <coneGeometry args={[size * 0.5, size * (kind === "tuft" ? 1.9 : 1.3), 4]} />
            {hide(look)}
          </mesh>
        );
      })}
    </>
  );
}

function Beast({ look, phase, amp, beat }: BeastProps) {
  const mat = () => hide(look);
  const dark = () => hide(look, shade(look.color, 0.25));
  const pale = () => hide(look, lift(look.color, 0.35));
  const eyes = (y: number, z: number, spread: number, size = 0.035, color = "#14141f") => (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * spread, y, z]}>
          <boxGeometry args={[size, size, 0.02]} />
          <meshStandardMaterial
            color={color}
            emissive={look.glow ? color : "#000000"}
            emissiveIntensity={look.glow ? 1.4 : 0}
          />
        </mesh>
      ))}
    </>
  );

  switch (look.shape) {
    case "cat":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.5} bodyH={0.24} bodyW={0.26} legH={0.2} legW={0.08} headY={0.1} headSize={0.24}>
          <Ears look={look} y={0.56} z={0.32} kind="point" spread={0.08} size={0.1} />
          {eyes(0.55, 0.42, 0.06)}
          {/* the tail stands straight up and hooks over. Nothing else in the catalog does that. */}
          <mesh castShadow position={[0, 0.5, -0.27]}>
            <boxGeometry args={[0.055, 0.34, 0.055]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.66, -0.22]} rotation={[0.7, 0, 0]}>
            <boxGeometry args={[0.055, 0.14, 0.055]} />
            {mat()}
          </mesh>
        </Quad>
      );

    case "dog":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.58} bodyH={0.28} bodyW={0.3} legH={0.22} legW={0.09} headY={0.11} headSize={0.27}>
          <Ears look={look} y={0.68} z={0.34} kind="flop" spread={0.14} size={0.11} />
          {eyes(0.66, 0.46, 0.07)}
          <mesh castShadow position={[0, 0.56, 0.5]}>
            <boxGeometry args={[0.14, 0.12, 0.14]} />
            {dark()}
          </mesh>
          {/* up and wagging — the dog's whole personality is in this one box */}
          <mesh castShadow position={[0, 0.56, -0.3]} rotation={[-0.6, 0, 0]}>
            <boxGeometry args={[0.07, 0.3, 0.07]} />
            {mat()}
          </mesh>
        </Quad>
      );

    case "fox":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.48} bodyH={0.22} bodyW={0.24} legH={0.2} legW={0.07} headY={0.1} headSize={0.22}>
          <Ears look={look} y={0.56} z={0.3} kind="tuft" spread={0.09} size={0.11} />
          {eyes(0.52, 0.4, 0.06)}
          {/* a long narrow snout with a white tip */}
          <mesh castShadow position={[0, 0.47, 0.46]}>
            <boxGeometry args={[0.1, 0.09, 0.16]} />
            {mat()}
          </mesh>
          <mesh position={[0, 0.47, 0.545]}>
            <boxGeometry args={[0.07, 0.06, 0.03]} />
            {hide(look, "#f4f4f4")}
          </mesh>
          {/* the brush: fat, low and tipped white. Told apart from a wolf at fifty paces. */}
          <mesh castShadow position={[0, 0.34, -0.36]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.15, 0.15, 0.36]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.25, -0.52]}>
            <boxGeometry args={[0.13, 0.13, 0.1]} />
            {hide(look, "#f4f4f4")}
          </mesh>
        </Quad>
      );

    case "wolf":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.68} bodyH={0.3} bodyW={0.32} legH={0.3} legW={0.1} headY={0.02} headSize={0.28}>
          <Ears look={look} y={0.76} z={0.4} kind="point" spread={0.1} size={0.1} />
          {eyes(0.7, 0.5, 0.08, 0.04, "#ffd24a")}
          <mesh castShadow position={[0, 0.63, 0.58]}>
            <boxGeometry args={[0.13, 0.12, 0.18]} />
            {dark()}
          </mesh>
          {/* the ruff at the shoulders is the wolf's silhouette; a fox has none */}
          <mesh castShadow position={[0, 0.63, 0.22]}>
            <boxGeometry args={[0.4, 0.3, 0.16]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.5, -0.4]} rotation={[0.9, 0, 0]}>
            <boxGeometry args={[0.12, 0.12, 0.34]} />
            {mat()}
          </mesh>
        </Quad>
      );

    case "bear":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.72} bodyH={0.46} bodyW={0.46} legH={0.24} legW={0.15} headY={0.12} headSize={0.34}>
          <Ears look={look} y={0.96} z={0.46} kind="round" spread={0.15} size={0.11} />
          {eyes(0.86, 0.66, 0.08)}
          <mesh castShadow position={[0, 0.78, 0.68]}>
            <boxGeometry args={[0.16, 0.13, 0.12]} />
            {dark()}
          </mesh>
          <mesh castShadow position={[0, 0.66, -0.38]}>
            <boxGeometry args={[0.1, 0.1, 0.08]} />
            {mat()}
          </mesh>
        </Quad>
      );

    case "rabbit":
      return (
        <>
          <mesh castShadow position={[0, 0.26, 0]}>
            <boxGeometry args={[0.24, 0.24, 0.34]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.36, 0.22]}>
            <boxGeometry args={[0.2, 0.2, 0.18]} />
            {mat()}
          </mesh>
          <Ears look={look} y={0.5} z={0.2} kind="tall" spread={0.06} size={0.08} />
          {eyes(0.38, 0.31, 0.06)}
          {/* big hind legs folded under it: the reason a rabbit hops and a cat does not */}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.13, 0.13, -0.08]}>
              <boxGeometry args={[0.09, 0.2, 0.22]} />
              {mat()}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`f${s}`} castShadow position={[s * 0.09, 0.09, 0.14]}>
              <boxGeometry args={[0.07, 0.16, 0.08]} />
              {mat()}
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.28, -0.2]}>
            <icosahedronGeometry args={[0.08, 0]} />
            {hide(look, "#f4f4f4")}
          </mesh>
        </>
      );

    case "frog":
      return (
        <>
          <mesh castShadow position={[0, 0.26, 0]}>
            <boxGeometry args={[0.38, 0.26, 0.36]} />
            {mat()}
          </mesh>
          {/* eyes ON TOP, which is the whole of what makes a frog read as a frog */}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.11, 0.42, 0.1]}>
              <icosahedronGeometry args={[0.085, 0]} />
              {pale()}
            </mesh>
          ))}
          {eyes(0.44, 0.18, 0.11, 0.05)}
          <mesh position={[0, 0.2, 0.19]}>
            <boxGeometry args={[0.22, 0.035, 0.02]} />
            {dark()}
          </mesh>
          {/* folded haunches, higher than the body: a frog is a coiled spring */}
          {[-1, 1].map((s) => (
            <mesh key={`h${s}`} castShadow position={[s * 0.23, 0.26, -0.08]} rotation={[0, 0, s * 0.35]}>
              <boxGeometry args={[0.12, 0.22, 0.28]} />
              {mat()}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`s${s}`} castShadow position={[s * 0.24, 0.08, 0.02]}>
              <boxGeometry args={[0.13, 0.08, 0.2]} />
              {dark()}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`a${s}`} castShadow position={[s * 0.16, 0.1, 0.18]}>
              <boxGeometry args={[0.07, 0.2, 0.07]} />
              {mat()}
            </mesh>
          ))}
        </>
      );

    case "turtle":
      return (
        <>
          {/* the shell is a dome, and nothing else in the catalog is domed */}
          {/* the shell rides high enough that the legs and the head are not swallowed by it */}
          <mesh castShadow position={[0, 0.34, 0]} scale={[1, 0.6, 1.15]}>
            <icosahedronGeometry args={[0.3, 1]} />
            {hide(look, shade(look.color, 0.3))}
          </mesh>
          <mesh castShadow position={[0, 0.24, 0]}>
            <boxGeometry args={[0.44, 0.1, 0.48]} />
            {pale()}
          </mesh>
          <mesh castShadow position={[0, 0.28, 0.32]}>
            <boxGeometry args={[0.17, 0.15, 0.2]} />
            {mat()}
          </mesh>
          {eyes(0.31, 0.42, 0.055, 0.032)}
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <Limb key={`${sx}${sz}`} phase={phase} offset={sx * sz > 0 ? 0 : Math.PI} amp={amp} x={sx * 0.2} y={0.2} z={sz * 0.17} w={0.12} h={0.2} d={0.14}>
                {mat()}
              </Limb>
            )),
          )}
          <mesh castShadow position={[0, 0.26, -0.32]} rotation={[0.3, 0, 0]}>
            <coneGeometry args={[0.05, 0.14, 4]} />
            {mat()}
          </mesh>
        </>
      );

    case "snake":
      // A coil on the ground with the front third reared up. Banded, so the coil reads as a body.
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh
              key={i}
              castShadow
              position={[Math.sin(i * 1.5) * 0.17, 0.11, -0.3 + i * 0.13 + Math.cos(i * 1.5) * 0.07]}
              rotation={[0, i * 0.5, 0]}
            >
              <boxGeometry args={[0.19 - i * 0.012, 0.19 - i * 0.012, 0.19]} />
              {i % 2 ? pale() : mat()}
            </mesh>
          ))}
          {/* the reared neck and head, well clear of the ground */}
          <mesh castShadow position={[0.04, 0.28, 0.28]} rotation={[0.5, 0, -0.2]}>
            <boxGeometry args={[0.15, 0.24, 0.15]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0.04, 0.44, 0.36]}>
            <boxGeometry args={[0.18, 0.13, 0.22]} />
            {mat()}
          </mesh>
          {eyes(0.48, 0.45, 0.06, 0.04, "#ffcc33")}
          <mesh position={[0.04, 0.4, 0.5]}>
            <boxGeometry args={[0.02, 0.02, 0.12]} />
            <meshStandardMaterial color="#d94a4a" />
          </mesh>
        </>
      );

    case "slime":
      return (
        <>
          <mesh castShadow position={[0, 0.26, 0]}>
            <icosahedronGeometry args={[0.31, 0]} />
            <meshStandardMaterial
              color={look.color}
              flatShading
              transparent
              opacity={0.9}
              roughness={0.25}
              {...(look.glow ? { emissive: look.color, emissiveIntensity: 0.6 } : {})}
            />
          </mesh>
          {eyes(0.3, 0.26, 0.09, 0.05)}
          <mesh position={[-0.08, 0.4, 0.18]}>
            <icosahedronGeometry args={[0.05, 0]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.55} />
          </mesh>
        </>
      );

    case "owl":
      // Upright, round, and all head. An owl perched is not a hawk in flight.
      return (
        <>
          <mesh castShadow position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.16, 0.2, 0.34, 8]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.5, 0]}>
            <icosahedronGeometry args={[0.2, 0]} />
            {mat()}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.09, 0.52, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.03, 8]} />
              <meshStandardMaterial color="#ffd24a" flatShading />
            </mesh>
          ))}
          {eyes(0.52, 0.195, 0.09, 0.055)}
          <mesh position={[0, 0.45, 0.19]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.035, 0.09, 4]} />
            <meshStandardMaterial color={GOLD} flatShading />
          </mesh>
          <Ears look={look} y={0.66} z={0.02} kind="tuft" spread={0.12} size={0.07} />
          <Wing side={-1} beat={beat} x={-0.16} y={0.28} z={0} len={0.24} span={0.3} tilt={0.2}>
            {dark()}
          </Wing>
          <Wing side={1} beat={beat} x={0.16} y={0.28} z={0} len={0.24} span={0.3} tilt={0.2}>
            {dark()}
          </Wing>
        </>
      );

    case "hawk":
      return (
        <>
          <mesh castShadow position={[0, 0.1, 0]} scale={[1, 1, 1.5]}>
            <icosahedronGeometry args={[0.16, 0]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.2, 0.2]}>
            <boxGeometry args={[0.15, 0.14, 0.16]} />
            {dark()}
          </mesh>
          {eyes(0.22, 0.28, 0.055, 0.03, "#ffd24a")}
          <mesh position={[0, 0.16, 0.31]} rotation={[1.9, 0, 0]}>
            <coneGeometry args={[0.035, 0.11, 4]} />
            <meshStandardMaterial color={GOLD} flatShading />
          </mesh>
          {/* swept wings and a fanned tail: a bird built for speed, not for perching */}
          <Wing side={-1} beat={beat} x={-0.1} y={0.14} z={0.02} len={0.44} span={0.24} tilt={0.12}>
            {dark()}
          </Wing>
          <Wing side={1} beat={beat} x={0.1} y={0.14} z={0.02} len={0.44} span={0.24} tilt={0.12}>
            {dark()}
          </Wing>
          <mesh castShadow position={[0, 0.1, -0.3]}>
            <boxGeometry args={[0.22, 0.03, 0.22]} />
            {dark()}
          </mesh>
        </>
      );

    case "bat":
      return (
        <>
          <mesh castShadow position={[0, 0.1, 0]}>
            <boxGeometry args={[0.14, 0.2, 0.14]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.24, 0.02]}>
            <boxGeometry args={[0.15, 0.13, 0.14]} />
            {mat()}
          </mesh>
          <Ears look={look} y={0.36} z={0.0} kind="tuft" spread={0.06} size={0.09} />
          {eyes(0.25, 0.09, 0.045, 0.03, "#ff5555")}
          {/* membranes, not feathers: two flat sheets with a scalloped lower edge */}
          {[-1, 1].map((s) => (
            <Wing key={s} side={s} beat={beat} x={s * 0.07} y={0.16} z={0} len={0.38} span={0.26} tilt={0.15}>
              <meshStandardMaterial
                color={shade(look.color, 0.2)}
                flatShading
                side={THREE.DoubleSide}
                transparent
                opacity={0.88}
              />
            </Wing>
          ))}
        </>
      );

    case "dragon": {
      const glowy = look.glow;
      return (
        <>
          <mesh castShadow position={[0, 0.1, -0.02]} scale={[1, 1, 1.4]}>
            <icosahedronGeometry args={[0.22, 0]} />
            {mat()}
          </mesh>
          {/* body, NECK, head — the neck is the reason a dragon is not a bird */}
          <mesh castShadow position={[0, 0.26, 0.2]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 0.3, 6]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.4, 0.34]}>
            <boxGeometry args={[0.18, 0.16, 0.26]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.36, 0.48]}>
            <boxGeometry args={[0.13, 0.1, 0.12]} />
            {dark()}
          </mesh>
          {eyes(0.44, 0.44, 0.07, 0.035, "#ffd24a")}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.07, 0.52, 0.28]} rotation={[-0.5, 0, s * 0.4]}>
              <coneGeometry args={[0.035, 0.16, 4]} />
              {hide(look, glowy ? "#ffe9a8" : BONE)}
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <Wing key={s} side={s} beat={beat} x={s * 0.14} y={0.22} z={-0.04} len={0.5} span={0.36} tilt={0.25}>
              <meshStandardMaterial
                color={lift(look.color, 0.25)}
                flatShading
                side={THREE.DoubleSide}
                transparent
                opacity={0.92}
                {...(glowy ? { emissive: look.color, emissiveIntensity: 0.5 } : {})}
              />
            </Wing>
          ))}
          {/* a tapering tail with a spade on the end */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[0, 0.1 - i * 0.015, -0.3 - i * 0.16]}>
              <boxGeometry args={[0.12 - i * 0.03, 0.11 - i * 0.03, 0.18]} />
              {mat()}
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.06, -0.68]} rotation={[0.2, 0, 0]}>
            <coneGeometry args={[0.09, 0.16, 4]} />
            {pale()}
          </mesh>
          {/* tucked legs, so it reads as airborne rather than as a walker that forgot */}
          {[-1, 1].map((s) => (
            <mesh key={`l${s}`} castShadow position={[s * 0.14, -0.02, 0.06]} rotation={[0.6, 0, 0]}>
              <boxGeometry args={[0.08, 0.16, 0.08]} />
              {mat()}
            </mesh>
          ))}
        </>
      );
    }

    case "hydra":
      // One body, three necks. Nothing subtle about it, and that is right.
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.6} bodyH={0.34} bodyW={0.42} legH={0.2} legW={0.12} headY={-0.4} headSize={0.01}>
          {[-1, 0, 1].map((s) => (
            <group key={s} position={[s * 0.15, 0.37, 0.22]} rotation={[0, 0, -s * 0.35]}>
              <mesh castShadow position={[0, 0.16, 0.06]} rotation={[0.35, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.075, 0.34, 5]} />
                {mat()}
              </mesh>
              <mesh castShadow position={[0, 0.34, 0.16]}>
                <boxGeometry args={[0.14, 0.12, 0.2]} />
                {s === 0 ? pale() : mat()}
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={e} position={[e * 0.05, 0.37, 0.25]}>
                  <boxGeometry args={[0.03, 0.03, 0.02]} />
                  <meshStandardMaterial color="#ffd24a" />
                </mesh>
              ))}
            </group>
          ))}
          <mesh castShadow position={[0, 0.42, -0.36]} rotation={[0.7, 0, 0]}>
            <coneGeometry args={[0.09, 0.3, 5]} />
            {mat()}
          </mesh>
        </Quad>
      );

    case "griffin":
      // Eagle in front, lion behind. The join is the joke and it needs to be visible.
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.58} bodyH={0.3} bodyW={0.32} legH={0.26} legW={0.1} headY={0.16} headSize={0.24} >
          <mesh castShadow position={[0, 0.72, 0.42]} rotation={[1.9, 0, 0]}>
            <coneGeometry args={[0.05, 0.16, 4]} />
            <meshStandardMaterial color={GOLD} flatShading />
          </mesh>
          {eyes(0.76, 0.4, 0.07, 0.035)}
          <Ears look={look} y={0.86} z={0.3} kind="tuft" spread={0.08} size={0.06} />
          {[-1, 1].map((s) => (
            <Wing key={s} side={s} beat={beat} x={s * 0.15} y={0.48} z={0.02} len={0.46} span={0.34} tilt={0.3}>
              {hide(look, shade(look.color, 0.25))}
            </Wing>
          ))}
          <mesh castShadow position={[0, 0.42, -0.34]} rotation={[0.8, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.03, 0.3, 5]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.3, -0.46]}>
            <icosahedronGeometry args={[0.07, 0]} />
            {pale()}
          </mesh>
        </Quad>
      );

    case "horse":
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.66} bodyH={0.3} bodyW={0.3} legH={0.38} legW={0.09} headY={-0.4} headSize={0.01}>
          {/* a real neck carrying the head up and forward: the horse silhouette */}
          <mesh castShadow position={[0, 0.66, 0.28]} rotation={[0.42, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.13, 0.36, 6]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.86, 0.42]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.15, 0.16, 0.3]} />
            {mat()}
          </mesh>
          {eyes(0.9, 0.5, 0.07, 0.035)}
          <Ears look={look} y={0.98} z={0.36} kind="point" spread={0.06} size={0.07} />
          {/* mane down the neck and a tail to match */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[0, 0.78 - i * 0.1, 0.34 - i * 0.1]} rotation={[0.42, 0, 0]}>
              <boxGeometry args={[0.05, 0.16, 0.12]} />
              {pale()}
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.6, -0.34]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.08, 0.34, 0.1]} />
            {pale()}
          </mesh>
          {look.horn && (
            <mesh castShadow position={[0, 1.04, 0.5]} rotation={[0.35, 0, 0]}>
              <coneGeometry args={[0.04, 0.26, 5]} />
              <meshStandardMaterial color="#fff2c4" flatShading emissive="#ffd766" emissiveIntensity={0.9} />
            </mesh>
          )}
          {look.wings &&
            [-1, 1].map((s) => (
              <Wing key={s} side={s} beat={beat} x={s * 0.14} y={0.62} z={0.02} len={0.5} span={0.38} tilt={0.3}>
                <meshStandardMaterial
                  color={lift(look.color, 0.4)}
                  flatShading
                  side={THREE.DoubleSide}
                  emissive={lift(look.color, 0.4)}
                  emissiveIntensity={0.25}
                />
              </Wing>
            ))}
        </Quad>
      );

    case "phoenix":
      return (
        <>
          <mesh castShadow position={[0, 0.12, 0]} scale={[1, 1.2, 1]}>
            <icosahedronGeometry args={[0.16, 0]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.32, 0.08]}>
            <boxGeometry args={[0.14, 0.13, 0.15]} />
            {pale()}
          </mesh>
          {eyes(0.34, 0.16, 0.05, 0.03)}
          <mesh position={[0, 0.29, 0.19]} rotation={[1.9, 0, 0]}>
            <coneGeometry args={[0.03, 0.09, 4]} />
            <meshStandardMaterial color={GOLD} flatShading />
          </mesh>
          {/* a crest and a tail of three long flames: the bird IS the fire */}
          {[-0.06, 0, 0.06].map((x, i) => (
            <mesh key={i} castShadow position={[x, 0.46 + (i === 1 ? 0.06 : 0), 0.04]} rotation={[-0.4, 0, x * 4]}>
              <coneGeometry args={[0.035, 0.18, 4]} />
              <Lit color={lift(look.color, 0.5)} power={1.4} />
            </mesh>
          ))}
          {[-1, 0, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.08, 0.12 + Math.abs(s) * 0.04, -0.28]} rotation={[0.5, 0, s * 0.4]}>
              <coneGeometry args={[0.06, 0.42 - Math.abs(s) * 0.08, 4]} />
              <Lit color={s === 0 ? lift(look.color, 0.55) : look.color} power={1.3} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <Wing key={s} side={s} beat={beat} x={s * 0.1} y={0.16} z={0} len={0.42} span={0.3} tilt={0.2}>
              <meshStandardMaterial
                color={lift(look.color, 0.35)}
                flatShading
                side={THREE.DoubleSide}
                emissive={look.color}
                emissiveIntensity={1.1}
              />
            </Wing>
          ))}
        </>
      );

    case "fairy":
      return (
        <>
          <mesh castShadow position={[0, 0.12, 0]}>
            <boxGeometry args={[0.1, 0.22, 0.09]} />
            {mat()}
          </mesh>
          <mesh castShadow position={[0, 0.3, 0]}>
            <boxGeometry args={[0.14, 0.14, 0.13]} />
            <meshStandardMaterial color="#fde0c4" flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.38, -0.01]}>
            <boxGeometry args={[0.16, 0.08, 0.15]} />
            {pale()}
          </mesh>
          {eyes(0.3, 0.068, 0.035, 0.022)}
          {/* four shimmering panes, not two: a fairy's wings are an insect's */}
          {[-1, 1].map((s) =>
            [0, 1].map((i) => (
              <Wing
                key={`${s}${i}`}
                side={s}
                beat={beat}
                x={s * 0.04}
                y={0.22 - i * 0.1}
                z={-0.04}
                len={0.24 - i * 0.06}
                span={0.16}
                tilt={0.3 - i * 0.5}
              >
                <meshStandardMaterial
                  color={lift(look.color, 0.6)}
                  flatShading
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.55}
                  emissive={lift(look.color, 0.5)}
                  emissiveIntensity={1.2}
                />
              </Wing>
            )),
          )}
          <pointLight position={[0, 0.25, 0]} intensity={1.2} distance={2.4} decay={2} color={lift(look.color, 0.5)} />
        </>
      );

    default:
      return (
        <Quad look={look} phase={phase} amp={amp} beat={beat} bodyL={0.58} bodyH={0.28} bodyW={0.3} legH={0.22} headY={0.1} headSize={0.26}>
          {eyes(0.66, 0.44, 0.07)}
        </Quad>
      );
  }
}

/** Kept for the scene: a companion's look, as the mapping layer hands it over. */
export type { CompanionLook, GearLook };
