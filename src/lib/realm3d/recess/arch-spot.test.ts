import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { buildSpots, pickSpot } from "../interact";
import { ARCH, ARCH_HALF_SPAN } from "./course";
import { recessSound } from "../sound/cues";
import { onDemand, RECESS_SOUNDS } from "../sound/engine";
import { EFFECTS, renderSound } from "../sound/recipes";

/** The Ring's arch as an E spot (`interact.ts`), and recess's sounds (`sound/`). */
describe("the arch is something E can act on", () => {
  const layout = buildWorldLayout({ castleType: "castle", buildings: [{ id: "well", done: 5, total: 5, complete: true }, { id: "mill", done: 5, total: 5, complete: true }], objectiveIds: [] });
  const spots = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks: [], castle: null, arch: { ...ARCH, halfSpan: ARCH_HALF_SPAN } });
  const arch = spots.findIndex((s) => s.target.kind === "arch");

  it("is there, and says Run the Ring", () => {
    expect(arch).toBeGreaterThanOrEqual(0);
    expect(spots[arch].target).toEqual({ kind: "arch", id: "ring", label: "the Ring", verb: "Run" });
  });

  it("is what E means standing under it, and stepping up to it from the spawn side, even with the well and the mill built beside it", () => {
    expect(pickSpot(spots, ARCH.x, ARCH.z, -1)).toBe(arch);
    expect(pickSpot(spots, ARCH.x + 0.5, ARCH.z + 1.9, -1)).toBe(arch);
  });

  it("is absent when there is no Ring", () => {
    const none = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks: [], castle: null });
    expect(none.some((s) => s.target.kind === "arch")).toBe(false);
  });
});

describe("recess's sounds", () => {
  it("are in the catalogue, made only when a child's visit wants them", () => {
    for (const id of RECESS_SOUNDS) {
      expect(EFFECTS).toContain(id);
      expect(onDemand(id)).toBe(true);
    }
  });

  it("each cue has a sound: the bells and a best are moments with the music stepped back", () => {
    expect(recessSound("bell")).toEqual({ id: "recess-bell", moment: true, duck: true });
    expect(recessSound("over")).toEqual({ id: "recess-over", moment: true, duck: true });
    expect(recessSound("best")).toEqual({ id: "lap-best", moment: true, duck: true });
    expect(recessSound("lap").id).toBe("lap-done");
    expect(recessSound("gleam")).toEqual({ id: "gleam", moment: false, duck: false });
    expect(recessSound("post").id).toBe("ring-post");
  });

  it("render clean, start and end silent, and stay quieter in calm", () => {
    const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    for (const id of RECESS_SOUNDS) {
      const loud = renderSound(id).data;
      const calm = renderSound(id, { calm: true }).data;
      expect(loud.length).toBeGreaterThan(1000);
      expect(Math.abs(loud[0])).toBeLessThan(1e-3);
      expect(Math.abs(loud[loud.length - 1])).toBeLessThan(1e-3);
      expect(peak(loud)).toBeLessThanOrEqual(peak(renderSound("complete").data) + 1e-6);
      expect(peak(calm)).toBeLessThanOrEqual(peak(loud) + 1e-6);
    }
    // A gleam is the quietest of them: it comes often.
    expect(peak(renderSound("gleam").data)).toBeLessThan(peak(renderSound("lap-best").data));
  });
});
