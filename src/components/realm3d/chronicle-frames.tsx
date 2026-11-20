"use client";

/**
 * THE CHRONICLE HALL'S FRAMES (E5): the hero's newest drawings, hung as framed pictures on the
 * hall's outer walls, two for every level built. Where each frame hangs is `hallFrameSlots`
 * (`improvement-spots.ts`, from the catalog); slot i shows the hero's i-th newest drawing, and a
 * slot with none yet shows a blank parchment in its frame.
 *
 * A sibling of the memoised `World`, mounted beside `Improvements`. `level` is a number from the
 * works' built levels and `drawings` is the visit's snapshot, so the props are stable and the whole
 * thing is built once per level (building the next level mid-visit hangs its frames; the drawings
 * stay the snapshot). One merged wooden geometry for every frame, one shared plane, and one
 * `CanvasTexture` per drawing painted by `drawStrokes` (the one stroke geometry every renderer
 * uses). The pictures are lit like the walls, so they dim with the day and never glow at night.
 * No `useFrame`, nothing solid, and every texture, material and geometry is disposed.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FRAME_DEPTH, FRAME_SIZE, IMPROVEMENT_COLORS } from "@/lib/realm/improvements";
import { hallFrameSlots } from "@/lib/realm3d/improvement-spots";
import { drawStrokes } from "@/lib/utils/draw-strokes";
import type { Drawing } from "@/lib/utils/drawing";
import { litMaterial, merge, paint } from "./geo-kit";

/** The texture each drawing is painted at: 4:3, like the pad. */
const TEX_W = 256;
const TEX_H = 192;
/** The wood a frame's border is cut from, and its width. */
const BORDER = 0.06;
/** The picture sits just inside the frame's front, so the border stands proud of it. */
const PICTURE_SET_BACK = 0.015;

const NONE: readonly Drawing[] = [];
const BLANK: Drawing = { v: 1, strokes: [] };

function textureOf(drawing: Drawing): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (ctx) drawStrokes(ctx, drawing, TEX_W, TEX_H);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One frame's four border pieces, in its own frame (centre at the origin, facing +z, back on z = 0). */
function borderParts(): THREE.BufferGeometry[] {
  const { w, h } = FRAME_SIZE;
  const wood = IMPROVEMENT_COLORS.timber;
  const bar = (sx: number, sy: number, x: number, y: number) => paint(new THREE.BoxGeometry(sx, sy, FRAME_DEPTH), wood).translate(x, y, FRAME_DEPTH / 2);
  return [
    bar(w, BORDER, 0, (h - BORDER) / 2),
    bar(w, BORDER, 0, -(h - BORDER) / 2),
    bar(BORDER, h - 2 * BORDER, -(w - BORDER) / 2, 0),
    bar(BORDER, h - 2 * BORDER, (w - BORDER) / 2, 0),
  ];
}

type Picture = { position: [number, number, number]; rotation: [number, number, number]; material: THREE.MeshStandardMaterial };

export function ChronicleFrames({ level, drawings = NONE, heightAt }: { level: number; drawings?: readonly Drawing[]; heightAt: (x: number, z: number) => number }) {
  const built = useMemo(() => {
    const slots = hallFrameSlots(level, heightAt);
    if (slots.length === 0) return null;
    const parts: THREE.BufferGeometry[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    // The empty slots all show the same blank page, so it is painted once.
    let blank: THREE.MeshStandardMaterial | null = null;
    const materialFor = (drawing: Drawing | undefined): THREE.MeshStandardMaterial => {
      if (!drawing && blank) return blank;
      const texture = textureOf(drawing ?? BLANK);
      // Matte parchment under the same light as the plaster around it.
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 });
      textures.push(texture);
      materials.push(material);
      if (!drawing) blank = material;
      return material;
    };
    const pictures: Picture[] = [];
    slots.forEach((s, i) => {
      for (const b of borderParts()) parts.push(b.rotateY(s.ry).translate(s.x, s.y, s.z));
      const out = FRAME_DEPTH - PICTURE_SET_BACK;
      pictures.push({
        position: [s.x + Math.sin(s.ry) * out, s.y, s.z + Math.cos(s.ry) * out],
        rotation: [0, s.ry, 0],
        material: materialFor(drawings[i]),
      });
    });
    const wood = merge(parts);
    for (const part of parts) part.dispose();
    const plane = new THREE.PlaneGeometry(FRAME_SIZE.w - 2 * BORDER, FRAME_SIZE.h - 2 * BORDER);
    return { wood, plane, pictures, textures, materials };
  }, [level, drawings, heightAt]);
  const woodMaterial = useMemo(() => litMaterial(), []);

  useEffect(
    () => () => {
      if (!built) return;
      built.wood.dispose();
      built.plane.dispose();
      for (const t of built.textures) t.dispose();
      for (const m of built.materials) m.dispose();
    },
    [built],
  );
  useEffect(() => () => woodMaterial.dispose(), [woodMaterial]);

  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.wood} material={woodMaterial} />
      {built.pictures.map((p, i) => (
        <mesh key={i} geometry={built.plane} material={p.material} position={p.position} rotation={p.rotation} />
      ))}
    </group>
  );
}
