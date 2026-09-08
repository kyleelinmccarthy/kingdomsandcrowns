"use client";

import { useRef, useState, type RefObject } from "react";
import type { Vec2, WorldLayout } from "@/lib/realm/layout";
import { setRecessActive, spawnGleams, startRecess, stepRecess, type RecessEvent, type RecessState } from "@/lib/realm/recess/recess";

export type RecessSimEvent = RecessEvent | { kind: "lapTick"; lapMs: number } | { kind: "recessStart" };
export type RecessSim = { state: RecessState; now: number; lastTickAt: number };
export type RecessSimInput = { layout: WorldLayout; hero: Vec2; dt: number; active: boolean; lowStimulus: boolean; seed: number };

export function startRecessSim(): RecessSim {
  return { state: startRecess(), now: 0, lastTickAt: 0 };
}

/** One frame of recess: activation, spawns, collection, laps, and a once-a-second lap tick for the HUD. */
export function stepRecessSim(sim: RecessSim, input: RecessSimInput, emit: (e: RecessSimEvent) => void): RecessSim {
  const now = sim.now + input.dt * 1000;
  let state = setRecessActive(sim.state, input.active);
  if (state.active && !sim.state.active) emit({ kind: "recessStart" });
  state = spawnGleams({ seed: input.seed, now, layout: input.layout, state, lowStimulus: input.lowStimulus });
  const stepped = stepRecess(state, input.hero, now);
  state = stepped.state;
  for (const e of stepped.events) emit(e);
  let lastTickAt = sim.lastTickAt;
  if (state.active && state.lapStartedAt !== null && now - lastTickAt >= 1000) {
    lastTickAt = now;
    emit({ kind: "lapTick", lapMs: now - state.lapStartedAt });
  }
  return { state, now, lastTickAt };
}

export function useRecessSimRef(): RefObject<RecessSim> {
  const [initial] = useState<RecessSim>(startRecessSim);
  return useRef<RecessSim>(initial);
}
