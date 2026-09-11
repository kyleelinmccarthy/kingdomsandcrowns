import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHud, RealmManaPips, RealmMountButton } from "./realm-hud";
import { surfacesFor } from "@/lib/realm/depth";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

afterEach(cleanup);

// Every message now lives in the two centred lanes (RealmMessages), so the HUD's prop
// list carries no string it could print: no toast, no notice, no error, no banner.
//
// `mana`, `cleared` and `ride` are deliberately carried through this task unchanged:
// this task's gate is the whole suite, and the shell still renders all three. Task 10
// evicts them — it deletes the two mana cases and the ride half of the recess case,
// and drops these three keys from `base`. Keeping them here for one task is coverage,
// not churn: they are the only thing testing a meter that is still on screen.
const base = {
  heroName: "Lily",
  minutesRemaining: 7 as number | null,
  preview: false,
  hudScale: 1,
  paused: false,
  mana: null as number | null,
  cleared: null as number | null,
  recess: null,
  ride: null,
};

describe("RealmHud", () => {
  it("shows the hero's minutes", () => {
    render(<RealmHud {...base} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
  });

  it("prints no message of its own — the lanes own every one", () => {
    render(<RealmHud {...base} minutesRemaining={1} />);
    expect(document.querySelector(".realm-hud-notice")).toBeNull();
    expect(document.querySelector(".realm-hud-toast")).toBeNull();
    expect(document.querySelector(".realm-hud-error")).toBeNull();
    expect(document.querySelector(".realm-hud-banner")).toBeNull();
    expect(document.querySelector(".realm-hud-note")).toBeNull();
    expect(screen.queryByText("One minute left in the Realm today.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });

  it("links back to the Tavern", () => {
    render(<RealmHud {...base} minutesRemaining={3} hudScale={1.25} />);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });

  it("shows the selector only in the preview HUD", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} selector={<span>picker</span>} />);
    expect(screen.getByText("picker")).toBeInTheDocument();
    cleanup();
    render(<RealmHud {...base} minutesRemaining={3} selector={<span>picker</span>} />);
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });

  it("marks the counter paused", () => {
    render(<RealmHud {...base} paused={true} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RealmHud {...base} minutesRemaining={null} preview={true} selector={<span>picker</span>} />);
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });

  it("shows mana and the cleared count", () => {
    render(<RealmHud {...base} mana={42} cleared={3} />);
    const bar = screen.getByRole("progressbar", { name: "Mana" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Cleared: 3")).toBeInTheDocument();
  });

  it("hides mana and the count in preview", () => {
    render(<RealmHud {...base} minutesRemaining={null} preview={true} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared:/)).not.toBeInTheDocument();
  });

  it("shows recess tallies and the ride button", () => {
    const onToggle = vi.fn();
    render(<RealmHud {...base} mana={50} cleared={0} recess={{ gleams: 3, laps: 1, bestLapMs: 40_300, lapMs: 12_000 }} ride={{ riding: false, disabled: false, onToggle }} />);
    expect(screen.getByText("Gleams: 3")).toBeInTheDocument();
    expect(screen.getByText(/Laps: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Best 40\.3 s/)).toBeInTheDocument();
    expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ride" }));
    expect(onToggle).toHaveBeenCalled();
    cleanup();
    render(<RealmHud {...base} mana={50} cleared={0} ride={{ riding: true, disabled: true, onToggle }} />);
    expect(screen.getByRole("button", { name: "Dismount" })).toBeDisabled();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
  });

  it("shows the worn crown and the ceremony's Skip button", () => {
    const onSkip = vi.fn();
    render(<RealmHud {...base} paused={true} crown={{ label: "Copper Circlet", color: "#b87333" }} ceremony={{ onSkip }} />);
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("offers How to play as a 44px button and disables it while a panel is open", () => {
    const onOpen = vi.fn();
    render(<RealmHud {...base} help={{ onOpen, disabled: false }} />);
    const button = screen.getByRole("button", { name: "How to play" });
    expect(button.className).toContain("realm-hud-help");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    cleanup();
    render(<RealmHud {...base} paused={true} help={{ onOpen, disabled: true }} />);
    expect(screen.getByRole("button", { name: "How to play" })).toBeDisabled();
  });
});

// The two depths, taken from the contract itself rather than hand-built, so a
// change to surfacesFor's table cannot leave these cases quietly testing nothing.
const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);
const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);

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
