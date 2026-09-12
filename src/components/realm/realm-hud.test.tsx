import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { RealmHud, RealmManaPips, RealmMountButton } from "./realm-hud";
import { surfacesFor } from "@/lib/realm/depth";
import type { ObjectiveState } from "@/lib/realm/objective";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

afterEach(cleanup);

const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);
const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);

const next: ObjectiveState = {
  kind: "next",
  objectives: [{ buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 2, total: 5 }],
};
const nextThree: ObjectiveState = {
  kind: "next",
  objectives: [
    { buildingId: "well", villagerId: "bram", label: "Village Well", villagerName: "Old Bram", done: 2, total: 5 },
    { buildingId: "mill", villagerId: "tessa", label: "Grain Mill", villagerName: "Miller Tessa", done: 1, total: 5 },
    { buildingId: "bridge", villagerId: "aldo", label: "River Bridge", villagerName: "Carpenter Aldo", done: 0, total: 5 },
  ],
};

function hud(overrides: Partial<ComponentProps<typeof RealmHud>> = {}) {
  const props: ComponentProps<typeof RealmHud> = {
    heroName: "Lily",
    minutesRemaining: 7,
    preview: false,
    hudScale: 1,
    paused: false,
    objective: next,
    surfaces: full,
    kingdomDone: 3,
    kingdomTotal: 8,
    recessPill: null,
    minimap: null,
    ...overrides,
  };
  return render(<RealmHud {...props} />);
}

const zone = (name: string) => document.querySelector<HTMLElement>(name)!;

describe("RealmHud zones", () => {
  it("lays out three pass-through zones whose controls still accept pointers", () => {
    hud({ ceremony: { onSkip: () => {} }, help: { onOpen: () => {}, disabled: false } });
    expect(zone(".realm-hud-identity").style.pointerEvents).toBe("none");
    expect(zone(".realm-hud-objective").style.pointerEvents).toBe("none");
    expect(zone(".realm-hud-meta").style.pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: "Skip" }).style.pointerEvents).toBe("auto");
    expect(screen.getByRole("button", { name: "How to play" }).style.pointerEvents).toBe("auto");
    expect(screen.getByRole("link", { name: "Leave the Realm" }).style.pointerEvents).toBe("auto");
  });

  it("has no scoreboard left in the corner", () => {
    hud({ recessPill: "Recess · 3 gleams · 1 lap" });
    expect(screen.queryByRole("progressbar", { name: "Mana" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Laps:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ride" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismount" })).not.toBeInTheDocument();
    expect(screen.getByText("Recess · 3 gleams · 1 lap")).toBeInTheDocument();
  });

  it("puts the quest log top-left and the controls bottom-right", () => {
    const { container } = hud({ minimap: <div data-testid="map" /> });
    const root = container.querySelector(".realm-hud")!;
    // Order in the DOM is the order in the corners: objective, minimap, identity, meta.
    const zones = [...root.children].map((el) => el.className.split(" ")[0]);
    expect(zones).toEqual(["realm-hud-objective", "realm-hud-corner", "realm-hud-identity", "realm-hud-meta"]);
    expect(container.querySelector(".realm-hud-objective")).toBeInTheDocument();
    expect(container.querySelector(".realm-hud-meta")).toBeInTheDocument();
    expect(within(container.querySelector<HTMLElement>(".realm-hud-corner")!).getByTestId("map")).toBeInTheDocument();
  });

  it("holds the mana strip in the identity corner, not loose at the bottom centre", () => {
    const { container } = hud({ mana: 7 });
    expect(container.querySelector(".realm-hud-identity .realm-mana-pips")).toBeInTheDocument();
  });

  it("renders without a minimap rather than throwing", () => {
    const { container } = hud({ minimap: null });
    expect(container.querySelector(".realm-hud-identity")).toBeInTheDocument();
  });
});

describe("RealmHud identity plate", () => {
  it("shows the hero's name and the kingdom line as pips at simple depth", () => {
    hud({ surfaces: simple });
    const identity = zone(".realm-hud-identity");
    expect(within(identity).getByText("Lily")).toBeInTheDocument();
    const row = within(identity).getByRole("img", { name: "3 of 8 buildings raised." });
    expect(row.querySelectorAll(".realm-pip")).toHaveLength(8);
    expect(row.querySelectorAll(".realm-pip--on")).toHaveLength(3);
    expect(within(identity).queryByText("3 of 8 raised")).not.toBeInTheDocument();
  });

  it("shows the kingdom line as numerals at full depth, with the same accessible name", () => {
    hud({ surfaces: full });
    const identity = zone(".realm-hud-identity");
    const row = within(identity).getByRole("img", { name: "3 of 8 buildings raised." });
    expect(row).toHaveTextContent("3 of 8 raised");
    expect(identity.querySelectorAll(".realm-pip")).toHaveLength(0);
  });

  it("drops the kingdom line rather than saying 0 of 0 when the kingdom did not load", () => {
    hud({ kingdomDone: 0, kingdomTotal: 0, objective: { kind: "unknown" } });
    expect(screen.getByText("Lily")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /buildings raised\./ })).not.toBeInTheDocument();
  });
});

describe("RealmHud objective card", () => {
  it("names the next building, its villager and the side-quest progress", () => {
    hud({ surfaces: full });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Village Well")).toBeInTheDocument();
    expect(within(card).getByText("Old Bram is waiting.")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "2 of 5 side quests done." })).toHaveTextContent("2 of 5");
    expect(within(card).queryByText(/deed/i)).not.toBeInTheDocument();
  });

  it("keeps the progress row's accessible name numeric at simple depth, where it is pips", () => {
    hud({ surfaces: simple });
    const card = screen.getByRole("region", { name: "What to do next" });
    const row = within(card).getByRole("img", { name: "2 of 5 side quests done." });
    expect(row.querySelectorAll(".realm-pip")).toHaveLength(5);
    expect(row.querySelectorAll(".realm-pip--on")).toHaveLength(2);
    expect(row).not.toHaveTextContent("2 of 5");
  });

  it("tracks the extra objectives at full depth", () => {
    hud({ surfaces: full, objective: nextThree });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Grain Mill · 1 of 5")).toBeInTheDocument();
    expect(within(card).getByText("River Bridge · 0 of 5")).toBeInTheDocument();
  });

  it("says the kingdom stands when every building is raised", () => {
    hud({ objective: { kind: "complete" } });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Every building is raised.")).toBeInTheDocument();
    expect(within(card).getByText("Nothing is waiting. Walk where you like.")).toBeInTheDocument();
    expect(card.querySelectorAll(".realm-pips")).toHaveLength(0);
  });

  it("renders no card at all when the kingdom did not load", () => {
    hud({ objective: { kind: "unknown" } });
    expect(screen.queryByRole("region", { name: "What to do next" })).not.toBeInTheDocument();
    expect(screen.queryByText("Every building is raised.")).not.toBeInTheDocument();
  });
});

describe("RealmHud meta zone", () => {
  it("counts the minutes and marks them paused", () => {
    hud({ minutesRemaining: 7, paused: true });
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
  });

  it("hides the counter for a parent and tells them whose grounds these are, always in numbers", () => {
    hud({ preview: true, minutesRemaining: null, surfaces: simple, selector: <span>picker</span> });
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Old Bram is waiting for Lily.")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "2 of 5 side quests done." })).toHaveTextContent("2 of 5");
    expect(document.querySelectorAll(".realm-pip")).toHaveLength(0);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("picker")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });

  it("shows the selector only in the preview HUD", () => {
    hud({ selector: <span>picker</span> });
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });

  it("keeps the crown badge, Skip, the help button and the Tavern link", () => {
    const onSkip = vi.fn();
    const onOpen = vi.fn();
    hud({ crown: { label: "Copper Circlet", color: "#b87333" }, ceremony: { onSkip }, help: { onOpen, disabled: false } });
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
    const helpButton = screen.getByRole("button", { name: "How to play" });
    expect(helpButton.className).toContain("realm-hud-help");
    fireEvent.click(helpButton);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });

  it("disables the help button while a panel is open", () => {
    hud({ help: { onOpen: () => {}, disabled: true } });
    expect(screen.getByRole("button", { name: "How to play" })).toBeDisabled();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    hud({ preview: true, minutesRemaining: null, selector: <span>picker</span> });
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });
});
describe("RealmManaPips", () => {
  it("draws ten pips, filled to the nearest ten, with a numeric name", () => {
    render(<RealmManaPips mana={65} surfaces={simple} refused={false} />);
    const strip = screen.getByRole("img", { name: "Mana 65 of 100." });
    expect(strip.querySelectorAll(".realm-pip")).toHaveLength(10);
    expect(strip.querySelectorAll(".realm-pip--on")).toHaveLength(7);
    expect(strip).not.toHaveTextContent("Mana 65");
  });

  it("reads the number itself at full depth, under the same accessible name", () => {
    render(<RealmManaPips mana={65} surfaces={full} refused={false} />);
    const strip = screen.getByRole("img", { name: "Mana 65 of 100." });
    expect(strip).toHaveTextContent("Mana 65");
    expect(strip.querySelectorAll(".realm-pip")).toHaveLength(0);
  });

  it("shows nothing at all when there is no mana to show", () => {
    const { container } = render(<RealmManaPips mana={null} surfaces={full} refused={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the strip refused so the red flash has something to hang on", () => {
    render(<RealmManaPips mana={4} surfaces={simple} refused={true} />);
    expect(screen.getByRole("img", { name: "Mana 4 of 100." })).toHaveClass("realm-mana-pips--refused");
  });
});

describe("RealmMountButton", () => {
  it("offers a round Ride button with the M keycap for a keyboard hero", () => {
    const onToggle = vi.fn();
    render(<RealmMountButton ride={{ riding: false, disabled: false, onToggle }} showStick={false} />);
    const button = screen.getByRole("button", { name: "Ride your mount" });
    expect(button).toHaveClass("realm-mount-button");
    expect(button).toHaveTextContent("Ride");
    expect(button.querySelector(".realm-mount-key")).toHaveTextContent("M");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("says Dismount while riding, and drops the keycap on a touch device", () => {
    render(<RealmMountButton ride={{ riding: true, disabled: false, onToggle: () => {} }} showStick={true} />);
    const button = screen.getByRole("button", { name: "Get off your mount" });
    expect(button).toHaveTextContent("Dismount");
    expect(button.querySelector(".realm-mount-key")).toBeNull();
  });

  it("renders disabled for a parent, and nothing at all for a hero with no mount", () => {
    render(<RealmMountButton ride={{ riding: false, disabled: true, onToggle: () => {} }} showStick={false} />);
    expect(screen.getByRole("button", { name: "Ride your mount" })).toBeDisabled();
    cleanup();
    const { container } = render(<RealmMountButton ride={null} showStick={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
