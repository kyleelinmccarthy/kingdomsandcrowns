import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import { useWorks } from "./use-works";
import { SatchelHud } from "./satchel-hud";

/**
 * The satchel leads the HUD (slice 3, "minutes, quieter"): what the hero's quests brought, and the
 * plan they are working toward with what it still waits on. Display only, so a visiting grown-up
 * sees the same block.
 */
afterEach(cleanup);

const NONE: ReadonlySet<string> = new Set();
const works = (over: Partial<Works> = {}): Works => ({ ...EMPTY_WORKS, ...over, balance: { ...EMPTY_WORKS.balance, ...over.balance } });

describe("the satchel", () => {
  it("shows each material the hero holds, as an icon and a count, in catalog order", () => {
    const { container } = render(<SatchelHud works={works({ balance: { ...EMPTY_WORKS.balance, dye: 4, stone: 1 } })} raised={NONE} numerals />);
    expect(screen.getByRole("region", { name: "Your satchel" })).toBeInTheDocument();
    const items = [...container.querySelectorAll(".r3-satchel-item")];
    expect(items.map((i) => i.textContent)).toEqual(["1", "4"]);
    expect(screen.getByRole("img", { name: "1 Stone" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4 Dye" })).toBeInTheDocument();
    expect(items.every((i) => i.querySelector("svg"))).toBe(true);
    // Nothing for a material the hero has none of.
    expect(screen.queryByRole("img", { name: /Ink/ })).toBeNull();
  });

  it("draws pips instead of numbers when numerals are off, and still says the count to a screen reader", () => {
    const { container } = render(<SatchelHud works={works({ balance: { ...EMPTY_WORKS.balance, herbs: 3 } })} raised={NONE} numerals={false} />);
    expect(container.querySelectorAll(".r3-pip.r3-pip--on")).toHaveLength(3);
    expect(screen.queryByText("3")).toBeNull();
    expect(screen.getByRole("img", { name: "3 Herbs" })).toBeInTheDocument();
  });

  it("caps the pips for a big heap and marks it with a +, the count still said in full", () => {
    const { container } = render(<SatchelHud works={works({ balance: { ...EMPTY_WORKS.balance, timber: 25, stone: 10 } })} raised={NONE} numerals={false} />);
    const [stone, timber] = [...container.querySelectorAll(".r3-satchel-item")];
    expect(timber.querySelectorAll(".r3-pip--on")).toHaveLength(10);
    expect(timber.querySelector(".r3-satchel-more")).toHaveTextContent("+");
    expect(screen.getByRole("img", { name: "25 Timber" })).toBeInTheDocument();
    // Exactly ten is all there is: no +, so ten and more than ten read differently.
    expect(stone.querySelectorAll(".r3-pip--on")).toHaveLength(10);
    expect(stone.querySelector(".r3-satchel-more")).toBeNull();
  });

  it("is the hero's own satchel to a visiting grown-up", () => {
    render(<SatchelHud works={works({ balance: { ...EMPTY_WORKS.balance, ink: 2 } })} raised={NONE} numerals heroName="Emma" visiting />);
    expect(screen.getByRole("region", { name: "Emma's satchel" })).toBeInTheDocument();
    cleanup();
    render(<SatchelHud works={works({ balance: { ...EMPTY_WORKS.balance, ink: 2 } })} raised={NONE} numerals heroName="Emma" visiting={false} />);
    expect(screen.getByRole("region", { name: "Your satchel" })).toBeInTheDocument();
  });

  it("shows the pinned plan with what it waits on", () => {
    render(<SatchelHud works={works({ pinned: "village-banners", balance: { ...EMPTY_WORKS.balance, dye: 1 } })} raised={NONE} numerals />);
    const plan = screen.getByText("Banners").closest(".r3-satchel-plan")!;
    expect(plan).toHaveTextContent("Pinned plan");
    // The Banners short of their own Dye first, then the Thread share nothing else in the satchel can pay (RD-t).
    expect(plan).toHaveTextContent("Needs 3 more Dye and 2 more Thread");
  });

  it("says a ready plan is ready, and shows a pin even with an empty satchel", () => {
    render(<SatchelHud works={works({ pinned: "village-banners", balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 } })} raised={NONE} numerals />);
    expect(screen.getByText("Ready to build")).toBeInTheDocument();
    cleanup();
    render(<SatchelHud works={works({ pinned: "village-banners" })} raised={NONE} numerals />);
    expect(screen.getByText("Banners")).toBeInTheDocument();
  });

  it("names a wing's building when it waits on it being raised", () => {
    render(<SatchelHud works={works({ pinned: "well-house", balance: { ...EMPTY_WORKS.balance, stone: 9 } })} raised={NONE} numerals />);
    expect(screen.getByText("Raise the Village Well first")).toBeInTheDocument();
  });

  it("forgets a pin whose every level stands, or that the catalog does not know (activePin)", () => {
    const { container } = render(<SatchelHud works={works({ pinned: "village-banners", built: { "village-banners": 3 } })} raised={NONE} numerals />);
    expect(container).toBeEmptyDOMElement();
    render(<SatchelHud works={works({ pinned: "__proto__", balance: { ...EMPTY_WORKS.balance, ink: 2 } })} raised={NONE} numerals />);
    expect(screen.queryByText(/Pinned plan/)).toBeNull();
    expect(screen.getByRole("img", { name: "2 Ink" })).toBeInTheDocument();
  });

  it("is absent with nothing to show", () => {
    const { container } = render(<SatchelHud works={EMPTY_WORKS} raised={NONE} numerals />);
    expect(container).toBeEmptyDOMElement();
  });

  it("takes in a finished build at once, through the frame's works", () => {
    // The plans board's `onBuilt`, played by a button: the build run's summary, the level built.
    function Harness() {
      const w = useWorks(works({ pinned: "village-banners", balance: { ...EMPTY_WORKS.balance, dye: 6, thread: 2 } }));
      return (
        <>
          <SatchelHud works={w.works} raised={NONE} numerals />
          <button type="button" onClick={() => w.applyBuildResult({ id: "village-banners", label: "Banners", level: 1, built: true, balance: { ...EMPTY_WORKS.balance, dye: 2 } })}>
            built
          </button>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("img", { name: "6 Dye" })).toBeInTheDocument();
    expect(screen.getByText("Ready to build")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "built" }).click());
    expect(screen.getByRole("img", { name: "2 Dye" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Thread/ })).toBeNull();
    // Level 2 is on offer now, and the satchel says what it wants.
    expect(screen.getByText(/^Needs /)).toBeInTheDocument();
  });
});
