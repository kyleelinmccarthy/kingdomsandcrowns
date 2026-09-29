import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { makeHudBus, type HudBus } from "@/lib/realm3d/hud-bus";
import { controlRows, keyHints } from "@/lib/realm3d/frame";
import type { Goal } from "@/lib/realm3d/guide";
import type { LeadBus, LeadTarget } from "@/lib/realm3d/lead";
import { CompanionSlot, LeadLine, LeadMapMarks, leadWords, petLabel, slotCaption, useCompanionLead, type CompanionLead } from "./companion-hud";

const BRAM: Goal = { on: true, x: 0, z: 40, name: "Old Bram", id: "bram" };
const WORLD = { landmarks: [{ id: "far", name: "Far Place", position: { x: 200, z: 0 } }] } as unknown as Parameters<typeof useCompanionLead>[0]["world"];

type Seen = (lead: CompanionLead) => void;

function Harness({ pet, viewer = "child", bus, goal = BRAM, inside = false, breakOff = false, seen }: { pet: string | null; viewer?: "child" | "parent"; bus: HudBus; goal?: Goal; inside?: boolean; breakOff?: boolean; seen: Seen }) {
  const insideRef = useRef<unknown>(inside ? { room: "chapel" } : null);
  const lead = useCompanionLead({ avatar: { companion: pet }, viewer, calm: false, readAloud: false, bus, goal, world: WORLD, found: new Set(), insideRef, breakOff });
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

function setup(o: { pet?: string | null; viewer?: "child" | "parent"; goal?: Goal; inside?: boolean; breakOff?: boolean } = {}) {
  const bus = makeHudBus(4, 1);
  let latest: CompanionLead | null = null;
  const view = render(<Harness pet={o.pet === undefined ? "fox" : o.pet} viewer={o.viewer} bus={bus} goal={o.goal} inside={o.inside} breakOff={o.breakOff} seen={(l) => (latest = l)} />);
  return { bus, view, lead: () => latest!.bus as LeadBus };
}

const press = () => fireEvent.keyDown(window, { code: "KeyF" });
afterEach(cleanup);

describe("asking the pet the way", () => {
  it("F asks for a lead to whoever is waiting, when they are far", () => {
    const { lead } = setup();
    act(() => press());
    expect(lead().ask).toMatchObject({ kind: "villager", id: "bram", name: "Old Bram" });
    expect(screen.getByRole("button", { name: /Fox/ })).toHaveTextContent("Stop");
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
    const { bus, lead } = setup();
    bus.setPaused(true);
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
    const withPet = controlRows(4, { mount: true, pet: "Fox" });
    const f = withPet.find((r) => r.keys[0] === "F")!;
    expect(f.what).toMatch(/Ask your Fox to show you the way/);
    // Before the pause row, which stays last.
    expect(withPet[withPet.length - 1].keys).toEqual(["P", "Esc"]);
    expect(controlRows(4, { pet: false }).find((r) => r.keys[0] === "F")?.what).toMatch(/once you've picked one/);
    expect(controlRows(4, {}).some((r) => r.keys[0] === "F")).toBe(false);
    expect(keyHints(4, { pet: true }).map((h) => h.key)).toContain("F");
    expect(keyHints(4, {}).map((h) => h.key)).not.toContain("F");
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
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.sit("Fox"));
    expect(screen.getByRole("button", { name: /Fox is sitting by the door/ })).toBeInTheDocument();
    // Said once a visit: the second time the pet simply does it.
    act(() => lead().onNews({ kind: "errand", errand: "sniff" }));
    expect(screen.getByRole("status")).toHaveTextContent(leadWords.sit("Fox"));
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
