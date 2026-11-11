import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeedFlow } from "./use-deed-flow";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { NUDGE_LINE } from "@/lib/tasks/pace-guard";
import { hintFor } from "@/lib/utils/skill-hints";

const answerDeedQuestion = vi.fn();
const retryDeedQuestion = vi.fn();
const resolveDeedQuestion = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: (...a: unknown[]) => answerDeedQuestion(...a),
  retryDeedQuestion: (...a: unknown[]) => retryDeedQuestion(...a),
  resolveDeedQuestion: (...a: unknown[]) => resolveDeedQuestion(...a),
}));

const q = (id: string) => ({ kind: "choice" as const, id, skillId: "s", prompt: id, view: { choices: ["a", "b", "c", "d"] } });
const run: RunStart = {
  runId: "r1", deed: { id: "d", title: "D", story: "S", area: "math" },
  questions: [q("1"), q("2")], responses: [null, null], kind: "deed", pending: null,
};
const meter = { skillLabel: "Addition", filled: 4, needed: 7 };

beforeEach(() => vi.clearAllMocks());

describe("useDeedFlow", () => {
  it("a stale choose during a second chance retries, never sends a second first answer", async () => {
    answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: true, hint: "Count.", firstPick: "b" });
    retryDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "a" });
    const { result } = renderHook(() => useDeedFlow(run));
    const stale = result.current.choose; // closed over the "asking" phase
    await act(() => stale("b"));
    await act(() => stale("a"));
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "a");
    expect(result.current.flow).toMatchObject({ phase: "resolved", ruledOut: ["b"] });
  });

  it("a first answer on a mastered skill (no meter) clears the last skill's pips", async () => {
    answerDeedQuestion
      .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "a", meter })
      .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "a", meter: null });
    const { result } = renderHook(() => useDeedFlow(run));
    await act(() => result.current.choose("a"));
    expect(result.current.meter).toEqual(meter);
    act(() => result.current.next());
    await act(() => result.current.choose("a"));
    expect(result.current.meter).toBeNull();
  });

  it("a retry brings no meter and keeps the one the first answer set", async () => {
    answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: true, hint: "Count.", firstPick: "b", meter });
    retryDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "a" });
    const { result } = renderHook(() => useDeedFlow(run));
    await act(() => result.current.choose("b"));
    await act(() => result.current.choose("a"));
    expect(result.current.meter).toEqual(meter);
  });

  it("says an answer the server hid the reason for as one friendly line, and our own refusals as they are", async () => {
    answerDeedQuestion.mockRejectedValueOnce(new Error("An error occurred in the Server Components render."));
    const { result } = renderHook(() => useDeedFlow(run));
    await act(() => result.current.choose("a"));
    expect(result.current.error).toBe("That didn't work.");
    answerDeedQuestion.mockRejectedValueOnce(new Error("That question has already been answered."));
    await act(() => result.current.choose("a"));
    expect(result.current.error).toBe("That question has already been answered.");
  });

  describe("pace guard", () => {
    const five: RunStart = { ...run, questions: [q("1"), q("2"), q("3"), q("4"), q("5")], responses: [null, null, null, null, null] };
    const wrong = { correct: false, secondChance: false, answer: "a" };
    const right = { correct: true, secondChance: false, answer: "a" };

    /** A hook on a clock the test moves by hand. */
    function clocked() {
      let t = 0;
      const hook = renderHook(() => useDeedFlow(five, undefined, () => t));
      return { hook, at: (ms: number) => (t = ms) };
    }
    async function guess(h: ReturnType<typeof clocked>, ms: number, result: object) {
      answerDeedQuestion.mockResolvedValueOnce(result);
      h.at(ms);
      await act(() => h.hook.result.current.choose("b"));
      act(() => h.hook.result.current.next());
    }

    it("nudges after the third fast miss, with a clue for that skill, and clears on the next correct first answer", async () => {
      const h = clocked();
      expect(h.hook.result.current.nudge).toBeNull();
      await guess(h, 0, wrong);
      await guess(h, 3000, wrong);
      expect(h.hook.result.current.nudge).toBeNull();
      answerDeedQuestion.mockResolvedValueOnce(wrong);
      h.at(6000);
      await act(() => h.hook.result.current.choose("b"));
      expect(h.hook.result.current.nudge).toEqual({ line: NUDGE_LINE, hint: hintFor("s") });
      act(() => h.hook.result.current.next());
      answerDeedQuestion.mockResolvedValueOnce(right);
      await act(() => h.hook.result.current.choose("a"));
      expect(h.hook.result.current.nudge).toBeNull();
    });

    it("does not nudge when the misses are slow", async () => {
      const h = clocked();
      await guess(h, 0, wrong);
      await guess(h, 6000, wrong);
      answerDeedQuestion.mockResolvedValueOnce(wrong);
      h.at(12_000);
      await act(() => h.hook.result.current.choose("b"));
      expect(h.hook.result.current.nudge).toBeNull();
    });

    it("counts first answers only: a retry is a second chance, not a guess", async () => {
      const h = clocked();
      await guess(h, 0, wrong);
      answerDeedQuestion.mockResolvedValueOnce({ correct: false, secondChance: true, hint: "Count.", firstPick: "b" });
      retryDeedQuestion.mockResolvedValueOnce({ correct: false, secondChance: false, answer: "a" });
      h.at(1000);
      await act(() => h.hook.result.current.choose("b"));
      h.at(2000);
      await act(() => h.hook.result.current.choose("c"));
      expect(h.hook.result.current.nudge).toBeNull();
    });

    it("starts the count over after a nudge, so one burst nudges once", async () => {
      const h = clocked();
      await guess(h, 0, wrong);
      await guess(h, 1000, wrong);
      answerDeedQuestion.mockResolvedValueOnce(wrong);
      h.at(2000);
      await act(() => h.hook.result.current.choose("b"));
      expect(h.hook.result.current.nudge).not.toBeNull();
      act(() => h.hook.result.current.next());
      // The misses before the nudge are spent; one more miss leaves it as it was, up until a right first answer.
      answerDeedQuestion.mockResolvedValueOnce(wrong);
      h.at(3000);
      await act(() => h.hook.result.current.choose("b"));
      expect(h.hook.result.current.nudge).toEqual({ line: NUDGE_LINE, hint: hintFor("s") });
    });

    it("takes the nudge down when the run's last question is resolved", async () => {
      const h = clocked();
      await guess(h, 0, wrong);
      await guess(h, 1000, wrong);
      await guess(h, 2000, wrong);
      await guess(h, 20_000, wrong); // a slow miss on the fourth question; the nudge stays up
      expect(h.hook.result.current.nudge).not.toBeNull();
      answerDeedQuestion.mockResolvedValueOnce(wrong);
      h.at(40_000);
      await act(() => h.hook.result.current.choose("b")); // the fifth and last question
      expect(h.hook.result.current.flow).toMatchObject({ index: 4, phase: "resolved" });
      expect(h.hook.result.current.nudge).toBeNull();
    });

    it("while it is up, the clue is for the question on the board now", async () => {
      const skills = ["add-10", "sub-10", "mul-facts", "frac-unit", "place-value"];
      const mixed: RunStart = { ...five, questions: skills.map((skillId, i) => ({ ...q(String(i + 1)), skillId })) };
      let t = 0;
      const { result } = renderHook(() => useDeedFlow(mixed, undefined, () => t));
      for (const ms of [0, 1000, 2000]) {
        answerDeedQuestion.mockResolvedValueOnce(wrong);
        t = ms;
        await act(() => result.current.choose("b"));
        if (ms < 2000) act(() => result.current.next());
      }
      expect(result.current.nudge).toEqual({ line: NUDGE_LINE, hint: hintFor("mul-facts") });
      act(() => result.current.next());
      expect(result.current.nudge).toEqual({ line: NUDGE_LINE, hint: hintFor("frac-unit") });
      expect(hintFor("frac-unit")).not.toBe(hintFor("mul-facts"));
    });

    it("reads the browser clock by default, and never sends a time to the server", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(123);
      try {
        answerDeedQuestion.mockResolvedValueOnce(wrong);
        const { result } = renderHook(() => useDeedFlow(five));
        await act(() => result.current.choose("b"));
        expect(clock).toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
      expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "b");
    });
  });
});
