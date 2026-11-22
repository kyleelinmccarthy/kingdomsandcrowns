import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type MutableRefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => true, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun, retryDeedQuestion } from "@/lib/actions/deeds";
import { speak, stopSpeaking } from "@/lib/utils/speech";
import { villagerById } from "@/lib/realm/villagers";
import { RUNE_DONE, RUNE_FINISH, RUNE_HIDE, RUNE_LEAVE, RUNE_SHOW, RUNE_TITLE, RUNE_TRACKER_LABEL, runeFirstLine } from "@/lib/tasks/rune-copy";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { MEND, RUNE_WALK_SUMMARY, WALK_STOPS, runeWalkRun } from "@/test/rune-walk-run";
import { RuneWalk } from "./rune-walk";

/** Each mount's card slot, as the frame's column holds one (`.r3-walk-slot`). */
const slots: HTMLElement[] = [];
const newSlot = () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  slots.push(slot);
  return slot;
};
afterEach(() => {
  cleanup();
  for (const s of slots.splice(0)) s.remove();
});
beforeEach(() => vi.clearAllMocks());

const WAGON = WALK_STOPS[0].id;
const RIGHT = { correct: true, secondChance: false, answer: "The word was mend." };
const OPEN = { correct: false, secondChance: true, hint: "It rhymes with send.", feedback: "wrong_word" as const, firstPick: "r:1,2,4,0" };
const MISS = { correct: false, secondChance: false, answer: "The word was mend.", explain: "Mend means to make whole.", reveal: MEND };
const bram = villagerById("bram")!;

type Props = React.ComponentProps<typeof RuneWalk>;
function show(over: Partial<Props> & { r?: RunStart } = {}) {
  const sayRef = createRef<((line: string) => void) | null>() as MutableRefObject<((line: string) => void) | null>;
  sayRef.current = null;
  const { r = runeWalkRun(), ...rest } = over;
  const props: Props = {
    walk: { key: 1, run: r, villager: bram, buildingId: "well" },
    profile: { readAloud: false },
    calm: false,
    numerals: false,
    hidden: false,
    casting: false,
    cardSlot: newSlot(),
    mended: [],
    onAt: vi.fn(),
    onMended: vi.fn(),
    onCastClose: vi.fn(),
    onFinished: vi.fn(),
    onLeave: vi.fn(),
    sayRef,
    ...rest,
  };
  const view = render(<RuneWalk {...props} />);
  return { view, props, sayRef, rerender: (more: Partial<Props>) => view.rerender(<RuneWalk {...props} {...more} />) };
}
const card = () => screen.getByRole("region", { name: RUNE_TRACKER_LABEL });
const stone = () => screen.getByRole("dialog", { name: RUNE_TITLE });
const click = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
async function castWord(...tiles: string[]) {
  const tray = screen.getByRole("group", { name: "Runes to tap" });
  for (const t of tiles) fireEvent.click(within(tray).getByRole("button", { name: t }));
  await click("Cast");
}
const castMend = () => castWord("m", "e", "n", "d");

describe("RuneWalk, the tracker", () => {
  it("lists the three stops, the first as Next, and has no read-aloud button: the stone's is the one (RI-a / S4)", () => {
    show();
    const list = within(card()).getByRole("list");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(WALK_STOPS.map((s) => s.label));
    expect(card()).toHaveTextContent("Next: the broken wagon");
    expect(within(card()).queryByRole("button", { name: /read aloud|hear/i })).toBeNull();
    // Leak: the card names objects, never a word.
    expect(card().textContent).not.toMatch(/\bmend/i);
  });

  it("says the count to a screen reader, and writes it with numerals on", () => {
    show();
    expect(within(card()).getByRole("img", { name: "Rune 1 of 3" })).toBeInTheDocument();
    expect(screen.queryByText("Rune 1 of 3")).toBeNull();
    cleanup();
    show({ numerals: true });
    expect(screen.getByText("Rune 1 of 3")).toBeInTheDocument();
  });

  it("checks a stop once it is mended", () => {
    show({ mended: [WAGON] });
    const [wagon, lantern] = within(card()).getAllByRole("listitem");
    expect(wagon).toHaveClass("rune-walk-stop--mended");
    expect(within(wagon).getByText("mended", { exact: false })).toBeInTheDocument();
    expect(lantern).not.toHaveClass("rune-walk-stop--mended");
  });

  it("a walk picked back up starts at its own stop (RI-a / S1)", () => {
    const fresh = show();
    expect(fresh.props.onAt).toHaveBeenCalledWith(0);
    cleanup();
    const resumed = show({ r: runeWalkRun({ responses: [MEND, null, null] }) });
    expect(resumed.props.onAt).toHaveBeenCalledWith(1);
    expect(card()).toHaveTextContent("Next: the dark lantern");
    cleanup();
    const pending = show({ r: runeWalkRun({ responses: [MEND, MEND, null], pending: { index: 2, ruledOut: "r:1,2,4,0", hint: "It rhymes with send." } }) });
    expect(pending.props.onAt).toHaveBeenCalledWith(2);
  });

  it("shows a line said through sayRef in place of Next, and clears sayRef on unmount", () => {
    const { view, sayRef } = show();
    expect(sayRef.current).toBeTypeOf("function");
    act(() => sayRef.current?.(runeFirstLine("the broken wagon")));
    expect(card()).toHaveTextContent("First, the broken wagon.");
    expect(card()).not.toHaveTextContent("Next:");
    view.unmount();
    expect(sayRef.current).toBeNull();
  });

  it("Hide the list folds the card, and Show the list opens it again", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: RUNE_HIDE }));
    expect(within(card()).queryByRole("list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RUNE_SHOW }));
    expect(within(card()).getByRole("list")).toBeInTheDocument();
  });

  it("Leave the rune walk calls onLeave", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: RUNE_LEAVE }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("hidden hides the card and keeps the stop", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { rerender } = show({ casting: true });
    await castMend();
    await click(RUNE_DONE);
    rerender({ casting: false, hidden: true });
    expect(screen.queryByRole("region", { name: RUNE_TRACKER_LABEL })).toBeNull();
    rerender({ casting: false, hidden: false });
    expect(card()).toHaveTextContent("Next: the dark lantern");
  });

  it("the card is portalled into the slot, and the stone is not (RI-a / B2)", () => {
    const slot = newSlot();
    const { view } = show({ cardSlot: slot, casting: true });
    expect(slot.contains(card())).toBe(true);
    expect(slot.contains(stone())).toBe(false);
    expect(view.container.contains(card())).toBe(false);
  });

  it("draws no card before its slot exists, and the stone still opens", () => {
    show({ cardSlot: null, casting: true });
    expect(screen.queryByRole("region", { name: RUNE_TRACKER_LABEL })).toBeNull();
    expect(stone()).toBeInTheDocument();
  });
});

describe("RuneWalk, the stone at a stop", () => {
  it("shows nothing of the stone until the frame opens it", () => {
    show();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("group", { name: "The rune stone" })).toBeNull();
  });

  it("a right cast answers on the run's own action, mends its object, and the stone stays with Done (RI-a / B1)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { props } = show({ casting: true });
    expect(within(stone()).getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
    expect(stone()).toHaveTextContent("The wagon is broken. Build the word you hear.");
    await castMend();
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, MEND);
    expect(props.onMended).toHaveBeenCalledWith(WAGON);
    expect(stone()).toBeInTheDocument();
    expect(within(stone()).getByRole("button", { name: RUNE_DONE })).toBeInTheDocument();
    vi.mocked(props.onAt).mockClear();
    await click(RUNE_DONE);
    expect(props.onAt).toHaveBeenCalledWith(1);
    expect(props.onCastClose).toHaveBeenCalledTimes(1);
  });

  it("two Done presses before a re-render move on one stop, never two", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { props } = show({ casting: true });
    await castMend();
    vi.mocked(props.onAt).mockClear();
    const done = within(stone()).getByRole("button", { name: RUNE_DONE });
    await act(async () => {
      done.click();
      done.click();
    });
    expect(props.onAt).toHaveBeenCalledWith(1);
    expect(props.onAt).not.toHaveBeenCalledWith(2);
    expect(card()).toHaveTextContent("Next: the dark lantern");
  });

  it("a first wrong cast says Not that word and the hint, and offers Show me; the retry goes to the retry action", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    const { props } = show({ casting: true });
    await castWord("m", "a", "n", "d");
    expect(stone()).toHaveTextContent("Not that word. It rhymes with send.");
    expect(within(stone()).getByRole("button", { name: "Show me" })).toBeInTheDocument();
    await castMend();
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, MEND);
    expect(stone()).toHaveTextContent("The word was mend.");
    // A miss mends nothing; the stone still moves on with Done.
    expect(props.onMended).not.toHaveBeenCalled();
    expect(within(stone()).getByRole("button", { name: RUNE_DONE })).toBeInTheDocument();
  });

  it("a cast while a call is in flight makes no second call (RI-a / S3)", async () => {
    let settle!: (r: typeof RIGHT) => void;
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (settle = r)) as never);
    show({ casting: true });
    const tray = screen.getByRole("group", { name: "Runes to tap" });
    for (const t of ["m", "e", "n", "d"]) fireEvent.click(within(tray).getByRole("button", { name: t }));
    const cast = screen.getByRole("button", { name: "Cast" });
    await act(async () => {
      cast.click();
      cast.click();
    });
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
    // While it is out, Cast is shut.
    expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
    await act(async () => settle(RIGHT));
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
  });

  it("no task word is spoken at the walk's start; the destination is, and a dictation's word is spoken when the stone opens (RI-a / S5, review I-1)", () => {
    const { rerender } = show();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("Next: the broken wagon");
    expect(vi.mocked(speak).mock.calls.flat().join(" ")).not.toMatch(/\bmend\b/i);
    rerender({ casting: true });
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith("Mend. Mend the wagon. Mend.");
  });

  it("a walk picked back up says where it goes next, once, at its start", () => {
    show({ r: runeWalkRun({ responses: [MEND, null, null] }) });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("Next: the dark lantern");
  });

  it("a meaning is spoken when the stone opens only with read-aloud on", () => {
    const meaning = runeWalkRun();
    meaning.questions = meaning.questions.map((q) => (q.kind === "rune" ? { ...q, view: { ...q.view, listen: false } } : q));
    const { rerender } = show({ r: meaning, casting: true });
    expect(speak).not.toHaveBeenCalled();
    rerender({ casting: false });
    rerender({ casting: true, profile: { readAloud: true } });
    expect(speak).toHaveBeenCalledWith("Mend. Mend the wagon. Mend.");
  });

  it("a young hero (a dictation) hears the card's lines with read-aloud off: where to go at the start, First, …, and Next as the walk moves on (fix round 1, review I-1)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { sayRef, rerender } = show();
    // The destination at the walk's start, never a word (RI-a / S5).
    expect(speak).toHaveBeenCalledWith("Next: the broken wagon");
    act(() => sayRef.current?.(runeFirstLine("the broken wagon")));
    expect(speak).toHaveBeenLastCalledWith("First, the broken wagon.");
    rerender({ casting: true });
    await castMend();
    await click(RUNE_DONE);
    rerender({ casting: false });
    expect(speak).toHaveBeenLastCalledWith("Next: the dark lantern");
  });

  it("an older hero (a meaning) with read-aloud off hears none of the card's lines; with it on, they are said", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const meaning = runeWalkRun();
    meaning.questions = meaning.questions.map((q) => (q.kind === "rune" ? { ...q, view: { ...q.view, listen: false } } : q));
    const { sayRef, rerender } = show({ r: meaning });
    act(() => sayRef.current?.(runeFirstLine("the broken wagon")));
    rerender({ casting: true });
    await castMend();
    await click(RUNE_DONE);
    rerender({ casting: false });
    expect(speak).not.toHaveBeenCalled();
    rerender({ casting: false, profile: { readAloud: true } });
    act(() => sayRef.current?.("The rune holds here."));
    expect(speak).toHaveBeenLastCalledWith("The rune holds here.");
  });

  it("an older hero with read-aloud on hears where to go at the walk's start (review I-1)", () => {
    const meaning = runeWalkRun();
    meaning.questions = meaning.questions.map((q) => (q.kind === "rune" ? { ...q, view: { ...q.view, listen: false } } : q));
    show({ r: meaning, profile: { readAloud: true } });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("Next: the broken wagon");
  });

  it("Hear the word on the stone is the walk's own line: closing the stone stops it (I8 parked)", () => {
    const { rerender } = show({ casting: true });
    const token = { said: "Mend. Mend the wagon. Mend." };
    vi.mocked(speak).mockReturnValue(token as never);
    fireEvent.click(screen.getByRole("button", { name: "Hear the word" }));
    expect(speak).toHaveBeenLastCalledWith("Mend. Mend the wagon. Mend.");
    vi.mocked(stopSpeaking).mockClear();
    rerender({ casting: false });
    expect(stopSpeaking).toHaveBeenCalledWith(token);
  });

  it("the second-chance line is spoken, as the board's is", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    show({ casting: true });
    await castWord("m", "a", "n", "d");
    expect(speak).toHaveBeenLastCalledWith("Not that word. It rhymes with send.");
  });

  it("a miss line and Show me are brought into the stone's view on a short screen (smoke bug 1, review I-2)", async () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
      show({ casting: true });
      expect(into).not.toHaveBeenCalled();
      await castWord("m", "a", "n", "d");
      expect(into).toHaveBeenCalledWith({ block: "nearest" });
      expect(into.mock.contexts.at(-1)).toBe(stone().querySelector(".r3-feedback"));
      expect(within(into.mock.contexts.at(-1) as HTMLElement).getByRole("button", { name: "Show me" })).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it("Esc (the stone closed by the frame) keeps the flow: the same stop reopens on its second chance", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { props, rerender } = show({ casting: true });
    await castWord("m", "a", "n", "d");
    rerender({ casting: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card()).toHaveTextContent("Next: the broken wagon");
    rerender({ casting: true });
    expect(stone()).toHaveTextContent("Not that word. It rhymes with send.");
    expect(within(stone()).getByRole("button", { name: "Show me" })).toBeInTheDocument();
    expect(props.onAt).not.toHaveBeenCalledWith(1);
  });

  it("Esc while the cast is in flight: the answer lands with the stone closed, and the walk still moves on (fix round 1)", async () => {
    let settle!: (r: typeof RIGHT) => void;
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (settle = r)) as never);
    const { props, rerender } = show({ casting: true });
    await castMend();
    rerender({ casting: false });
    vi.mocked(props.onAt).mockClear();
    await act(async () => settle(RIGHT));
    expect(props.onMended).toHaveBeenCalledWith(WAGON);
    expect(props.onAt).toHaveBeenCalledWith(1);
    expect(props.onAt).not.toHaveBeenCalledWith(2);
    expect(card()).toHaveTextContent("Next: the dark lantern");
  });

  it("Esc while the cast is in flight and the answer is a second chance: the stop stays, to be tried again", async () => {
    let settle!: (r: typeof OPEN) => void;
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (settle = r)) as never);
    const { props, rerender } = show({ casting: true });
    await castWord("m", "a", "n", "d");
    rerender({ casting: false });
    await act(async () => settle(OPEN));
    expect(props.onAt).not.toHaveBeenCalledWith(1);
    expect(card()).toHaveTextContent("Next: the broken wagon");
  });

  it("the last stop resolved with the stone closed is never finished by itself: the card offers Finish", async () => {
    let settle!: (r: typeof RIGHT) => void;
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (settle = r)) as never);
    const { props, rerender } = show({ r: runeWalkRun({ responses: [MEND, MEND, null] }), casting: true });
    await castMend();
    rerender({ casting: false });
    await act(async () => settle(RIGHT));
    expect(completeDeedRun).not.toHaveBeenCalled();
    expect(props.onAt).not.toHaveBeenCalledWith(3);
    expect(within(card()).getByRole("button", { name: RUNE_FINISH })).toBeInTheDocument();
  });

  it("the stone closed on a resolved stop moves on, as Done does", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { props, rerender } = show({ casting: true });
    await castMend();
    vi.mocked(props.onAt).mockClear();
    rerender({ casting: false });
    expect(props.onAt).toHaveBeenCalledWith(1);
    expect(card()).toHaveTextContent("Next: the dark lantern");
  });
});

describe("RuneWalk, the finish", () => {
  const lastStop = () => runeWalkRun({ responses: [MEND, MEND, null] });

  it("the last stop's Finish the rune walk finishes the run once, then hands it up", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(RUNE_WALK_SUMMARY);
    const { props } = show({ r: lastStop(), casting: true });
    await castMend();
    expect(within(stone()).queryByRole("button", { name: RUNE_DONE })).toBeNull();
    const finish = within(stone()).getByRole("button", { name: RUNE_FINISH });
    await act(async () => {
      finish.click();
      finish.click();
    });
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(props.onFinished).toHaveBeenCalledWith(RUNE_WALK_SUMMARY);
  });

  it("a rejected finish says so, and Finish the rune walk tries again", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(RUNE_WALK_SUMMARY);
    const { props } = show({ r: lastStop(), casting: true });
    await castMend();
    await click(RUNE_FINISH);
    expect(stone()).toHaveTextContent("That didn't work.");
    expect(props.onFinished).not.toHaveBeenCalled();
    await click(RUNE_FINISH);
    expect(completeDeedRun).toHaveBeenCalledTimes(2);
    expect(props.onFinished).toHaveBeenCalledWith(RUNE_WALK_SUMMARY);
  });

  it("a finish left with the stone closed is offered on the card, and Leave waits while it is out", async () => {
    let settle!: (s: typeof RUNE_WALK_SUMMARY) => void;
    vi.mocked(completeDeedRun).mockReturnValue(new Promise((r) => (settle = r)) as never);
    // Picked back up with every word cast: its finish step.
    const { props } = show({ r: runeWalkRun({ responses: [MEND, MEND, MEND] }) });
    await act(async () => void fireEvent.click(within(card()).getByRole("button", { name: RUNE_FINISH })));
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(within(card()).getByRole("button", { name: RUNE_LEAVE })).toBeDisabled();
    await act(async () => settle(RUNE_WALK_SUMMARY));
    expect(props.onFinished).toHaveBeenCalledWith(RUNE_WALK_SUMMARY);
  });
});

describe("the rune walk's layout (slice 5's tracker fixes, kept for both walks)", () => {
  const trailCss = readFileSync(resolve(__dirname, "trail-walk.css"), "utf8");
  const decls = (css: string, selector: string) =>
    new RegExp(`(?:^|[\\n{}])\\s*${selector.replace(/[.[\]="()>:-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1]?.trim() ?? null;

  it("wears the trail's card: the same region classes, head, scrolling body and pinned foot", () => {
    show();
    const c = card();
    expect(c).toHaveClass("trail-walk", "r3-plank", "rune-walk");
    expect(c.querySelector(":scope > .trail-walk-head .trail-walk-fold")).not.toBeNull();
    expect(c.querySelector(":scope > .trail-walk-body")).not.toBeNull();
    expect(c.querySelector(":scope > .trail-walk-foot .trail-walk-leave")).not.toBeNull();
  });

  it("rests the objective card and caps the column for a card in the walk's slot, as for the trail's own card", () => {
    const pairs: [string, string][] = [
      [".r3-left-stack:has(> .trail-walk:not([hidden])) > .r3-quest", ".r3-left-stack:has(> .r3-walk-slot > .trail-walk:not([hidden])) > .r3-quest"],
      [".r3-left-stack:has(> .trail-walk:not([hidden]))", ".r3-left-stack:has(> .r3-walk-slot > .trail-walk:not([hidden]))"],
      ['.r3-root[data-larger-text="on"] .r3-left-stack:has(> .trail-walk:not([hidden]))', '.r3-root[data-larger-text="on"] .r3-left-stack:has(> .r3-walk-slot > .trail-walk:not([hidden]))'],
    ];
    for (const [trail, slot] of pairs) {
      expect(decls(trailCss, trail), trail).not.toBeNull();
      expect(decls(trailCss, slot), slot).toBe(decls(trailCss, trail));
    }
    // On a phone too, declaration for declaration: under the minimap, above the E prompt.
    const phone = (() => {
      const start = trailCss.indexOf("@media (max-width: 480px)");
      let depth = 0;
      for (let i = trailCss.indexOf("{", start); i < trailCss.length; i++) {
        if (trailCss[i] === "{") depth++;
        if (trailCss[i] === "}" && --depth === 0) return trailCss.slice(start, i + 1);
      }
      return "";
    })();
    for (const [trail, slot] of pairs.slice(1)) {
      expect(decls(phone, trail), trail).toMatch(/top:\s*14rem/);
      expect(decls(phone, slot), slot).toBe(decls(phone, trail));
    }
    // The slot itself draws no box: the card is the column's item.
    expect(decls(trailCss, ".r3-walk-slot")).toMatch(/display:\s*contents/);
  });
});
