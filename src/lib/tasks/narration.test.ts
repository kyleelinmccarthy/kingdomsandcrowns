import { describe, expect, it } from "vitest";
import type { ClientTask } from "./types";
import { attemptSpeech, autoSpeaks, listens } from "./narration";

const trail: ClientTask = { kind: "trail", id: "read-g1:trail:0a1b2c3d", skillId: "read-g1", prompt: "Go to the mill.", view: {} };
const choice: ClientTask = { kind: "choice", id: "q", skillId: "add", prompt: "2 + 3?", view: { choices: ["4", "5"] } };
const lock: ClientTask = { kind: "lock", id: "l", skillId: "logic-k1", prompt: "p", view: { puzzle: "balance", weights: [1], target: 1 } };
const runeView = { effect: "mend" as const, object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: ["d", "m", "a", "e", "n", "i"] };
const dictation: ClientTask = { kind: "rune", id: "lang-gk:rune:4e1f0a9c", skillId: "lang-gk", prompt: "The wagon is broken. Build the word you hear.", view: { ...runeView, listen: true } };
const meaning: ClientTask = { kind: "rune", id: "vocab-g68:rune:0b1c2d3e", skillId: "vocab-g68", prompt: "To make something whole again.", view: { ...runeView, listen: false } };

describe("autoSpeaks: when a player speaks by itself (R-H17)", () => {
  it("a K clue is spoken with read-aloud off", () => {
    expect(autoSpeaks(trail, false, true)).toBe(true);
  });

  it("a grade-1 clue is not, with read-aloud off", () => {
    expect(autoSpeaks(trail, false, false)).toBe(false);
  });

  it("narrated clues never make another kind speak", () => {
    expect(autoSpeaks(choice, false, true)).toBe(false);
    expect(autoSpeaks(lock, false, true)).toBe(false);
  });

  it("read-aloud speaks every kind, as before", () => {
    expect(autoSpeaks(choice, true, false)).toBe(true);
    expect(autoSpeaks(trail, true, false)).toBe(true);
  });
});

describe("listens: a dictation is always spoken (R-I18)", () => {
  it("a dictation speaks with read-aloud off, and without narrated clues", () => {
    expect(autoSpeaks({ kind: "rune", view: { listen: true } }, false, false)).toBe(true);
    expect(autoSpeaks(dictation, false, false)).toBe(true);
    expect(listens(dictation)).toBe(true);
  });

  it("a meaning speaks only with read-aloud on, and narrated clues never make it speak", () => {
    expect(autoSpeaks({ kind: "rune", view: { listen: false } }, false, false)).toBe(false);
    expect(autoSpeaks(meaning, false, true)).toBe(false);
    expect(autoSpeaks({ kind: "rune", view: { listen: false } }, true, false)).toBe(true);
    expect(listens(meaning)).toBe(false);
  });

  it("only a rune's own listen mark counts", () => {
    expect(listens({ kind: "trail" })).toBe(false);
    expect(listens({ kind: "trail", view: { listen: true } })).toBe(false);
    expect(listens(choice)).toBe(false);
    expect(listens({ kind: "rune" })).toBe(false);
    expect(listens({ kind: "rune", view: null })).toBe(false);
    expect(listens({ kind: "rune", view: { listen: "yes" } })).toBe(false);
    expect(autoSpeaks(trail, false, false)).toBe(false);
  });
});

describe("attemptSpeech: the line a player says after an answer (F-3)", () => {
  const open = { phase: "second-chance" as const, result: { correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place" as const } };
  const miss = { phase: "resolved" as const, result: { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" } };
  const right = { phase: "resolved" as const, result: { correct: true, secondChance: false } };

  it("a trail's second chance says the whole line, its lead and the redirect", () => {
    expect(attemptSpeech(trail, open, "Not here. That is where water is drawn.")).toBe("Not here. That is where water is drawn.");
  });

  it("a trail's miss says where it was and why", () => {
    expect(attemptSpeech(trail, miss, "It was the mill. Flour is ground at the mill.")).toBe("It was the mill. Flour is ground at the mill.");
  });

  it("a trail says nothing more after a right search, or while it is asked", () => {
    expect(attemptSpeech(trail, right, "That's it!")).toBeUndefined();
    expect(attemptSpeech(trail, { phase: "asking", result: null }, undefined)).toBeUndefined();
  });

  it("every other kind is unchanged: its hint alone on a second chance, and nothing on a miss", () => {
    const hinted = { phase: "second-chance" as const, result: { correct: false, secondChance: true, hint: "Count on." } };
    expect(attemptSpeech(choice, hinted, "Not quite. Count on.")).toBe("Count on.");
    expect(attemptSpeech(lock, hinted, "Not quite. Count on.")).toBe("Count on.");
    expect(attemptSpeech(choice, { phase: "resolved", result: { correct: false, secondChance: false, answer: "5" } }, "The answer was 5.")).toBeUndefined();
    expect(attemptSpeech(choice, { phase: "second-chance", result: { correct: false, secondChance: true } }, "Not quite.")).toBeUndefined();
  });

  it("a rune says its whole line on a second chance, and the word and why after a miss (F-3)", () => {
    const tried = { phase: "second-chance" as const, result: { correct: false, secondChance: true, hint: "It rhymes with send.", feedback: "wrong_word" as const } };
    expect(attemptSpeech(dictation, tried, "Not that word. It rhymes with send.")).toBe("Not that word. It rhymes with send.");
    const missed = { phase: "resolved" as const, result: { correct: false, secondChance: false, answer: "The word was mend.", reveal: "r:1,3,4,0" } };
    expect(attemptSpeech(meaning, missed, "The word was mend. Mend means to make whole.")).toBe("The word was mend. Mend means to make whole.");
    expect(attemptSpeech(dictation, right, "That's it!")).toBeUndefined();
  });

  it("nothing without a task", () => {
    expect(attemptSpeech(undefined, open, "Not here.")).toBeUndefined();
  });
});
