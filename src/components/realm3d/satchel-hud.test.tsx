import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("the satchel at phone width (the left stack must clear the spell bar)", () => {
  const css = (file: string) => readFileSync(resolve(__dirname, file), "utf8");
  /** The body of the first `@media (max-width: 480px)` block in a stylesheet. */
  const phoneBlock = (src: string): string => {
    const start = src.indexOf("@media (max-width: 480px)");
    if (start === -1) return "";
    let depth = 0;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    return "";
  };
  const rule = (block: string, selector: string) => new RegExp(`${selector.replace(/[.[\]="-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? "";

  it("is built so a phone can show one row of chips and the plan's name alone: headings, chips, name and line are each their own element", () => {
    const all = { stone: 1, ink: 4, herbs: 2, thread: 4, dye: 3, timber: 2 };
    const { container } = render(<SatchelHud works={works({ balance: all, pinned: "village-statue" })} raised={NONE} numerals />);
    // The headings the phone hides.
    expect(container.querySelector(".r3-satchel-tab")).toHaveTextContent("Satchel");
    expect(container.querySelector(".r3-satchel-plan-tab")).toHaveTextContent("Pinned plan");
    // Six chips, each an icon and a number, in the one list the phone lays out as a single row.
    const lists = container.querySelectorAll(".r3-satchel-items");
    expect(lists).toHaveLength(1);
    const chips = [...lists[0].querySelectorAll(":scope > .r3-satchel-item")];
    expect(chips).toHaveLength(6);
    expect(chips.every((c) => c.querySelector("svg") && c.querySelector(".r3-satchel-count"))).toBe(true);
    // The plan's name in its own span (the phone ellipsizes it on one line), apart from its line.
    expect(container.querySelector(".r3-satchel-plan-name .r3-satchel-plan-label")).toHaveTextContent(/^Statue$/);
    expect(container.querySelector(".r3-satchel-plan-line")).toHaveTextContent(/^Needs /);
    expect(container.querySelector(".r3-satchel-plan-name .r3-satchel-plan-line")).toBeNull();
  });

  it("caps the left stack above the spell bar under 480 px, at either text size", () => {
    const block = phoneBlock(css("realm-frame.css"));
    expect(rule(block, ".r3-left-stack")).toMatch(/max-height:\s*calc\(100% - 5\.6rem - [\d.]+rem\)/);
    expect(rule(block, ".r3-left-stack")).toMatch(/overflow:\s*hidden/);
    expect(rule(block, '.r3-root[data-larger-text="on"] .r3-left-stack')).toMatch(/max-height:\s*calc\(100% - 6\.72rem - [\d.]+rem\)/);
    // The objective card's extra rows go, so the stack stays short.
    expect(rule(block, ".r3-quest-extra")).toMatch(/display:\s*none/);
  });

  it("lays the satchel out as one row of six compact chips with no headings under 480 px, and the plan's name on one ellipsized line", () => {
    const block = phoneBlock(css("satchel.css"));
    expect(rule(block, ".r3-satchel-items")).toMatch(/grid-template-columns:\s*repeat\(6,/);
    expect(rule(block, ".r3-satchel")).toMatch(/max-width:[^;]*100vw - 2rem/);
    expect(rule(block, ".r3-satchel-tab")).toMatch(/display:\s*none/);
    expect(rule(block, ".r3-satchel-plan-tab")).toMatch(/display:\s*none/);
    expect(rule(block, ".r3-satchel-plan-line")).toMatch(/display:\s*none/);
    const label = rule(block, ".r3-satchel-plan-label");
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(block).not.toMatch(/\.r3-satchel-plan-name[^{]*\{[^}]*display:\s*none/);
  });
});
