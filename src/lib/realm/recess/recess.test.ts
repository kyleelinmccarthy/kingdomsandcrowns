import { describe, it, expect } from "vitest";
import { buildWorldLayout, SPAWN, type WorldLayout } from "../layout";
import {
  startRecess, setRecessActive, spawnGleams, stepRecess, formatLap,
  GLEAM_COUNT, GLEAM_COUNT_LOW, GLEAM_RADIUS, GLEAM_RESPAWN_MS, LAP_WAYPOINTS, LAP_START, WAYPOINT_RADIUS,
} from "./recess";

const layout = buildWorldLayout({ castleType: "keep", buildings: [{ id: "well", done: 5, total: 5, complete: true }] });
const active = setRecessActive(startRecess(), true);

describe("gleams", () => {
  it("spawns the full count on walkable ground, deterministically", () => {
    const a = spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: false });
    const b = spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: false });
    expect(a.gleams.length).toBe(GLEAM_COUNT);
    expect(a.gleams).toEqual(b.gleams);
    for (const g of a.gleams) {
      for (const c of layout.colliders) {
        const inside = Math.abs(g.position.x - c.position.x) < c.size.w / 2 + 1 && Math.abs(g.position.z - c.position.z) < c.size.d / 2 + 1;
        expect(inside).toBe(false);
      }
      for (const v of layout.villagers) expect(Math.hypot(g.position.x - v.position.x, g.position.z - v.position.z)).toBeGreaterThanOrEqual(2);
      for (const p of layout.props.filter((p) => p.kind === "path")) expect(Math.hypot(g.position.x - p.position.x, g.position.z - p.position.z)).toBeGreaterThanOrEqual(2);
      expect(Math.hypot(g.position.x - SPAWN.x, g.position.z - SPAWN.z)).toBeGreaterThanOrEqual(3);
    }
    expect(spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: true }).gleams.length).toBe(GLEAM_COUNT_LOW);
    expect(spawnGleams({ seed: 5, now: 0, layout, state: startRecess(), lowStimulus: false }).gleams.length).toBe(0); // inactive: nothing spawns
  });

  it("collects a gleam within reach, counts it, and respawns its slot after ten seconds elsewhere", () => {
    const spawned = spawnGleams({ seed: 1, now: 0, layout, state: active, lowStimulus: false });
    const target = spawned.gleams[0];
    const hero = { x: target.position.x + GLEAM_RADIUS - 0.05, z: target.position.z };
    const { state, events } = stepRecess(spawned, hero, 100);
    expect(events).toEqual([{ kind: "gleam", count: 1 }]);
    expect(state.collected).toBe(1);
    expect(state.gleams.some((g) => g.id === target.id)).toBe(false);
    const soon = spawnGleams({ seed: 1, now: 5_000, layout, state, lowStimulus: false });
    expect(soon.gleams.length).toBe(GLEAM_COUNT - 1);
    const later = spawnGleams({ seed: 1, now: 100 + GLEAM_RESPAWN_MS, layout, state, lowStimulus: false });
    expect(later.gleams.length).toBe(GLEAM_COUNT);
    const replacement = later.gleams.find((g) => g.slot === target.slot)!;
    expect(replacement.position).not.toEqual(target.position);
  });

  it("never spawns a gleam on an unfinished building's foundation", () => {
    // `layout` above only marks "well" complete: the mill is a foundation prop, not a collider.
    const mill = layout.props.find((p) => p.id === "mill")!;
    expect(mill.kind).toBe("foundation");
    expect(mill.solid).toBe(false);
    const spawned = spawnGleams({ seed: 5, now: 0, layout, state: active, lowStimulus: false });
    for (const g of spawned.gleams) {
      const inside = Math.abs(g.position.x - mill.position.x) < mill.size.w / 2 + 1 && Math.abs(g.position.z - mill.position.z) < mill.size.d / 2 + 1;
      expect(inside).toBe(false);
    }
  });

  it("bumps slotSpawns even when every attempt in a slot fails, so a dead slot tries new points next frame", () => {
    const blockedLayout: WorldLayout = {
      props: [{ id: "wall", kind: "barrier", label: "Wall", position: { x: 0, z: 0 }, size: { w: 60, d: 60, h: 1 }, color: "#000000", solid: true }],
      spawn: SPAWN,
      colliders: [],
      villagers: [],
    };
    blockedLayout.colliders = blockedLayout.props;
    const result = spawnGleams({ seed: 5, now: 0, layout: blockedLayout, state: active, lowStimulus: false });
    expect(result.gleams.length).toBe(0);
    expect(result.slotSpawns[0]).toBe(1);
    expect(result.slotSpawns[GLEAM_COUNT - 1]).toBe(1);
  });
});

describe("laps", () => {
  it("starts timing at the first waypoint, advances in order, completes at the start line, and keeps the best", () => {
    let state = active;
    let events: ReturnType<typeof stepRecess>["events"] = [];
    const visit = (p: { x: number; z: number }, now: number) => {
      const r = stepRecess(state, p, now);
      state = r.state;
      events = events.concat(r.events);
    };
    visit(LAP_START, 0);
    expect(state.lapStartedAt).toBeNull();
    visit(LAP_WAYPOINTS[3], 500); // out of order: ignored
    expect(state.nextWaypoint).toBe(0);
    LAP_WAYPOINTS.forEach((w, i) => visit({ x: w.x + WAYPOINT_RADIUS - 0.1, z: w.z }, 1_000 + i * 5_000));
    expect(state.lapStartedAt).toBe(1_000);
    expect(state.nextWaypoint).toBe(LAP_WAYPOINTS.length);
    visit(LAP_START, 41_300);
    expect(state.laps).toBe(1);
    expect(state.bestLapMs).toBe(40_300);
    expect(events.at(-1)).toEqual({ kind: "lap", lapMs: 40_300, laps: 1, best: true });
    expect(state.nextWaypoint).toBe(0);
    expect(state.lapStartedAt).toBe(41_300);
    // a slower second lap keeps the best
    LAP_WAYPOINTS.forEach((w, i) => visit(w, 50_000 + i * 6_000));
    visit(LAP_START, 100_000);
    expect(state.laps).toBe(2);
    expect(state.bestLapMs).toBe(40_300);
    expect(events.at(-1)).toMatchObject({ kind: "lap", best: false });
  });

  it("deactivating clears gleams and the running lap but keeps the tallies", () => {
    let state = spawnGleams({ seed: 2, now: 0, layout, state: active, lowStimulus: false });
    state = { ...state, collected: 4, laps: 2, bestLapMs: 30_000, lapStartedAt: 10, nextWaypoint: 3 };
    const off = setRecessActive(state, false);
    expect(off.active).toBe(false);
    expect(off.gleams).toEqual([]);
    expect(off.lapStartedAt).toBeNull();
    expect(off.nextWaypoint).toBe(0);
    expect(off).toMatchObject({ collected: 4, laps: 2, bestLapMs: 30_000 });
    expect(stepRecess(off, LAP_WAYPOINTS[0], 20).state).toBe(off);
  });

  it("formats lap times with one decimal", () => {
    expect(formatLap(40_300)).toBe("40.3");
    expect(formatLap(999)).toBe("1.0");
  });

  it("keeps every waypoint inside the world and away from the castle", () => {
    for (const w of LAP_WAYPOINTS) {
      expect(Math.abs(w.x)).toBeLessThan(19);
      expect(Math.abs(w.z)).toBeLessThan(19);
      expect(layout.colliders.some((c) => Math.abs(w.x - c.position.x) < c.size.w / 2 + 1 && Math.abs(w.z - c.position.z) < c.size.d / 2 + 1)).toBe(false);
    }
  });
});
