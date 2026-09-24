import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { VILLAGERS, villagerForBuilding } from "@/lib/realm/villagers";
import { ENTER_VERB, roomFor } from "./doorways";
import { interactVerb } from "./frame";
import type { InteractTarget } from "./hud-bus";
import { buildSpots, edgeDistance, pickSpot, siteLabel, type InteractSpot } from "./interact";

/**
 * THE E PROMPT NAMES WHAT E DOES. A villager stands a step in front of their own site, so a
 * child walking up to one is in reach of both; whichever the picker chooses, the words on the
 * prompt must be what pressing E then does (`realm-game.tsx`'s `openTarget` and `talkTo`).
 */

type Row = { id: string; done: number; total: number; complete: boolean };

/** What E at a target does, as `openTarget` and `talkTo` decide it. */
function whatEDoes(t: InteractTarget, buildings: readonly Row[], castleOpen: boolean, labels: Map<string, string>): string {
  if (roomFor(t, buildings, castleOpen)) return `${ENTER_VERB} ${t.kind === "castle" ? "your castle" : labels.get(t.id)}`;
  const v = t.kind === "villager" ? VILLAGERS.find((x) => x.id === t.id) : t.kind === "site" ? villagerForBuilding(t.id) : null;
  if (v && buildings.some((b) => b.id === v.buildingId)) return `Talk to ${v.name}`;
  if (t.kind === "castle") return "Look at the castle grounds";
  return `Look at ${labels.get(t.id) ?? t.label}`;
}

const kingdoms: Record<string, Row[]> = {
  "nothing built": VILLAGERS.map((v) => ({ id: v.buildingId, done: 1, total: 5, complete: false })),
  "everything built": VILLAGERS.map((v) => ({ id: v.buildingId, done: 5, total: 5, complete: true })),
  "half built": VILLAGERS.map((v, i) => ({ id: v.buildingId, done: i % 2 ? 5 : 2, total: 5, complete: i % 2 === 1 })),
};
const landmarks = [{ id: "summit-6", name: "Cloudfoot", position: { x: -184, z: -96 } }];

function world(buildings: Row[], castleOpen: boolean): { all: InteractSpot[]; labels: Map<string, string> } {
  const lay = buildWorldLayout({ castleType: "castle", buildings, objectiveIds: [] });
  const labels = new Map<string, string>();
  for (const p of lay.props) if (p.kind === "building" || p.kind === "foundation") labels.set(p.id, siteLabel(p.label));
  const all = buildSpots({
    props: lay.props,
    sitePlan: 1.5,
    landmarks,
    castle: { x: 0, z: -12, hw: 3, hd: 1, label: castleOpen ? "your castle" : "the castle grounds", ...(castleOpen ? { verb: ENTER_VERB } : {}) },
  });
  return { all, labels };
}

describe("the E prompt names what E does, at every villager and their own site", () => {
  for (const [name, buildings] of Object.entries(kingdoms)) {
    for (const castleOpen of [false, true]) {
      it(`${name}, castle ${castleOpen ? "open" : "locked"}`, () => {
        const { all, labels } = world(buildings, castleOpen);
        let checked = 0;
        let both = 0;
        for (const v of VILLAGERS) {
          const vi = all.findIndex((s) => s.target.kind === "villager" && s.target.id === v.id);
          const si = all.findIndex((s) => s.target.kind === "site" && s.target.id === v.buildingId);
          expect(vi, v.id).toBeGreaterThanOrEqual(0);
          expect(si, v.buildingId).toBeGreaterThanOrEqual(0);
          const person = all[vi];
          const site = all[si];
          const enterable = roomFor(site.target, buildings, castleOpen) !== null;
          // Every point round the villager, out past both reaches.
          for (let gx = -8; gx <= 8; gx += 0.25) {
            for (let gz = -8; gz <= 8; gz += 0.25) {
              const x = person.x + gx;
              const z = person.z + gz;
              const inPerson = edgeDistance(person, x, z) <= person.reach;
              const inSite = edgeDistance(site, x, z) <= site.reach;
              if (!inPerson && !inSite) continue;
              // Fresh, and held from either of the two: stickiness must not bring the wrong words back.
              for (const current of [-1, vi, si]) {
                const i = pickSpot(all, x, z, current);
                if (i < 0) continue;
                const t = all[i].target;
                expect(interactVerb(t), `${v.id} at ${gx},${gz} from ${current}`).toBe(whatEDoes(t, buildings, castleOpen, labels));
                checked++;
                // A site with no inside IS the villager's conversation: with both in reach, the site
                // never wins (the villager does, unless something else nearer does).
                if (inPerson && inSite && !enterable) {
                  expect(i, `${v.id} and ${v.buildingId} both in reach at ${gx},${gz}`).not.toBe(si);
                  both++;
                }
              }
            }
          }
        }
        // The castle, locked or open, says what E does there too.
        const ci = all.findIndex((s) => s.target.kind === "castle");
        expect(interactVerb(all[ci].target)).toBe(whatEDoes(all[ci].target, buildings, castleOpen, labels));
        expect(checked).toBeGreaterThan(1000);
        // The well has no inside at any stage, so every kingdom has pairs to check.
        expect(both).toBeGreaterThan(50);
      });
    }
  }

  it("says Talk to Old Bram at the Village Well, built or not, and still goes into a raised Chapel", () => {
    for (const buildings of Object.values(kingdoms)) {
      const { all } = world(buildings, false);
      const well = all.find((s) => s.target.kind === "site" && s.target.id === "well")!;
      expect(interactVerb(well.target)).toBe("Talk to Old Bram");
      const chapel = all.find((s) => s.target.kind === "site" && s.target.id === "chapel")!;
      const raised = buildings.find((b) => b.id === "chapel")!.complete;
      expect(interactVerb(chapel.target)).toBe(raised ? "Go into the Chapel" : "Talk to Sister Wren");
    }
  });

  it("standing between Old Bram and his well picks Bram, even when the well was last frame's choice", () => {
    const { all } = world(kingdoms["everything built"], false);
    const wi = all.findIndex((s) => s.target.kind === "site" && s.target.id === "well");
    const well = all[wi];
    const bram = all.find((s) => s.target.kind === "villager" && s.target.id === "bram")!;
    // Just off the well's south edge, a step to Bram's side: in the well's reach at nearly nothing.
    const x = bram.x + 1.2;
    const z = well.z + well.hd + 0.2;
    expect(edgeDistance(well, x, z)).toBeLessThan(0.3);
    expect(edgeDistance(bram, x, z)).toBeLessThan(bram.reach);
    expect(all[pickSpot(all, x, z, -1)].target.id).toBe("bram");
    expect(all[pickSpot(all, x, z, wi)].target.id).toBe("bram");
  });

  it("on the well's far side, out of Bram's reach, the well itself still says Talk to Old Bram", () => {
    const { all } = world(kingdoms["nothing built"], false);
    const well = all.find((s) => s.target.kind === "site" && s.target.id === "well")!;
    const i = pickSpot(all, well.x, well.z - well.hd - 1, -1);
    expect(all[i].target.id).toBe("well");
    expect(interactVerb(all[i].target)).toBe("Talk to Old Bram");
  });

  it("leaves a site alone when its villager is not in the village (the kingdom did not load)", () => {
    const lay = buildWorldLayout({ castleType: "castle", buildings: kingdoms["nothing built"], objectiveIds: [], villagers: false });
    const all = buildSpots({ props: lay.props, sitePlan: 1.5, landmarks, castle: null });
    const well = all.find((s) => s.target.kind === "site" && s.target.id === "well")!;
    expect(interactVerb(well.target)).toBe("Look at the Village Well");
    expect(well.yieldsTo ?? -1).toBe(-1);
  });
});
