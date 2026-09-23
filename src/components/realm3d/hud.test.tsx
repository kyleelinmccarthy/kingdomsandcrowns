import fs from "fs";
import path from "path";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withEmptyPages, resolvePages } from "@/lib/realm/spells/pages";
import { makeHudBus } from "@/lib/realm3d/hud-bus";
import { buildAnchors } from "@/lib/realm3d/plate-anchors";
import type { Landmark, RealmWorld } from "@/lib/realm3d/worldgen";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { RealmHud } from "./hud";

/**
 * A stand-in realm. The real one is a 640-unit noise field that takes a second to raise, and
 * none of it matters here: the HUD asks a world for its landmarks, its roads and one biome per
 * baked cell, and nothing else.
 */
const landmarks: Landmark[] = [
  { id: "summit-1", name: "Cloudfoot", line: "The whole realm, from up here.", position: { x: 40, z: -60 }, y: 40, radius: 15, biome: "crag", kind: "summit" },
  { id: "cove-1", name: "Gullbay", line: "A curve of sand.", position: { x: -120, z: 30 }, y: -4, radius: 12, biome: "shore", kind: "cove" },
  { id: "mire-1", name: "Frogmarsh", line: "Dry ground, in all this.", position: { x: 10, z: 150 }, y: 2, radius: 12, biome: "marsh", kind: "mire" },
];

const world = {
  landmarks,
  roads: [{ id: "road-1", from: "summit-1", to: "cove-1", points: [{ x: 0, z: 0 }, { x: 40, z: -60 }], halfWidth: 1.9 }],
  biomeAt: () => "meadow" as const,
  heightAt: () => 0,
} as unknown as RealmWorld;

const pages = withEmptyPages(
  resolvePages(
    [{ slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }] as never,
    4,
  ),
  4,
);

const anchors = buildAnchors({ heroName: "Emma", villagers: [], landmarks, heightAt: () => 0 });

/**
 * `test.globals` is off in this project's vitest config, so Testing Library's automatic
 * cleanup is never registered and two mounts would share one document — which is exactly how
 * the first run of this file reported fifteen empty spell pages.
 */
afterEach(cleanup);

/**
 * jsdom has no 2D canvas, so the map's land bake (`useBakedLand`) asks for a context it cannot
 * have and jsdom shouts about it once per mount. The bake is a picture of a noise field and
 * there is nothing in it for a test to check; saying "no context" up front is both what a
 * browser without canvas would say and what keeps the suite's output readable. That the HUD
 * survives the refusal — roads, marks and hero arrow all still drawn — is what every test
 * below is quietly also asserting.
 */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});

function mount(heroName = "Emma", extra: Partial<React.ComponentProps<typeof RealmHud>> = {}) {
  const bus = makeHudBus(pages.length, anchors.length);
  const view = render(<RealmHud bus={bus} world={world} anchors={anchors} pages={pages} heroName={heroName} {...extra} />);
  // Everything the scene tells the HUD arrives from outside React, so a test that fires one
  // of those callbacks has to flush the state it sets.
  const tell = (f: () => void) => act(f);
  return { bus, view, screen: within(view.container), tell };
}

describe("the child's own face", () => {
  it("is the pixel avatar the Tavern draws, not a crown", () => {
    const { view } = mount("Emma", { portrait: DEFAULT_AVATAR });
    const portrait = view.container.querySelector(".r3-who-portrait")!;
    expect(portrait.querySelector("svg[aria-label=\"Emma's avatar\"]")).not.toBeNull();
  });

  it("is the Quest Giver's wizard for a visiting parent, who is visiting the child's Realm", () => {
    const { view } = mount("Emma", { viewer: "parent", portrait: DEFAULT_AVATAR });
    expect(view.container.querySelector(".r3-who-name")).toHaveTextContent("Quest Giver");
    expect(view.container.querySelector(".r3-who-where")).toHaveTextContent("Visiting Emma's Realm");
    expect(view.container.querySelector(".r3-who-portrait svg[aria-label]")).toBeNull();
  });
});

describe("the child's own name", () => {
  it("is on the plaque, as theirs", () => {
    const { view } = mount("Emma");
    expect(view.container.querySelector(".r3-who-name")).toHaveTextContent("Emma");
  });

  it("is over their own head as well, and is the first plate", () => {
    const { bus } = mount("Emma");
    expect(bus.plates[0]).not.toBeNull();
    expect(bus.plates[0]!.textContent).toContain("Emma");
  });

  it("says how much of the realm is still unfound before anywhere has been", () => {
    const { screen } = mount();
    expect(screen.getByText(`0 of ${landmarks.length} places found`)).toBeInTheDocument();
  });
});

describe("the spell bar", () => {
  it("draws the child's own earned spell, with its cost", () => {
    const { screen } = mount();
    expect(screen.getByText("Ember Bolt")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("draws the pages they have not filled yet rather than hiding them", () => {
    const { screen } = mount();
    expect(screen.getAllByText("Get a spell")).toHaveLength(3);
  });

  it("casts a filled page on a click, as its number key would", () => {
    const onCast = vi.fn();
    const { screen } = mount("Emma", { onCast });
    fireEvent.click(screen.getByRole("button", { name: /Ember Bolt/ }));
    expect(onCast).toHaveBeenCalledWith(1);
  });

  it("makes an empty page a button that asks how to earn a spell", () => {
    const onEmptyPage = vi.fn();
    const { screen } = mount("Emma", { onEmptyPage });
    fireEvent.click(screen.getByRole("button", { name: /Page 3 is empty/ }));
    expect(onEmptyPage).toHaveBeenCalledWith(3);
  });

  it("never lets a click take focus from the world, so Space still jumps", () => {
    const { screen } = mount();
    const slot = screen.getByRole("button", { name: /Ember Bolt/ });
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    slot.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("binds exactly as many keys as it draws keycaps", () => {
    const { screen } = mount();
    for (const key of ["1", "2", "3", "4"]) expect(screen.getByText(key)).toBeInTheDocument();
    expect(screen.getByText(/cast$/)).toHaveTextContent("1–4 cast");
  });

  it("names the control scheme the scene binds: E talks, Esc is the menu, Q is gone", () => {
    const { view } = mount();
    const strip = view.container.querySelector(".r3-keys")!;
    expect(strip).toHaveTextContent("E talk");
    expect(strip).toHaveTextContent("Esc menu");
    expect(strip.textContent).not.toMatch(/\bQ\b/);
    expect(strip.textContent).not.toMatch(/turn the camera/);
  });

  it("hands the frame loop a cooldown node for every spell it drew", () => {
    const { bus } = mount();
    expect(bus.slots[0].cool).not.toBeNull();
    expect(bus.slots[0].root).not.toBeNull();
  });
});

describe("the mana bar", () => {
  it("starts full, and hands its fill and its readout to the frame loop", () => {
    const { bus, screen } = mount();
    expect(screen.getByText("100 / 100")).toBeInTheDocument();
    expect(bus.manaFill).not.toBeNull();
    expect(bus.manaText).not.toBeNull();
  });
});

describe("the map", () => {
  it("names all four points of the compass, not only north", () => {
    const { view } = mount();
    const letters = [...view.container.querySelectorAll(".r3-map text")].map((t) => t.textContent);
    expect(letters).toEqual(expect.arrayContaining(["N", "E", "S", "W"]));
  });

  it("marks no home, and points no arrow home, while the castle is not earned", () => {
    const { bus, view } = mount("Noah", { castle: false });
    expect(view.container.querySelector(".r3-map-home")).toBeNull();
    expect(bus.mapHome).toBeNull();
  });

  it("hands the frame loop the one group it pans, the hero arrow and the view cone", () => {
    const { bus } = mount();
    expect(bus.mapWorld).not.toBeNull();
    expect(bus.mapYou).not.toBeNull();
    expect(bus.mapCone).not.toBeNull();
    expect(bus.mapHome).not.toBeNull();
  });

  it("draws every place from the first frame, hollow until it has been stood in", () => {
    const { view } = mount();
    const marks = view.container.querySelectorAll(".r3-map-place");
    expect(marks).toHaveLength(landmarks.length);
    for (const m of marks) expect(m.className).not.toContain("--found");
  });

  it("gives each kind of place its own silhouette, so no legend is needed", () => {
    const { view } = mount();
    const shapes = new Set(Array.from(view.container.querySelectorAll(".r3-map-place")).map((m) => m.getAttribute("d")));
    expect(shapes.size).toBe(3);
  });

  it("fills a place in once the scene says the child has stood in it", () => {
    const { bus, view, tell } = mount();
    tell(() => bus.onFound("cove-1"));
    const found = view.container.querySelectorAll(".r3-map-place--found");
    expect(found).toHaveLength(1);
  });

  it("names where the child is standing the moment the scene says so", () => {
    const { bus, screen, tell } = mount();
    tell(() => bus.onPlace("summit-1"));
    expect(screen.getAllByText("Cloudfoot").length).toBeGreaterThan(0);
    tell(() => bus.onPlace(null));
    expect(screen.getByText(/places found/)).toBeInTheDocument();
  });

  it("draws the roads the generator routed", () => {
    const { view } = mount();
    expect(view.container.querySelectorAll(".r3-map-road")).toHaveLength(1);
  });
});

describe("nameplates", () => {
  it("draws one hidden plate per anchor and hands each node to the frame loop", () => {
    const { bus, view } = mount();
    expect(view.container.querySelectorAll(".r3-plate")).toHaveLength(anchors.length);
    for (const node of bus.plates) {
      expect(node).not.toBeNull();
      // Born hidden: the driver turns one on the first time it projects on screen, so a plate
      // is never briefly drawn at the top-left corner before the first frame runs.
      expect(node!.style.display).toBe("none");
    }
  });

  it("carries the place's own clause as the second line", () => {
    const { screen } = mount();
    expect(screen.getByText("The whole realm, from up here.")).toBeInTheDocument();
  });
});

describe("a refused press", () => {
  it("shakes the page that refused, and only that one", () => {
    const { bus, view, tell } = mount();
    tell(() => bus.onRefuse(1, "mana"));
    expect(view.container.querySelectorAll(".r3-slot--refused")).toHaveLength(1);
    expect(view.container.querySelector(".r3-slot--refused")!.textContent).toContain("Ember Bolt");
  });
});

/**
 * The constraint that keeps this whole layer testable: `three` needs WebGL, jsdom has none, so
 * nothing Vitest can reach may import it. Asserted on the source rather than trusted, because
 * one careless import in `hud.tsx` takes the entire HUD out of the test suite.
 */
describe("nothing under test imports three", () => {
  const files = [
    "components/realm3d/hud.tsx",
    "components/realm3d/frame-hud.tsx",
    "components/realm3d/realm-game.tsx",
    "components/realm3d/realm-frame.tsx",
    "lib/realm3d/frame.ts",
    "lib/realm3d/overrides.ts",
    "lib/realm3d/project.ts",
    "lib/realm3d/nameplates.ts",
    "lib/realm3d/plate-anchors.ts",
    "lib/realm3d/minimap.ts",
    "lib/realm3d/casting.ts",
    "lib/realm3d/spell-fx.ts",
    "lib/realm3d/hud-bus.ts",
  ];

  it.each(files)("%s", (rel) => {
    const src = fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
    expect(src).not.toMatch(/from\s+"three"/);
    expect(src).not.toMatch(/@react-three/);
  });
});

/**
 * jsdom never loads the stylesheet, so the half of this design that lives in the cascade is
 * asserted against the stylesheet's text — the same approach `realm-chrome.test.tsx` takes.
 */
describe("the HUD's own stylesheet", () => {
  // The HUD's rules live in globals.css; the frame's, and the frame's additions to the HUD, in
  // realm-frame.css beside the components. The page loads both.
  const css = [
    fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8"),
    fs.readFileSync(path.join(__dirname, "realm-frame.css"), "utf8"),
  ]
    .join("\n")
    .replace(/\s+/g, " ");

  it("has a rule for every class the components render", () => {
    for (const cls of [
      ".r3-hud", ".r3-who", ".r3-who-name", ".r3-map", ".r3-map-place", ".r3-map-place--found",
      ".r3-map-you", ".r3-map-cone", ".r3-mana-fill", ".r3-slot", ".r3-slot-cool", ".r3-slot--empty",
      ".r3-slot--refused", ".r3-plate", ".r3-plate--hero", ".r3-plates", ".r3-keys",
      ".r3-who-portrait", ".r3-who-avatar", ".r3-who-wizard", ".r3-map-compass", ".r3-map-compass-dot",
    ]) {
      expect(css, `no rule for ${cls}`).toContain(`${cls} `);
    }
  });

  it("scales a plate about the point in the world it names, not about its own middle", () => {
    const at = css.indexOf(".r3-plate {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("transform-origin: 50% 100%");
  });

  it("wipes the cooldown down from the top of the page", () => {
    const at = css.indexOf(".r3-slot-cool {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("transform-origin: top");
    expect(rule).toContain("scaleY(0)");
  });

  it("keeps the whole HUD out of the way of the pointer", () => {
    const at = css.indexOf(".r3-hud {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("pointer-events: none");
  });
});
