import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type MutableRefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => true, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun, resolveDeedQuestion, retryDeedQuestion } from "@/lib/actions/deeds";
import { speak } from "@/lib/utils/speech";
import { villagerById } from "@/lib/realm/villagers";
import type { AnchorId } from "@/lib/realm/anchors";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import {
  TRAIL_FINISH,
  TRAIL_HIDE,
  TRAIL_LEAVE,
  TRAIL_LOOKED_HERE,
  TRAIL_READ_ALOUD,
  TRAIL_SEARCH_VERB,
  TRAIL_SHOW,
  TRAIL_TRACKER_LABEL,
  trailClueCount,
} from "@/lib/tasks/trail-copy";
import { TrailWalk } from "./trail-walk";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const clue = (n: number, prompt: string, readAloud?: string) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt, view: {}, ...(readAloud ? { readAloud } : {}) });
const CLUE_1 = clue(1, "Go where the big wheel turns.", "Go where the big wheel turns, and grain becomes flour.");
const CLUE_2 = clue(2, "Go where the bees make honey.");
const run: RunStart = {
  runId: "r1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" },
  questions: [CLUE_1, CLUE_2],
  responses: [null, null],
  kind: "deed",
  pending: null,
};
const RIGHT = { correct: true, secondChance: false };
const OPEN = { correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place" as const, firstPick: "landmark:well" };
const MISS = { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" };
const summary: RunSummary = {
  correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed",
  building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 9, practice: false }, minutesEarned: 3, sideQuestPayFull: false,
};
const bram = villagerById("bram")!;

type Props = React.ComponentProps<typeof TrailWalk>;
function show(over: Partial<Props> & { r?: RunStart } = {}) {
  const answerRef = createRef<((id: AnchorId) => void) | null>() as MutableRefObject<((id: AnchorId) => void) | null>;
  answerRef.current = null;
  const { r = run, ...rest } = over;
  const props: Props = {
    walk: { key: 1, run: r, villager: bram, buildingId: "well" },
    profile: { readAloud: false },
    calm: false,
    numerals: false,
    hidden: false,
    answerRef,
    onReveal: vi.fn(),
    onFinished: vi.fn(),
    onLeave: vi.fn(),
    ...rest,
  };
  const view = render(<TrailWalk {...props} />);
  const search = (id: AnchorId) => act(async () => void answerRef.current?.(id));
  return { view, props, answerRef, search, rerender: (more: Partial<Props>) => view.rerender(<TrailWalk {...props} {...more} />) };
}
const card = () => screen.getByRole("region", { name: TRAIL_TRACKER_LABEL });
const said = () => vi.mocked(speak).mock.calls.map((c) => c[0]);

describe("the walk's words", () => {
  it("are Part H's, exactly", () => {
    expect(TRAIL_SEARCH_VERB).toBe("Search");
    expect(TRAIL_TRACKER_LABEL).toBe("Reading trail");
    expect(TRAIL_LOOKED_HERE).toBe("You searched here already. Try somewhere else.");
    expect(TRAIL_LEAVE).toBe("Leave the trail");
    expect(TRAIL_FINISH).toBe("Finish the trail");
    expect(TRAIL_HIDE).toBe("Hide the clue");
    expect(TRAIL_SHOW).toBe("Show the clue");
    expect(trailClueCount(2, 4)).toBe("Clue 2 of 4");
  });
});

describe("TrailWalk, the tracker", () => {
  it("shows clue 1 and its dots, and speaks it with read-aloud on", () => {
    show({ profile: { readAloud: true } });
    expect(card()).toHaveTextContent("Go where the big wheel turns.");
    expect(screen.getByRole("img", { name: "Clue 1 of 2" })).toBeInTheDocument();
    // Numerals off: the count is said to a screen reader, never written.
    expect(screen.queryByText("Clue 1 of 2")).toBeNull();
    expect(speak).toHaveBeenCalledWith("Go where the big wheel turns, and grain becomes flour.");
  });

  it("writes the count with numerals on", () => {
    show({ numerals: true });
    expect(screen.getByText("Clue 1 of 2")).toBeInTheDocument();
  });

  it("shows the clue in a polite live paragraph, and nothing else of the task", () => {
    show();
    const clueLine = screen.getByText("Go where the big wheel turns.");
    expect(clueLine.tagName).toBe("P");
    expect(clueLine).toHaveAttribute("aria-live", "polite");
    // Leak: nothing about any place is on the card before a search.
    expect(card().textContent).not.toMatch(/mill|well|landmark|object:/i);
  });

  it("never takes focus by itself, so the game's keys keep working", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { search } = show();
    expect(document.activeElement).toBe(document.body);
    await search("landmark:mill");
    expect(document.activeElement).toBe(document.body);
  });

  it("a K hero hears every clue with read-aloud off: the clue, the second-chance line, the miss line and clue 2", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    const { search } = show({ r: { ...run, narrateClues: true }, profile: { readAloud: false } });
    expect(said()).toEqual(["Go where the big wheel turns, and grain becomes flour."]);
    await search("landmark:well");
    expect(said()[1]).toBe("Not here. That is where water is drawn.");
    await search("landmark:garden");
    // The miss and the next clue are one line, so the second does not cut the first off.
    expect(said()[2]).toBe("It was the mill. Flour is ground at the mill. Go where the bees make honey.");
  });

  it("a grade-1 hero's clue is not spoken unless asked: the read-aloud button speaks it", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { search } = show({ profile: { readAloud: false } });
    expect(speak).not.toHaveBeenCalled();
    await search("landmark:well");
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(speak).toHaveBeenCalledWith("Go where the big wheel turns, and grain becomes flour.");
  });

  it("E at a stake answers the clue on the run's own answer action", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { search } = show();
    await search("landmark:mill");
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:mill");
  });

  it("a right place: \"That's it! Old Bram is pleased.\" stays above clue 2", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { search, props } = show();
    await search("landmark:mill");
    expect(card()).toHaveTextContent("That's it! Old Bram is pleased.");
    expect(screen.getByText("Go where the bees make honey.")).toBeInTheDocument();
    expect(screen.queryByText("Go where the big wheel turns.")).toBeNull();
    expect(screen.getByRole("img", { name: "Clue 2 of 2" })).toBeInTheDocument();
    expect(props.onReveal).not.toHaveBeenCalled();
    // Clue 2 is answered as clue 2.
    await search("object:beehives");
    expect(answerDeedQuestion).toHaveBeenLastCalledWith("r1", 1, "object:beehives");
  });

  it("a first wrong place: \"Not here.\" and the place's redirect, and Show me", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { search } = show();
    await search("landmark:well");
    expect(card()).toHaveTextContent("Not here. That is where water is drawn.");
    expect(screen.getByRole("button", { name: "Show me" })).toBeInTheDocument();
    expect(screen.getByText("Go where the big wheel turns.")).toBeInTheDocument();
  });

  it("the same place again says it was searched already, and makes no call (Review Focus 5)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { search } = show();
    await search("landmark:well");
    await search("landmark:well");
    expect(card()).toHaveTextContent(TRAIL_LOOKED_HERE);
    expect(retryDeedQuestion).not.toHaveBeenCalled();
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
  });

  it("a second wrong place: the answer is revealed, \"It was the mill.\", and clue 2", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    const { search, props } = show();
    await search("landmark:well");
    await search("landmark:garden");
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:garden");
    expect(props.onReveal).toHaveBeenCalledWith("landmark:mill");
    expect(card()).toHaveTextContent("It was the mill. Flour is ground at the mill.");
    expect(card()).not.toHaveTextContent(TRAIL_LOOKED_HERE);
    expect(screen.getByText("Go where the bees make honey.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me" })).toBeNull();
  });

  it("the gold stake goes back with the hero's next search", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValueOnce(OPEN).mockResolvedValueOnce(RIGHT);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    vi.mocked(completeDeedRun).mockReturnValue(new Promise(() => {}));
    const { search, props } = show();
    await search("landmark:well");
    await search("landmark:garden");
    expect(vi.mocked(props.onReveal).mock.calls).toEqual([["landmark:mill"]]);
    await search("object:beehives");
    expect(vi.mocked(props.onReveal).mock.calls).toEqual([["landmark:mill"], [null]]);
  });

  it("Show me on a second chance reveals the answer, as a second wrong place does", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(resolveDeedQuestion).mockResolvedValue(MISS);
    const { search, props } = show();
    await search("landmark:well");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show me" })));
    expect(resolveDeedQuestion).toHaveBeenCalledWith("r1", 0);
    expect(props.onReveal).toHaveBeenCalledWith("landmark:mill");
    expect(card()).toHaveTextContent("It was the mill.");
    expect(screen.getByText("Go where the bees make honey.")).toBeInTheDocument();
  });

  it("an answer while a call is in flight makes no second call", async () => {
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise(() => {}));
    const { search } = show();
    await search("landmark:mill");
    await search("landmark:well");
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
  });

  it("E while the clue is resolved does nothing: the last clue answered, its finish pending (F-18, Review Focus 5)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockReturnValue(new Promise(() => {}));
    const { search } = show({ r: { ...run, questions: [CLUE_1], responses: [null] } });
    await search("landmark:mill");
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    await search("landmark:well");
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
    expect(retryDeedQuestion).not.toHaveBeenCalled();
  });

  it("a reveal that is not an anchor is dropped (F-17): nothing is marked, nothing throws", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue({ ...MISS, answer: "It was somewhere else.", reveal: "landmark:gone" });
    const { search, props } = show();
    await search("landmark:well");
    await search("landmark:garden");
    expect(props.onReveal).not.toHaveBeenCalled();
    expect(card()).toHaveTextContent("It was somewhere else.");
    expect(screen.getByText("Go where the bees make honey.")).toBeInTheDocument();
  });

  it("the last clue resolved: the run is finished once, then handed up", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const { search, props } = show();
    await search("landmark:mill");
    expect(completeDeedRun).not.toHaveBeenCalled();
    await search("object:beehives");
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(props.onFinished).toHaveBeenCalledTimes(1);
    expect(props.onFinished).toHaveBeenCalledWith(summary);
  });

  it("a run picked back up with every answer in is finished at once", async () => {
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const { props } = show({ r: { ...run, responses: ["landmark:mill", "object:beehives"] } });
    await act(async () => {});
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(props.onFinished).toHaveBeenCalledWith(summary);
  });

  it("a rejected finish says so, and Finish the trail tries again", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(summary);
    const { search, props } = show({ r: { ...run, questions: [CLUE_1], responses: [null] } });
    await search("landmark:mill");
    expect(card()).toHaveTextContent("That didn't work.");
    expect(props.onFinished).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: TRAIL_FINISH })));
    expect(completeDeedRun).toHaveBeenCalledTimes(2);
    expect(props.onFinished).toHaveBeenCalledWith(summary);
  });

  it("two searches before a re-render send one answer and skip no clue (fix round 1)", async () => {
    const CLUE_3 = clue(3, "Go where the cart of hay waits.");
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockReturnValue(new Promise(() => {}));
    const { answerRef, search } = show({ r: { ...run, questions: [CLUE_1, CLUE_2, CLUE_3], responses: [null, null, null] } });
    await search("landmark:mill");
    // Clue 2 is on show; two E presses land in one tick, before React renders again.
    await act(async () => {
      answerRef.current?.("object:beehives");
      answerRef.current?.("landmark:well");
    });
    expect(vi.mocked(answerDeedQuestion).mock.calls).toEqual([
      ["r1", 0, "landmark:mill"],
      ["r1", 1, "object:beehives"],
    ]);
    expect(screen.getByText("Go where the cart of hay waits.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Clue 3 of 3" })).toBeInTheDocument();
    expect(completeDeedRun).not.toHaveBeenCalled();
    await search("object:hay-cart");
    expect(answerDeedQuestion).toHaveBeenLastCalledWith("r1", 2, "object:hay-cart");
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
  });

  it("Leave the trail cannot be pressed while the finish is out, so a finished run is never stranded (fix round 1)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    let settle!: (s: RunSummary) => void;
    vi.mocked(completeDeedRun).mockReturnValueOnce(new Promise((r) => (settle = r))).mockRejectedValueOnce(new Error("network"));
    const { search, props } = show({ r: { ...run, questions: [CLUE_1], responses: [null] } });
    await search("landmark:mill");
    expect(screen.getByRole("button", { name: TRAIL_LEAVE })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: TRAIL_LEAVE }));
    expect(props.onLeave).not.toHaveBeenCalled();
    await act(async () => settle(summary));
    expect(props.onFinished).toHaveBeenCalledWith(summary);
  });

  it("after a refused finish, Leave the trail is there again", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockRejectedValue(new Error("network"));
    const { search, props } = show({ r: { ...run, questions: [CLUE_1], responses: [null] } });
    await search("landmark:mill");
    expect(card()).toHaveTextContent("That didn't work.");
    fireEvent.click(screen.getByRole("button", { name: TRAIL_LEAVE }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("nothing is said while a search is out: the second-chance line is not said again (fix round 1)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockReturnValue(new Promise(() => {}));
    const { search } = show({ r: { ...run, narrateClues: true } });
    await search("landmark:well");
    await search("landmark:well");
    expect(said()).toEqual(["Go where the big wheel turns, and grain becomes flour.", "Not here. That is where water is drawn.", TRAIL_LOOKED_HERE]);
    await search("landmark:garden");
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:garden");
    expect(said()).toHaveLength(3);
  });

  it("a K walk picked back up on a second chance says the clue, then the second-chance line, as one line (fix round 1)", () => {
    show({ r: { ...run, narrateClues: true, pending: { index: 0, ruledOut: "landmark:well", hint: "That is where water is drawn." } } });
    expect(said()).toEqual(["Go where the big wheel turns, and grain becomes flour. Not here. That is where water is drawn."]);
    expect(card()).toHaveTextContent("Not here. That is where water is drawn.");
    expect(screen.getByRole("button", { name: "Show me" })).toBeInTheDocument();
  });

  it("a refused answer is said, and the clue stays", async () => {
    vi.mocked(answerDeedQuestion).mockRejectedValue(new Error("network"));
    const { search } = show();
    await search("landmark:mill");
    expect(card()).toHaveTextContent("That didn't work.");
    expect(screen.getByText("Go where the big wheel turns.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TRAIL_FINISH })).toBeNull();
  });

  it("Leave the trail hands the walk back", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: TRAIL_LEAVE }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("Hide the clue folds the card to its dots, and Show the clue opens it again", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: TRAIL_HIDE }));
    expect(screen.queryByText("Go where the big wheel turns.")).toBeNull();
    expect(screen.getByRole("img", { name: "Clue 1 of 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: TRAIL_SHOW }));
    expect(screen.getByText("Go where the big wheel turns.")).toBeInTheDocument();
  });

  it("hidden hides the card and keeps the clue it was on", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { search, rerender } = show();
    await search("landmark:mill");
    rerender({ hidden: true });
    expect(screen.queryByRole("region", { name: TRAIL_TRACKER_LABEL })).toBeNull();
    rerender({ hidden: false });
    expect(screen.getByText("Go where the bees make honey.")).toBeInTheDocument();
  });

  it("fills the answer ref while mounted, and clears it on unmount", () => {
    const { view, answerRef } = show();
    expect(answerRef.current).toBeTypeOf("function");
    view.unmount();
    expect(answerRef.current).toBeNull();
  });
});

describe("the tracker's layout (H10 smoke: larger text at 390 px, the 1280 px header, the minimap)", () => {
  const css = readFileSync(resolve(__dirname, "trail-walk.css"), "utf8");

  it("is never narrower than its one-row head, and its icon buttons take a 40 px tap (H10 re-check 3, 540 px)", () => {
    // 36vw alone left Read aloud outside a 540 px window; the floor keeps the head's row inside.
    expect(css).toMatch(/width:\s*min\(19rem,\s*max\(36vw,\s*17rem\)\)/);
    // A 1.5rem round plus a 0.5rem invisible ring each side = 2.5rem (40 px) to tap.
    expect(css).toMatch(/\.trail-walk-btn::after\s*\{[^}]*inset:\s*-0\.5rem/);
    // The rings never overlap: the second button sits a further 0.5rem off (1rem gap in all).
    expect(css).toMatch(/\.trail-walk-btn \+ \.trail-walk-btn\s*\{\s*margin-left:\s*0\.5rem/);
  });
  /** The body of the `@media (max-width: 480px)` block. */
  const phone = (() => {
    const start = css.indexOf("@media (max-width: 480px)");
    if (start === -1) return "";
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
    }
    return "";
  })();
  const rule = (block: string, selector: string) => new RegExp(`(?:^|[\\n{}])\\s*${selector.replace(/[.[\]="()>:-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? "";
  const walking = ".r3-left-stack:has(> .trail-walk:not([hidden]))";
  const larger = '.r3-root[data-larger-text="on"]';

  it("at larger text on a phone, is as wide as the screen less its gutters once zoomed, never wider", () => {
    // Zoom 1.2 scales the width too, so the unzoomed width is the gutters' share divided by 1.2.
    expect(rule(css, `${larger} .trail-walk`)).toMatch(/zoom:\s*1\.2/);
    expect(rule(phone, ".trail-walk")).toMatch(/width:\s*calc\(100vw - 32px\)/);
    expect(rule(phone, `${larger} .trail-walk`)).toMatch(/width:\s*calc\(\(100vw - 2\.2rem\) \/ 1\.2\)/);
  });

  it("never squeezes a word onto two lines: the head is one row that never wraps, the foot's buttons wrap whole", () => {
    expect(rule(css, ".trail-walk-head")).toMatch(/flex-wrap:\s*nowrap/);
    expect(rule(css, ".trail-walk-foot")).toMatch(/flex-wrap:\s*wrap/);
    for (const sel of [".trail-walk-count", ".trail-walk-foot .r3-link-button"]) {
      expect(rule(css, sel), sel).toMatch(/white-space:\s*nowrap/);
    }
    expect(rule(css, ".trail-walk-count")).toMatch(/flex:\s*none/);
    // The head's two buttons are compact icons, sized past `.r3-round.r3-read`'s own 2.6rem.
    expect(rule(css, ".trail-walk-head .r3-round.trail-walk-btn")).toMatch(/width:\s*1\.5rem;[^}]*height:\s*1\.5rem/);
  });

  it("keeps about three lines of clue in view, whatever the cap: the clue area has a floor, tighter under larger text", () => {
    expect(rule(css, ".trail-walk-text")).toMatch(/line-height:\s*1\.35/);
    expect(rule(css, ".trail-walk-body")).toMatch(/min-height:\s*calc\(3 \* 1\.35 \* 1\.05rem\)/);
    expect(rule(css, `${larger} .trail-walk-text`)).toMatch(/line-height:\s*1\.25/);
    expect(rule(css, `${larger} .trail-walk-body`)).toMatch(/min-height:\s*calc\(3 \* 1\.25 \* 1\.05rem\)/);
    // Larger text trims the card's own padding and the gaps round the body.
    expect(rule(css, `${larger} .trail-walk`)).toMatch(/padding:\s*0\.3rem 0\.6rem 0\.35rem/);
  });

  it("on a short screen, puts the clue first in the body, so a miss line scrolls under it", () => {
    const start = css.indexOf("@media (max-height: 720px)");
    expect(start).toBeGreaterThan(-1);
    expect(rule(css.slice(start), ".trail-walk-text")).toMatch(/order:\s*-1/);
  });

  // Everything outside the phone block: the rules that hold at every size.
  const everywhere = css.replace(phone, "");

  it("on a phone, sits under the minimap while a walk is shown, and the column stops above the E prompt", () => {
    // The minimap is 12.5rem at 1rem from the top (`.r3-map`): the column starts below its foot. The
    // column is not zoomed, so its cap is in real rems: 15rem clears the E prompt, 18rem its zoomed self.
    expect(rule(phone, walking)).toMatch(/top:\s*14rem/);
    expect(rule(phone, walking)).toMatch(/max-height:\s*calc\(100% - 14rem - 15rem\)/);
    expect(rule(phone, `${larger} ${walking}`)).toMatch(/top:\s*14rem/);
    expect(rule(phone, `${larger} ${walking}`)).toMatch(/max-height:\s*calc\(100% - 14rem - 18rem\)/);
  });

  it("rests the objective card during any walk, at every size, and caps the column above the E prompt and the spell bar", () => {
    expect(rule(everywhere, `${walking} > .r3-quest`)).toMatch(/display:\s*none/);
    expect(rule(phone, `${walking} > .r3-quest`)).toBe("");
    expect(rule(everywhere, walking)).toMatch(/max-height:\s*calc\(100% - 5\.6rem - 15rem\)/);
    expect(rule(everywhere, walking)).toMatch(/overflow:\s*hidden/);
    expect(rule(everywhere, `${larger} ${walking}`)).toMatch(/max-height:\s*calc\(100% - 6\.72rem - 18rem\)/);
  });

  it("keeps its head and foot in reach: a flex column whose body scrolls, capped in its own (zoomed) units", () => {
    expect(rule(everywhere, ".trail-walk")).toMatch(/display:\s*flex/);
    expect(rule(everywhere, ".trail-walk")).toMatch(/flex-direction:\s*column/);
    expect(rule(everywhere, ".trail-walk")).toMatch(/min-height:\s*0/);
    expect(rule(everywhere, ".trail-walk")).toMatch(/max-height:\s*calc\(100dvh - 5\.6rem - 15rem\)/);
    // Zoomed 1.2, every length is drawn 1.2 times over: the cap is the room left, over 1.2.
    expect(rule(everywhere, `${larger} .trail-walk`)).toMatch(/max-height:\s*calc\(\(100dvh - 6\.72rem - 18rem\) \/ 1\.2\)/);
    expect(rule(phone, ".trail-walk")).toMatch(/max-height:\s*calc\(100dvh - 14rem - 15rem\)/);
    expect(rule(phone, `${larger} .trail-walk`)).toMatch(/max-height:\s*calc\(\(100dvh - 14rem - 18rem\) \/ 1\.2\)/);
    expect(rule(everywhere, ".trail-walk-head")).toMatch(/flex:\s*none/);
    expect(rule(everywhere, ".trail-walk-foot")).toMatch(/flex:\s*none/);
    expect(rule(everywhere, ".trail-walk-body")).toMatch(/overflow-y:\s*auto/);
  });

  it("renders the parts those rules hold: the head holds Hide and Read aloud, and the foot sits outside the scrolling body", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { view, search } = show();
    await search("landmark:well");
    const card = view.container.querySelector(".trail-walk")!;
    // The tracker is the column's direct child in the frame (`realm-game.tsx`), which `:has(> .trail-walk)` reads.
    expect(card.querySelector(".trail-walk-head .trail-walk-count, .trail-walk-head .r3-run-dots")).not.toBeNull();
    // The head's compact icon buttons keep their words as their names, and as their titles.
    const fold = screen.getByRole("button", { name: TRAIL_HIDE });
    const read = screen.getByRole("button", { name: TRAIL_READ_ALOUD });
    for (const [b, words] of [[fold, TRAIL_HIDE], [read, TRAIL_READ_ALOUD]] as const) {
      expect(card.querySelector(".trail-walk-head")!.contains(b)).toBe(true);
      expect(b).toHaveClass("r3-round", "trail-walk-btn");
      expect(b).toHaveAttribute("title", words);
      expect(b.querySelector("svg, [aria-hidden='true']")).not.toBeNull();
    }
    fireEvent.click(fold);
    expect(screen.getByRole("button", { name: TRAIL_SHOW })).toHaveAttribute("title", TRAIL_SHOW);
    fireEvent.click(screen.getByRole("button", { name: TRAIL_SHOW }));
    const foot = card.querySelector(":scope > .trail-walk-foot")!;
    expect(foot).not.toBeNull();
    expect(card.querySelector(".trail-walk-body .trail-walk-foot")).toBeNull();
    expect(foot.querySelector(".r3-link-button.trail-walk-leave")).not.toBeNull();
    expect(foot).toHaveTextContent("Show me");
  });
});
