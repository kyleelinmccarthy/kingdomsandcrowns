import { describe, it, expect } from "vitest";
import { buildWorldLayout, SPAWN } from "@/lib/realm/layout";
import { LAP_WAYPOINTS } from "@/lib/realm/recess/recess";
import { startRecessSim, stepRecessSim, type RecessSimEvent } from "./use-recess-sim";

const layout = buildWorldLayout({ castleType: "keep", buildings: [] });

describe("stepRecessSim", () => {
  it("spawns gleams only while active and collects one the hero walks over", () => {
    const events: RecessSimEvent[] = [];
    const emit = (e: RecessSimEvent) => events.push(e);
    let sim = startRecessSim();
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: false, lowStimulus: false, seed: 3 }, emit);
    expect(sim.state.gleams.length).toBe(0);
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(sim.state.gleams.length).toBe(12);
    expect(events.filter((e) => e.kind === "recessStart").length).toBe(1);
    sim = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events.filter((e) => e.kind === "recessStart").length).toBe(1); // only on the flip
    const target = sim.state.gleams[0];
    sim = stepRecessSim(sim, { layout, hero: target.position, dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events).toContainEqual({ kind: "gleam", count: 1 });
    // Standing on the first waypoint for 2.5 s starts a lap and says nothing more: the
    // running lap is not an event any more (D6.4 deleted the clock it fed).
    sim = stepRecessSim(sim, { layout, hero: LAP_WAYPOINTS[0], dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    const before = events.length;
    for (let i = 0; i < 150; i++) sim = stepRecessSim(sim, { layout, hero: LAP_WAYPOINTS[0], dt: 1 / 60, active: true, lowStimulus: false, seed: 3 }, emit);
    expect(events.length).toBe(before);
    const off = stepRecessSim(sim, { layout, hero: SPAWN, dt: 1 / 60, active: false, lowStimulus: false, seed: 3 }, emit);
    expect(off.state.active).toBe(false);
    expect(off.state.gleams.length).toBe(0);
    expect(off.state.collected).toBe(1);
  });
});
