import { describe, expect, it } from "vitest";
import { buildWorldLayout, CASTLE_POSITION } from "@/lib/realm/layout";
import { VILLAGERS } from "@/lib/realm/villagers";
import type { Landmark } from "./worldgen";
import { buildAnchors } from "./plate-anchors";

const layout = buildWorldLayout({
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
    { id: "garden", done: 0, total: 5, complete: false },
  ],
  objectiveIds: ["chapel"],
});

const landmarks: Landmark[] = [
  { id: "summit-1", name: "Cloudfoot", line: "The whole realm, from up here.", position: { x: 90, z: -120 }, y: 42, radius: 15, biome: "crag", kind: "summit" },
  { id: "cove-2", name: "Gullbay", line: "A curve of sand.", position: { x: -200, z: 40 }, y: -4, radius: 12, biome: "shore", kind: "cove" },
];

/** A ground that is 7 everywhere, so a height is easy to read out of an anchor. */
const flat = () => 7;

const anchors = buildAnchors({ heroName: "Emma", villagers: layout.villagers, landmarks, heightAt: flat });

describe("who gets a name", () => {
  it("names the child first, so the driver never has to search for them", () => {
    expect(anchors[0].id).toBe("hero");
    expect(anchors[0].tier).toBe("hero");
    expect(anchors[0].name).toBe("Emma");
  });

  it("names home", () => {
    const castle = anchors.find((a) => a.id === "castle")!;
    expect(castle.tier).toBe("landmark");
    expect(castle.x).toBe(CASTLE_POSITION.x);
    expect(castle.z).toBe(CASTLE_POSITION.z);
    expect(castle.mark).toBe("home");
  });

  it("names every villager the layout placed, and nobody else", () => {
    const people = anchors.filter((a) => a.tier === "villager");
    expect(people).toHaveLength(layout.villagers.length);
    expect(people.map((p) => p.id).sort()).toEqual(layout.villagers.map((v) => `villager-${v.id}`).sort());
  });

  it("names every place the generator found", () => {
    for (const l of landmarks) {
      const found = anchors.find((a) => a.id === l.id)!;
      expect(found.name).toBe(l.name);
      expect(found.sub).toBe(l.line);
      expect(found.tier).toBe("landmark");
    }
  });

  it("keeps the list short enough that a world of names is still a world", () => {
    expect(anchors).toHaveLength(2 + layout.villagers.length + landmarks.length);
  });
});

describe("what a plate says", () => {
  it("uses the PERSON's name and the SITE's label, never the label twice", () => {
    const bram = anchors.find((a) => a.id === "villager-bram");
    if (bram) {
      expect(bram.name).toBe(VILLAGERS.find((v) => v.id === "bram")!.name);
      expect(bram.sub).toMatch(/well/i);
      expect(bram.name).not.toBe(bram.sub);
    }
  });

  it("reads the villager's name out of the flat Realm's own list, so it cannot drift", () => {
    for (const a of anchors.filter((x) => x.tier === "villager")) {
      const id = a.id.replace("villager-", "");
      expect(a.name).toBe(VILLAGERS.find((v) => v.id === id)!.name);
    }
  });

  it("marks the villager holding the objective apart from the rest", () => {
    const objective = layout.villagers.find((v) => v.status === "objective");
    const built = layout.villagers.find((v) => v.status === "built");
    if (objective) expect(anchors.find((a) => a.id === `villager-${objective.id}`)!.mark).toBe("quest");
    if (built) expect(anchors.find((a) => a.id === `villager-${built.id}`)!.mark).toBe("done");
  });

  it("gives everything a colour and a mark, so no plate is drawn blank", () => {
    for (const a of anchors) {
      expect(a.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.mark).toBeTruthy();
      expect(a.name.length).toBeGreaterThan(0);
    }
  });
});

describe("how high a plate hangs", () => {
  it("clears a villager's hat and no more", () => {
    const person = anchors.find((a) => a.tier === "villager")!;
    expect(person.y).toBeCloseTo(flat() + 2.9);
  });

  /**
   * The number the camera forced. A ground point leaves the top of the frame at roughly
   * (19.5 - y) / tan(14.5°) from the camera, so a name must hang LOW to be seen from far —
   * the opposite of the obvious answer, and the reason four approaches to the Ringstones were
   * photographed with no label anywhere on them.
   */
  it("hangs a place's name low enough to still be on screen from forty units away", () => {
    const summit = anchors.find((a) => a.id === "summit-1")!;
    const above = summit.y - landmarks[0].y;
    expect(above).toBeLessThan(6);
    const cameraHeight = 19.5;
    const leavesFrameAt = (cameraHeight - above) / Math.tan((14.5 * Math.PI) / 180);
    expect(leavesFrameAt - 21).toBeGreaterThan(40); // 21 is the camera boom
  });

  it("measures a place's name from the ground the generator recorded, not from sea level", () => {
    const summit = anchors.find((a) => a.id === "summit-1")!;
    expect(summit.y).toBeGreaterThan(landmarks[0].y);
    const cove = anchors.find((a) => a.id === "cove-2")!;
    expect(cove.y).toBeGreaterThan(landmarks[1].y);
    expect(cove.y).toBeLessThan(summit.y);
  });

  it("asks the world for the ground under a villager, rather than assuming a flat village", () => {
    const hilly = buildAnchors({
      heroName: "Emma",
      villagers: layout.villagers,
      landmarks: [],
      heightAt: (x) => x,
    });
    const people = hilly.filter((a) => a.tier === "villager");
    expect(people.length).toBeGreaterThan(1);
    for (const p of people) expect(p.y - p.x).toBeCloseTo(2.9);
    // ...and they are not all at the same height, which is the point of asking.
    expect(new Set(people.map((p) => Math.round(p.y))).size).toBeGreaterThan(1);
  });
});

describe("a castle not yet earned", () => {
  it("has no name hanging over the empty plot, and the child's own plate is still first", () => {
    const anchors = buildAnchors({ heroName: "Noah", villagers: [], landmarks: [], heightAt: () => 0, castle: false });
    expect(anchors.map((a) => a.id)).toEqual(["hero"]);
  });

  it("is named, as always, once it stands", () => {
    const anchors = buildAnchors({ heroName: "Noah", villagers: [], landmarks: [], heightAt: () => 0 });
    expect(anchors.map((a) => a.id)).toEqual(["hero", "castle"]);
  });
});

describe("a villager's plate carries their site's progress", () => {
  it("shows pips for a site still rising, and none for one that stands or for anyone else", () => {
    const wren = anchors.find((a) => a.id === "villager-wren")!;
    expect(wren.progress).toEqual({ done: 3, total: 5 });
    expect(anchors.find((a) => a.id === "villager-ivy")!.progress).toEqual({ done: 0, total: 5 });
    expect(anchors.find((a) => a.id === "villager-bram")!.progress).toBeUndefined();
    expect(anchors[0].progress).toBeUndefined();
    expect(anchors.find((a) => a.id === "summit-1")!.progress).toBeUndefined();
  });
});
