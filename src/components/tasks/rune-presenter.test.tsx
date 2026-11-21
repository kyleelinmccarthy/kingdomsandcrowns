import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/speech", () => ({ canSpeak: vi.fn(() => true), speak: vi.fn(), stopSpeaking: vi.fn() }));

import { canSpeak, speak } from "@/lib/utils/speech";
import { RUNE_EFFECT_IDS, RUNE_OBJECTS, type RuneEffect } from "@/lib/realm/rune-objects";
import { toClientTask } from "@/lib/tasks/registry";
import {
  RUNE_CAST, RUNE_CLEAR, RUNE_EMPTY_ROW, RUNE_HEAR, RUNE_HEAR_MEANING, RUNE_HELP, RUNE_NO_SOUND_LEAD, RUNE_ROW_LABEL, RUNE_SAME_WORD, RUNE_STONE_LABEL, RUNE_TAKE_BACK, RUNE_TRAY_LABEL,
} from "@/lib/tasks/rune-copy";
import type { ClientTask, RuneTask } from "@/lib/tasks/types";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import { runeStub } from "@/test/rune-stubs";
import { TaskPresenter } from "./presenters";

type RuneClient = Extract<ClientTask, { kind: "rune" }>;
const client = (over: Partial<RuneTask> = {}) => toClientTask(runeStub(over)) as RuneClient;

/** The stub: a dictation for "mend" at the broken wagon, tiles d m a e n i. */
const MEND = client();
/** The same word on a tray with a two-letter tile: e a nd i m o. */
const ND = client({ tiles: ["e", "a", "nd", "i", "m", "o"] });
/** A grade 2–3 dictation (R-I18, owner): its word is the effect id itself, and phonogram tiles. */
const G23 = client({
  id: "spell-g23:rune:1a2b3c4d", skillId: "spell-g23", effect: "light", object: { id: "rune:lane-lantern", label: "the dark lantern" },
  prompt: "The lantern is dark. Build the word you hear.", readAloud: "Light. Light the lantern. Light.",
  tiles: ["t", "ee", "l", "s", "igh", "f"], words: ["light"], entry: "rune-g23/fx-light-01",
});
/** A meaning (grade 4 and up): shown and heard only on request; nothing in it holds the word. */
const MEANING = client({
  id: "vocab-g68:rune:9f8e7d6c", skillId: "vocab-g68", listen: false,
  prompt: "To put a thing back the way it was before it broke.", readAloud: "To put a thing back the way it was before it broke.",
  tiles: ["ore", "st", "pre", "re", "ive", "ed"], words: ["restore"], entry: "rune-g68/fx-mend-03",
});

const asking = (task: RuneClient): FlowState => initialFlow({ questions: [task], responses: [null], pending: null });

function show(task: RuneClient, over: { flow?: FlowState; variant?: "board" | "page"; disabled?: boolean; onWalk?: () => void; stops?: readonly string[]; say?: (text: string) => void } = {}) {
  const onRespond = vi.fn();
  const utils = render(
    <TaskPresenter
      task={task} flow={over.flow ?? asking(task)} variant={over.variant ?? "page"} numerals calm={false} disabled={over.disabled ?? false}
      onWalk={over.onWalk} stops={over.stops} say={over.say} onRespond={onRespond}
    />,
  );
  return { onRespond, ...utils };
}

const stone = () => screen.getByRole("group", { name: RUNE_STONE_LABEL });
const tray = () => within(stone()).getByRole("group", { name: RUNE_TRAY_LABEL });
/** The built row: the live region that holds the word as it grows. */
const row = () => stone().querySelector<HTMLElement>(".rune-row")!;
const tile = (name: string, nth = 0) => within(tray()).getAllByRole("button", { name })[nth];
const cast = () => screen.getByRole("button", { name: RUNE_CAST });
const placed = () => within(row()).queryAllByRole("button").map((b) => b.textContent);

beforeEach(() => {
  vi.mocked(canSpeak).mockReturnValue(true);
  vi.mocked(speak).mockClear();
});
afterEach(cleanup);

describe("Set off, on the Realm's board", () => {
  it("names the stops and hands the run to the walk once", () => {
    const onWalk = vi.fn();
    show(MEND, { variant: "board", onWalk, stops: ["the broken wagon", "the dark lantern"] });
    expect(screen.getByText("Two things in the village need a rune: the broken wagon and the dark lantern. Walk to each one and cast it there.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set off" }));
    expect(onWalk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: RUNE_STONE_LABEL })).toBeNull();
  });

  it("shows nothing at a run's finish step, where nothing is left to cast", () => {
    const { container } = show(MEND, { variant: "board", onWalk: () => {}, flow: { ...asking(MEND), phase: "resolved" } });
    expect(container).toBeEmptyDOMElement();
  });

  it("a board with no walk shows the stone", () => {
    show(MEND, { variant: "board" });
    expect(stone()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
  });
});

describe("the rune stone (R-I12)", () => {
  it("on the page shows the picture, the object's label and every tile as a button", () => {
    const { container } = show(MEND);
    const art = container.querySelector("svg.rune-pic");
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art).toHaveAttribute("viewBox", "0 0 120 90");
    expect(within(stone()).getByText("the broken wagon")).toBeInTheDocument();
    expect(within(tray()).getAllByRole("button").map((b) => b.textContent)).toEqual(["d", "m", "a", "e", "n", "i"]);
    expect(screen.getByText(RUNE_HELP)).toBeInTheDocument();
  });

  it("tapping m, e, nd, then Cast sends those tiles in order", () => {
    const { onRespond } = show(ND);
    fireEvent.click(tile("m"));
    fireEvent.click(tile("e"));
    fireEvent.click(tile("nd"));
    expect(placed()).toEqual(["m", "e", "nd"]);
    expect(tile("m")).toHaveAttribute("aria-pressed", "true");
    expect(tile("m")).toBeDisabled();
    expect(tile("a")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cast());
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith("r:4,0,2");
  });

  it("Cast waits for a tile", () => {
    const { onRespond } = show(MEND);
    expect(cast()).toBeDisabled();
    fireEvent.click(cast());
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("Backspace takes back the last tile, a tap on a placed tile takes back that one, and Clear takes back all", () => {
    show(MEND);
    for (const t of ["m", "e", "n", "d"]) fireEvent.click(tile(t));
    fireEvent.keyDown(tile("a"), { key: "Backspace" });
    expect(placed()).toEqual(["m", "e", "n"]);
    expect(tile("d")).toBeEnabled();
    fireEvent.click(within(row()).getByRole("button", { name: "e" }));
    expect(placed()).toEqual(["m", "n"]);
    fireEvent.click(screen.getByRole("button", { name: RUNE_CLEAR }));
    expect(placed()).toEqual([]);
    expect(row()).toHaveTextContent(RUNE_EMPTY_ROW);
  });

  it("nothing can be placed or cast while the player is busy", () => {
    const { onRespond } = show(MEND, { disabled: true });
    for (const b of within(tray()).getAllByRole("button")) expect(b).toBeDisabled();
    expect(cast()).toBeDisabled();
    fireEvent.click(tile("m"));
    expect(placed()).toEqual([]);
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("a word already ruled out cannot be cast again: Cast is disabled and the stone says so", () => {
    const flow: FlowState = { ...asking(MEND), phase: "second-chance", ruledOut: ["r:1,3,4,0"], picked: "r:1,3,4,0", result: { correct: false, secondChance: true, hint: "It rhymes with send." } };
    show(MEND, { flow });
    expect(screen.queryByText(RUNE_SAME_WORD)).toBeNull();
    for (const t of ["m", "e", "n", "d"]) fireEvent.click(tile(t));
    expect(cast()).toBeDisabled();
    expect(screen.getByText(RUNE_SAME_WORD)).toBeInTheDocument();
    fireEvent.keyDown(tile("a"), { key: "Backspace" });
    expect(cast()).toBeEnabled();
    expect(screen.queryByText(RUNE_SAME_WORD)).toBeNull();
  });

  it("a word already ruled out is refused by its spelling, not its tiles (RI-a / N2)", () => {
    const twoEs = client({ tiles: ["e", "m", "d", "e", "n", "a"] });
    // m, the first e, n, d was cast and ruled out.
    const flow: FlowState = { ...asking(twoEs), phase: "second-chance", ruledOut: ["r:1,0,4,2"], picked: "r:1,0,4,2", result: { correct: false, secondChance: true, hint: "h" } };
    show(twoEs, { flow });
    fireEvent.click(tile("m"));
    fireEvent.click(tile("e", 1));
    fireEvent.click(tile("n"));
    fireEvent.click(tile("d"));
    expect(placed()).toEqual(["m", "e", "n", "d"]);
    expect(cast()).toBeDisabled();
    expect(screen.getByText(RUNE_SAME_WORD)).toBeInTheDocument();
  });

  it("a fresh row for a second chance: the word that missed is taken back", () => {
    const { rerender } = render(<TaskPresenter task={MEND} flow={asking(MEND)} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    for (const t of ["m", "a", "n", "d"]) fireEvent.click(tile(t));
    const open: FlowState = { ...asking(MEND), phase: "second-chance", ruledOut: ["r:1,2,4,0"], picked: "r:1,2,4,0", result: { correct: false, secondChance: true, hint: "h" } };
    rerender(<TaskPresenter task={MEND} flow={open} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    expect(placed()).toEqual([]);
    expect(row()).toHaveTextContent(RUNE_EMPTY_ROW);
  });

  it("a resolved miss fills the row with the word's tiles, and nothing can be cast", () => {
    const flow: FlowState = { ...asking(MEND), phase: "resolved", ruledOut: ["r:1,2,4,0"], picked: "r:1,5,4,0", result: { correct: false, secondChance: false, answer: "The word was mend.", reveal: "r:1,3,4,0" } };
    show(MEND, { flow });
    const built = within(stone()).getByRole("list", { name: RUNE_ROW_LABEL });
    expect(within(built).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["m", "e", "n", "d"]);
    expect(within(built).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: RUNE_CAST })).toBeNull();
    for (const b of within(tray()).getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("a reveal that will not decode or fit the tray fills nothing, and does not throw", () => {
    for (const reveal of ["r:9,1", "toString", "", "r:1,1", undefined]) {
      const flow: FlowState = { ...asking(MEND), phase: "resolved", picked: "r:1,2", result: { correct: false, secondChance: false, answer: "The word was mend.", reveal } };
      show(MEND, { flow });
      const built = within(stone()).getByRole("list", { name: RUNE_ROW_LABEL });
      expect(within(built).getAllByRole("listitem").map((li) => li.textContent), String(reveal)).toEqual(["m", "a"]);
      cleanup();
    }
  });

  it("a right cast turns the picture to its mended form, and keeps the word built", () => {
    const { container } = show(MEND);
    const before = container.querySelector("svg.rune-pic")!.innerHTML;
    cleanup();
    const flow: FlowState = { ...asking(MEND), phase: "resolved", picked: "r:1,3,4,0", result: { correct: true, secondChance: false, answer: "The word was mend." } };
    const after = show(MEND, { flow }).container.querySelector("svg.rune-pic")!;
    expect(after.innerHTML).not.toBe(before);
    const built = within(stone()).getByRole("list", { name: RUNE_ROW_LABEL });
    expect(within(built).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["m", "e", "n", "d"]);
  });

  it("the built row is a live region, so each tile placed is heard (RI-a / N18)", () => {
    show(MEND);
    expect(row()).toHaveAttribute("aria-live", "polite");
  });

  it("a placed tile is heard as itself, and its take-back is described, outside the live row (final review m-5)", () => {
    show(MEND);
    fireEvent.click(tile("m"));
    const back = within(row()).getByRole("button", { name: "m" });
    expect(back).not.toHaveAttribute("aria-label");
    expect(back).toHaveAccessibleDescription(RUNE_TAKE_BACK);
    expect(row()).not.toHaveTextContent(RUNE_TAKE_BACK);
  });

  it("the help line shows while the word is asked; on a second chance the miss line has its place (smoke bug 1)", () => {
    show(MEND);
    expect(screen.getByText(RUNE_HELP)).toBeInTheDocument();
    cleanup();
    show(MEND, { flow: { ...asking(MEND), phase: "second-chance", ruledOut: ["r:1,2,4,0"], picked: "r:1,2,4,0", result: { correct: false, secondChance: true, hint: "h" } } });
    expect(screen.queryByText(RUNE_HELP)).toBeNull();
  });
});

describe("the leak rule at the stone (R-I17, RI-d)", () => {
  /** Every text and attribute value outside the picture (a fixed drawing per effect, made of numbers). */
  function shownStrings(root: HTMLElement): string[] {
    const out: string[] = [];
    const walk = (el: Element) => {
      if (el.tagName.toLowerCase() === "svg") return;
      for (const a of [...el.attributes]) out.push(a.value);
      for (const n of [...el.childNodes]) {
        if (n.nodeType === Node.TEXT_NODE) out.push(n.textContent ?? "");
        else if (n.nodeType === Node.ELEMENT_NODE) walk(n as Element);
      }
    };
    walk(root);
    return out;
  }

  it("the stone never shows the word's length: the row is empty, and no text or attribute holds the count", () => {
    show(MEND);
    expect(row().textContent).toBe(RUNE_EMPTY_ROW);
    // "mend" is four of these tiles (m, e, n, d).
    for (const s of shownStrings(stone())) expect(s).not.toMatch(/\b4\b|four/i);
    for (const b of within(tray()).getAllByRole("button")) {
      expect(b.className).toBe(within(tray()).getAllByRole("button")[0].className);
      expect([...b.attributes].map((a) => a.name).sort()).toEqual([...within(tray()).getAllByRole("button")[0].attributes].map((a) => a.name).sort());
    }
  });

  it.each(RUNE_EFFECT_IDS.map((e) => [e]))("the %s effect is a picture, never text or an attribute (RI-d)", (effect: RuneEffect) => {
    const object = RUNE_OBJECTS.find((o) => o.effect === effect && o.place === null)!;
    const task = client({ effect, object: { id: object.id, label: object.label }, listen: false, prompt: "p", readAloud: undefined });
    const { container } = show(task);
    expect(container.querySelector("svg.rune-pic")).not.toBeNull();
    for (const s of shownStrings(container)) expect(s.toLowerCase()).not.toContain(effect);
    // Nor anywhere in the picture's own markup.
    expect(container.querySelector("svg.rune-pic")!.outerHTML.toLowerCase()).not.toContain(effect);
  });

  it("no class, id or other attribute on the stone is a word any pool accepts", () => {
    const dir = resolve(__dirname, "../../content/runes");
    const words = new Set<string>();
    for (const band of ["k1", "g23", "g45", "g68", "g912"]) {
      const pool = JSON.parse(readFileSync(resolve(dir, `rune-${band}.json`), "utf8")) as { entries: { words: string[] }[] };
      for (const e of pool.entries) for (const w of e.words) words.add(w.toLowerCase());
    }
    for (const task of [MEND, G23, MEANING]) {
      const { container } = show(task);
      fireEvent.click(within(tray()).getAllByRole("button")[0]);
      const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
      const tokens = attrs.flatMap((v) => v.toLowerCase().split(/[^a-z]+/)).filter(Boolean);
      expect(tokens.filter((t) => words.has(t)), task.id).toEqual([]);
      cleanup();
    }
  });

  it("a grade 2–3 dictation on the page is the picture and the word heard: no element's text holds the word (R-I18, owner)", () => {
    const { container } = show(G23);
    expect(container.querySelector("svg.rune-pic")).not.toBeNull();
    expect(within(stone()).getByText("the dark lantern")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RUNE_HEAR })).toBeInTheDocument();
    for (const s of shownStrings(container)) expect(s.toLowerCase()).not.toMatch(/\blight\b/);
  });
});

describe("the one read control (RI-a / S4)", () => {
  it("is Hear the word for a dictation, and says the dictation", () => {
    show(MEND);
    expect(screen.queryByRole("button", { name: RUNE_HEAR_MEANING })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RUNE_HEAR }));
    expect(speak).toHaveBeenCalledWith("Mend. Mend the wagon. Mend.");
  });

  it("is Hear the meaning for a meaning, and says it", () => {
    show(MEANING);
    expect(screen.queryByRole("button", { name: RUNE_HEAR })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RUNE_HEAR_MEANING }));
    expect(speak).toHaveBeenCalledWith("To put a thing back the way it was before it broke.");
  });

  it("says the prompt when there is no readAloud", () => {
    show(client({ listen: false, readAloud: undefined, prompt: "To make a broken thing whole." }));
    fireEvent.click(screen.getByRole("button", { name: RUNE_HEAR_MEANING }));
    expect(speak).toHaveBeenCalledWith("To make a broken thing whole.");
  });

  it("speaks through its host's line when the host gives one, so closing the host stops it (I8 parked)", () => {
    const say = vi.fn();
    show(MEND, { say });
    fireEvent.click(screen.getByRole("button", { name: RUNE_HEAR }));
    expect(say).toHaveBeenCalledWith("Mend. Mend the wagon. Mend.");
    expect(speak).not.toHaveBeenCalled();
  });

  it("the stone says nothing by itself: its host decides (S5)", () => {
    show(MEND);
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("without speech, a dictation shows its word (RI-a / S6)", () => {
  it("prints the lead and the readAloud under the picture, and offers no read control", () => {
    vi.mocked(canSpeak).mockReturnValue(false);
    show(MEND);
    const line = screen.getByText(RUNE_NO_SOUND_LEAD, { exact: false });
    expect(line).toHaveTextContent(`${RUNE_NO_SOUND_LEAD} Mend. Mend the wagon. Mend.`);
    expect(screen.queryByRole("button", { name: RUNE_HEAR })).toBeNull();
    expect(screen.queryByRole("button", { name: RUNE_HEAR_MEANING })).toBeNull();
  });

  it("with speech, the readAloud is printed nowhere on the stone", () => {
    show(MEND);
    expect(stone().textContent).not.toMatch(/mend/i);
    expect(screen.queryByText(RUNE_NO_SOUND_LEAD, { exact: false })).toBeNull();
  });

  it("a meaning never prints its readAloud, with speech or without", () => {
    vi.mocked(canSpeak).mockReturnValue(false);
    show(MEANING);
    expect(screen.queryByText(RUNE_NO_SOUND_LEAD, { exact: false })).toBeNull();
    expect(stone().textContent).not.toContain("put a thing back");
  });
});

describe("keys and layout", () => {
  it("Enter, Space and Backspace on a tile never reach the game; Esc does", () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    try {
      show(MEND, { variant: "board" });
      fireEvent.keyDown(tile("m"), { key: "Enter" });
      fireEvent.keyDown(tile("m"), { key: " " });
      fireEvent.keyDown(tile("m"), { key: "Backspace" });
      expect(heard).not.toHaveBeenCalled();
      fireEvent.keyDown(tile("m"), { key: "Escape" });
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", heard);
    }
  });

  it("the first tile takes the focus, Tab moves through the tiles in tray order, and Enter places one", async () => {
    const user = userEvent.setup();
    show(MEND);
    const tiles = within(tray()).getAllByRole("button");
    expect(tiles[0]).toHaveFocus();
    for (const t of tiles.slice(1)) {
      await user.tab();
      expect(t).toHaveFocus();
    }
    await user.keyboard("{Enter}");
    expect(placed()).toEqual(["i"]);
  });

  it("a placed tile hands the focus on, so the keyboard never loses its place", async () => {
    const user = userEvent.setup();
    show(MEND);
    await user.keyboard("{Enter}");
    expect(placed()).toEqual(["d"]);
    expect(tile("m")).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(placed()).toEqual([]);
    expect(tile("d")).toHaveFocus();
  });

  it("the last tile placed hands the focus to Cast, or to Clear while Cast is shut (a word already ruled out): never to a disabled button (I8 parked)", async () => {
    const user = userEvent.setup();
    const all = "r:0,1,2,3,4,5";
    show(MEND, { flow: { ...asking(MEND), phase: "second-chance", ruledOut: [all], picked: all } });
    for (let i = 0; i < 6; i++) await user.keyboard("{Enter}");
    expect(placed()).toEqual(["d", "m", "a", "e", "n", "i"]);
    expect(cast()).toBeDisabled();
    expect(screen.getByRole("button", { name: RUNE_CLEAR })).toHaveFocus();
    cleanup();
    show(MEND);
    for (let i = 0; i < 6; i++) await user.keyboard("{Enter}");
    expect(cast()).toBeEnabled();
    expect(cast()).toHaveFocus();
  });

  it("keeps Hear, Clear and Cast in reach on a short screen: pinned to the board's foot, the picture beside its label and smaller (smoke bugs 1, 2; review I-2)", () => {
    const css = readFileSync(resolve(__dirname, "rune.css"), "utf8");
    /** The declarations of `sel` in `css`, read as written. */
    const decls = (text: string, sel: string) => new RegExp(`(?:^|[\\n{}])\\s*${sel.replace(/[.[\]="()>:-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? null;
    /** One `@media` block's body, by its query. */
    const media = (query: string) => {
      const start = css.indexOf(`@media ${query}`);
      if (start < 0) return "";
      let depth = 0;
      for (let i = css.indexOf("{", start); i < css.length; i++) {
        if (css[i] === "{") depth++;
        if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
      }
      return "";
    };
    // On the board (a scrolling panel), the acts stay on screen as the stone scrolls, on a fill of their own.
    const acts = decls(css, ".rune--board .rune-acts");
    expect(acts).toMatch(/position:\s*sticky/);
    expect(acts).toMatch(/bottom:\s*0/);
    expect(acts).toMatch(/background:/);
    // A short screen (390×667, and 844 or 800 tall with larger text): the picture stands beside its label, at most 12vh.
    const short = media("(max-height: 900px)");
    expect(short).not.toBe("");
    expect(decls(short, ".rune-scene")).toMatch(/flex-(?:direction|flow):\s*row/);
    expect(decls(short, ".rune-scene .rune-pic")).toMatch(/max-height:\s*12vh/);
    expect(decls(short, ".rune")).toMatch(/gap:/);
  });

  it("fits a 390 px phone and larger text: the tray wraps, every tile is a 40 px target at least, nothing is dragged", () => {
    const css = readFileSync(resolve(__dirname, "rune.css"), "utf8");
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule(".rune-tray")).toMatch(/flex-wrap: wrap/);
    expect(rule(".rune-word")).toMatch(/flex-wrap: wrap/);
    expect(rule(".rune-tile")).toMatch(/min-width: max\(40px, [\d.]+rem\)/);
    expect(rule(".rune-tile")).toMatch(/min-height: max\(40px, [\d.]+rem\)/);
    expect(rule(".rune-act")).toMatch(/min-height: max\(40px, [\d.]+rem\)/);
    // The picture gives way on a short phone, so the tray and Cast stay in reach.
    expect(rule(".rune-pic")).toMatch(/max-height: \d+vh/);
    expect(rule(".rune")).toMatch(/min-width: 0/);
    expect(css).not.toMatch(/draggable|touch-action: none/);
    show(MEND);
    for (const b of within(tray()).getAllByRole("button")) expect(b.className).toMatch(/\brune-tile\b/);
  });
});
