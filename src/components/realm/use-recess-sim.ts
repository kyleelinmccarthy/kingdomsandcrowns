"use client";

import { useRef, useState, type RefObject } from "react";
import type { Vec2, WorldLayout } from "@/lib/realm/layout";
import { setRecessActive, spawnGleams, startRecess, stepRecess, type RecessEvent, type RecessState } from "@/lib/realm/recess/recess";

export type RecessSimEvent = RecessEvent | { kind: "recessStart" };
export type RecessSim = { state: RecessState; now: number };
export type RecessSimInput = { layout: WorldLayout; hero: Vec2; dt: number; active: boolean; lowStimulus: boolean; seed: number };

export function startRecessSim(): RecessSim {
  return { state: startRecess(), now: 0 };
}

/**
 * One frame of recess: activation, spawns, collection and finished laps.
 *
 * There is deliberately no running-lap tick. D6.4 deleted the lap clock from the recess pill,
 * which left the tick feeding a field nothing read; slice 12 brings the lap record back with
 * its own design, and can add the event it actually needs then.
 */
export function stepRecessSim(sim: RecessSim, input: RecessSimInput, emit: (e: RecessSimEvent) => void): RecessSim {
  const now = sim.now + input.dt * 1000;
  let state = setRecessActive(sim.state, input.active);
  if (state.active && !sim.state.active) emit({ kind: "recessStart" });
  state = spawnGleams({ seed: input.seed, now, layout: input.layout, state, lowStimulus: input.lowStimulus });
  const stepped = stepRecess(state, input.hero, now);
  state = stepped.state;
  for (const e of stepped.events) emit(e);
  return { state, now };
}

export function useRecessSimRef(): RefObject<RecessSim> {
  const [initial] = useState<RecessSim>(startRecessSim);
  return useRef<RecessSim>(initial);
}
