import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { makeHudBus, type HudBus } from "@/lib/realm3d/hud-bus";
import { controlRows, keyHints } from "@/lib/realm3d/frame";
import type { Goal } from "@/lib/realm3d/guide";
import { PLANS_BOARD_NAME } from "@/lib/realm3d/plan-goal";
import type { LeadBus, LeadTarget } from "@/lib/realm3d/lead";
import { createInputRouter, type InputRouter } from "@/lib/realm3d/input-router";
import { bind, defaultKeymap, type ActionId, type Keymap } from "@/lib/realm3d/keymap";
import { CompanionSlot, LeadLine, LeadMapMarks, leadWords, petLabel, slotCaption, useCompanionLead, type CompanionLead } from "./companion-hud";

const BRAM: Goal = { on: true, x: 0, z: 40, name: "Old Bram", id: "bram" };
const WORLD = { landmarks: [{ id: "far", name: "Far Place", position: { x: 200, z: 0 } }] } as unknown as Parameters<typeof useCompanionLead>[0]["world"];

type Seen = (lead: CompanionLead) => void;

function Harness({ router, pet, viewer = "child", bus, goal = BRAM, inside = false, breakOff = false, seen }: { router: InputRouter; pet: string | null; viewer?: "child" | "parent"; bus: HudBus; goal?: Goal; inside?: boolean; breakOff?: boolean; seen: Seen }) {
  const insideRef = useRef<unknown>(inside ? { room: "chapel" } : null);
  const lead = useCompanionLead({ router, avatar: { companion: pet }, viewer, calm: false, readAloud: false, bus, goal, world: WORLD, found: new Set(), insideRef, breakOff });
  // Handed out after each render, through a function rather than by writing to a prop.
  useEffect(() => {
    seen(lead);
  });
  return (
    <div className="r3-bar">
      {viewer === "child" && <CompanionSlot lead={lead} onPress={lead.toggle} />}
      <LeadLine line={lead.line} onDone={lead.clearLine} />
    </div>
  );
}

function rebound(action: ActionId, code: string): Keymap {
  const r = bind(defaultKeymap(), action, 0, code);
  if (!r.ok) throw new Error("not bindable");
  return r.keymap;
}

const routers: InputRouter[] = [];

function setup(o: { pet?: string | null; viewer?: "child" | "parent"; goal?: Goal; inside?: boolean; breakOff?: boolean } = {}) {
  const bus = makeHudBus(4, 1);
  let latest: CompanionLead | null = null;
  const router = createInputRouter(window, defaultKeymap());
  routers.push(router);
  const view = render(<Harness router={router} pet={o.pet === undefined ? "fox" : o.pet} viewer={o.viewer} bus={bus} goal={o.goal} inside={o.inside} breakOff={o.breakOff} seen={(l) => (latest = l)} />);
  return { bus, view, router, lead: () => latest!.bus as LeadBus };
}

const press = (code = "KeyF") => fireEvent.keyDown(window, { code });
afterEach(() => {
  cleanup();
  for (const r of routers.splice(0)) r.dispose();
});

describe("asking the pet the way", () => {
  it("F asks for a lead to whoever is waiting, when they are far", () => {
    const { lead } = setup();
    act(() => press());
    expect(lead().ask).toMatchObject({ kind: "villager", id: "bram", name: "Old Bram" });
    expect(screen.getByRole("button", { name: /Fox/ })).toHaveTextContent("Stop");
  });

  it("a remapped follow key asks, and the old one does not", () => {
    const { lead, router } = setup();
    act(() => router.setKeymap(rebound("follow", "KeyG")));
    act(() => void press("KeyF"));
    expect(lead().ask).toBeNull();
    act(() => void press("KeyG"));
    expect(lead().ask).toMatchObject({ kind: "villager", id: "bram" });
  });

  it("the canvas setting off puts the pet's words in the top lane", () => {
    const { lead } = setup();
    act(() => press());
    const target = lead().ask as LeadTarget;
    act(() => {
      lead().ask = null;
      lead().active = true;
      lead().onNews({ kind: "start", target, route: [{ x: 0, z: 0 }, { x: 0, z: 40 }], again: false });
    });
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.start("Fox", target));
    act(() => lead().onNews({ kind: "arrive", target }));
    expect(screen.getByRole("status")).toHaveTextContent("Here's Old Bram! Press E to talk.");
  });

  it("F again while it leads stops it, and it comes back to heel", () => {
    const { lead } = setup();
    act(() => press());
    act(() => {
      lead().ask = null;
      lead().active = true;
    });
    act(() => press());
    expect(lead().stop).toBe(true);
    expect(lead().ask).toBeNull();
    act(() => lead().onNews({ kind: "mode", mode: "heel" }));
    expect(screen.getByRole("button", { name: /Fox/ })).toHaveTextContent("Show me");
  });

  it("standing by whoever is waiting, it goes somewhere not yet found", () => {
    const { lead } = setup({ goal: { ...BRAM, z: 3 } });
    act(() => press());
    expect(lead().ask).toMatchObject({ kind: "place", id: "far" });
  });

  it("clicking the slot does what F does", () => {
    const { lead } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ask your Fox to show you the way/ }));
    expect(lead().ask?.id).toBe("bram");
  });

  it("indoors, the ask waits for the door, and says so", () => {
    const { lead } = setup({ inside: true });
    act(() => press());
    expect(lead().ask?.id).toBe("bram");
    expect(screen.getByRole("status")).toHaveTextContent("Outside, your Fox will show you the way.");
  });

  it("does nothing under a menu", () => {
    const { router, lead } = setup();
    router.setState({ overlay: true, inside: false });
    act(() => press());
    expect(lead().ask).toBeNull();
  });

  it("a child without a pet is told how to get one", () => {
    const { lead } = setup({ pet: null });
    expect(screen.getByRole("button", { name: /No companion yet/ })).toHaveTextContent("No pet");
    act(() => press());
    expect(lead().ask).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.none);
  });

  it("a visiting grown-up has no pet, no slot, and F does nothing", () => {
    const { lead } = setup({ viewer: "parent" });
    expect(screen.queryByRole("button")).toBeNull();
    act(() => press());
    expect(lead().ask).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the words, the slot and the map", () => {
  it("names the pet by its catalogue label", () => {
    expect(petLabel({ companion: "baby-dragon" })).toBe("Baby Dragon");
    expect(petLabel({ companion: null })).toBeNull();
    expect(slotCaption(false)).toBe("Show me");
    expect(slotCaption(true)).toBe("Stop");
  });

  it("the controls and the key strip carry F for a child with a pet, and say how to get one without", () => {
    const K = defaultKeymap();
    const withPet = controlRows(K, 4, { mount: true, pet: "Fox" });
    const f = withPet.find((r) => r.keys[0] === "F")!;
    expect(f.what).toMatch(/Ask your Fox to show you the way/);
    // Before the pause row, which stays last.
    expect(withPet[withPet.length - 1].keys).toEqual(["P", "Esc"]);
    expect(controlRows(K, 4, { pet: false }).find((r) => r.keys[0] === "F")?.what).toMatch(/once you've picked one/);
    // A visitor is told what the key does for the hero.
    expect(controlRows(K, 4, {}).find((r) => r.keys[0] === "F")?.what).toBe("Your hero's companion shows the way.");
    expect(keyHints(K, 4, { pet: true }).map((h) => h.key)).toContain("F");
    expect(keyHints(K, 4, {}).map((h) => h.key)).not.toContain("F");
  });

  it("leads to the plans board in the board's own words: E reads it, nobody is talked to", () => {
    const board: LeadTarget = { kind: "villager", id: "plan:village-banners", name: PLANS_BOARD_NAME, x: -6, z: 21.5 };
    expect(leadWords.start("Fox", board)).toBe("Your Fox knows the way to the plans board. Follow!");
    expect(leadWords.arrive("Fox", board, "E")).toBe("Here's the plans board! Press E to read it.");
    expect(leadWords.here(board, "E")).toBe("The plans board is right here! Press E to read it.");
    // A villager is still talked to.
    expect(leadWords.here({ id: "bram", name: "Old Bram" }, "E")).toBe("Old Bram is right here! Press E to talk.");
  });

  it("names the keys the child has bound in what the pet says", () => {
    const board: LeadTarget = { kind: "villager", id: "plan:village-banners", name: PLANS_BOARD_NAME, x: -6, z: 21.5 };
    expect(leadWords.arrive("Fox", board, "R")).toBe("Here's the plans board! Press R to read it.");
    expect(leadWords.here({ id: "bram", name: "Old Bram" }, "R")).toBe("Old Bram is right here! Press R to talk.");
    expect(leadWords.lost("Fox", "G")).toBe("Your Fox lost you, so it came back. Press G to ask again.");
    expect(leadWords.sit("Fox", "R")).toBe("Your Fox is waiting at the door. Walk in, or press R.");
    expect(leadWords.objective("Fox", "G")).toBe("Your Fox will show you the way: press G.");
  });

  it("the slot's keycap and its name follow the follow key, and the lines name it", () => {
    const { router, lead } = setup();
    expect(screen.getByRole("button", { name: "Ask your Fox to show you the way, key F" })).toHaveTextContent(/^F/);
    act(() => router.setKeymap(rebound("follow", "KeyG")));
    const slot = screen.getByRole("button", { name: "Ask your Fox to show you the way, key G" });
    expect(slot.querySelector(".r3-slot-key")).toHaveTextContent("G");
    act(() => lead().onNews({ kind: "lost", target: { kind: "villager", id: "bram", name: "Old Bram", x: 0, z: 40 } }));
    expect(screen.getByRole("status")).toHaveTextContent("Press G to ask again.");
    act(() => router.setKeymap(rebound("interact", "KeyR")));
    act(() => lead().onNews({ kind: "arrive", target: { kind: "villager", id: "bram", name: "Old Bram", x: 0, z: 40 } }));
    expect(screen.getByRole("status")).toHaveTextContent("Here's Old Bram! Press R to talk.");
  });

  it("knows the plans board by the goal's id, not by what it is called", () => {
    const named: LeadTarget = { kind: "villager", id: "plan:village-banners", name: "Banners", x: -6, z: 21.5 };
    expect(leadWords.arrive("Fox", named, "E")).toBe("Here's the plans board! Press E to read it.");
    expect(leadWords.here(named, "E")).toBe("The plans board is right here! Press E to read it.");
    // A villager given the board's name is still a villager.
    const bram: LeadTarget = { kind: "villager", id: "bram", name: PLANS_BOARD_NAME, x: 0, z: 0 };
    expect(leadWords.arrive("Fox", bram, "E")).toBe(`Here's ${PLANS_BOARD_NAME}! Press E to talk.`);
  });

  it("draws the pet's way on the map, and a paw at its end unless the gold ! is already there", () => {
    const route = [{ x: 0, z: 0 }, { x: 10, z: 5 }];
    const place: LeadTarget = { kind: "place", id: "far", name: "Far Place", x: 10, z: 5 };
    const { container, rerender } = render(<svg><LeadMapMarks route={route} target={place} /></svg>);
    expect(container.querySelector(".r3-map-lead-way")?.getAttribute("d")).toBe("M0.0,0.0 L10.0,5.0");
    expect(container.querySelector(".r3-map-lead-end")).not.toBeNull();
    rerender(<svg><LeadMapMarks route={route} target={{ ...place, kind: "villager" }} /></svg>);
    expect(container.querySelector(".r3-map-lead-end")).toBeNull();
    rerender(<svg><LeadMapMarks route={null} target={null} /></svg>);
    expect(container.querySelector(".r3-map-lead")).toBeNull();
  });
});

describe("the pet's own small jobs, as the frame hears them", () => {
  it("says sit and sniff once a visit, a trouble each time, and the slot says what the pet is doing", () => {
    const { lead } = setup();
    act(() => lead().onNews({ kind: "errand", errand: "sniff" }));
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.sniff("Fox"));
    expect(screen.getByRole("button", { name: /Fox is sniffing out a gleam/ })).toBeInTheDocument();
    act(() => lead().onNews({ kind: "errand", errand: null }));
    act(() => lead().onNews({ kind: "errand", errand: "sit" }));
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.sit("Fox", "E"));
    expect(screen.getByRole("button", { name: /Fox is sitting by the door/ })).toBeInTheDocument();
    // Said once a visit: the second time the pet simply does it.
    act(() => lead().onNews({ kind: "errand", errand: "sniff" }));
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.sit("Fox", "E"));
    act(() => lead().onNews({ kind: "errand", errand: "trouble" }));
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.trouble("Fox"));
    act(() => lead().onNews({ kind: "errand", errand: null }));
    expect(screen.getByRole("button", { name: "Ask your Fox to show you the way, key F" })).toBeInTheDocument();
  });

  it("lets the pet break off toward a trouble only when the frame says so (full depth, not fewer choices), and only with a pet", () => {
    expect(setup().lead().breakOff).toBe(false);
    cleanup();
    expect(setup({ breakOff: true }).lead().breakOff).toBe(true);
    cleanup();
    expect(setup({ breakOff: true, pet: null }).lead().breakOff).toBe(false);
  });
});
