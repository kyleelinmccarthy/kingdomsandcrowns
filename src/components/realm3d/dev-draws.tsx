"use client";

/**
 * Development only: how many draw calls the island's previous frame took, on `window.__realmDraws`,
 * for the browser checks that hold a change to "no worse than before". Read in `useFrame`, before
 * this frame renders, so it is the last frame's whole count (three resets it as each render starts).
 */

import { useFrame } from "@react-three/fiber";

declare global {
  interface Window {
    __realmDraws?: number;
  }
}

export function DevDraws() {
  useFrame(({ gl }) => {
    window.__realmDraws = gl.info.render.calls;
  });
  return null;
}
