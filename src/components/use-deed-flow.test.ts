import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeedFlow } from "./use-deed-flow";
import type { RunStart } from "@/lib/utils/deed-run-types";

const answerDeedQuestion = vi.fn();
const retryDeedQuestion = vi.fn();
const resolveDeedQuestion = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: (...a: unknown[]) => answerDeedQuestion(...a),
  retryDeedQuestion: (...a: unknown[]) => retryDeedQuestion(...a),
  resolveDeedQuestion: (...a: unknown[]) => resolveDeedQuestion(...a),
}));

const q = (id: string) => ({ id, skillId: "s", prompt: id, choices: ["a", "b", "c", "d"] });
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
});
