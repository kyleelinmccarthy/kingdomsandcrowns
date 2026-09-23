"use client";

/**
 * A SITE NOBODY HAS FINISHED YET, drawn from `buildSite` in `lib/realm3d/site-stages.ts`: the
 * plot, the footing, the frame and the roof timbers, as far as the child's deeds have raised
 * them, and the stack of timber waiting beside it. One merged, vertex-coloured mesh per site.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildSite, siteStage, type PieceKind } from "@/lib/realm3d/site-stages";
import { litMaterial, merge, paint } from "./geo-kit";

/** Fresh-cut timber is pale; the frame that has stood a while has weathered a shade. */
const COLOR: Record<PieceKind, string> = {
  pad: "#8f7a58",
  stone: "#a39b8a",
  sill: "#8a6a42",
  post: "#9a7446",
  plate: "#9a7446",
  brace: "#a88252",
  rafter: "#b08a58",
  ridge: "#8a6a42",
  board: "#c49a62",
  stake: "#7c5c38",
  line: "#efe6c8",
  ladder: "#7c5c38",
};

export function ConstructionSite({
  x,
  y,
  z,
  w,
  d,
  wallH,
  roofH,
  done,
  total,
  side,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  wallH: number;
  roofH: number;
  done: number;
  total: number;
  /** Which side of the plot, in x, the timber stack goes: away from the road. */
  side: 1 | -1;
}) {
  const stage = siteStage(done, total);
  const geo = useMemo(() => {
    const { pieces } = buildSite(w, d, wallH, roofH, stage, side);
    const e = new THREE.Euler();
    const m = new THREE.Matrix4();
    const parts = pieces.map((p) => {
      const g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
      e.set(p.rx, 0, p.rz);
      m.makeRotationFromEuler(e).setPosition(p.x, p.y, p.z);
      g.applyMatrix4(m);
      return paint(g, COLOR[p.kind]);
    });
    const merged = merge(parts);
    for (const part of parts) part.dispose();
    return merged;
  }, [w, d, wallH, roofH, stage, side]);
  const mat = useMemo(() => litMaterial(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);

  return <mesh geometry={geo} material={mat} position={[x, y, z]} castShadow receiveShadow />;
}
