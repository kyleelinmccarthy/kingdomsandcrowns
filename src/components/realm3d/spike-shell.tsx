"use client";

/**
 * SPIKE — throwaway. The `next/dynamic` boundary, copied from `realm-shell.tsx` for the same
 * reason: `three` must never be reachable from a module graph Vitest loads, and it must never
 * be imported on the server. Everything three-shaped lives behind this.
 */

import dynamic from "next/dynamic";

const SpikeScene = dynamic(() => import("./spike-scene"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-muted-foreground">Raising the hills…</p>,
});

export function Realm3dSpike() {
  return <SpikeScene />;
}
