import { describe, expect, it } from "vitest";
import { refuseRetry } from "@/lib/utils/deed-attempts";
import { PICK_SHOWN } from "@/lib/utils/deed-refusals";
import { RUNE, RUNE_HINT, runeStub } from "@/test/rune-stubs";
import { RUNE_MAX_CHARS, RUNE_MAX_TILES, TASK_CODECS } from "./codecs";
import { TASK_DRAWERS } from "./draw";
import { HANDS_ON_KINDS } from "./kinds";
import { TASK_KINDS, isTaskCorrect, taskDefOf, toClientTask } from "./registry";
import { runeKind } from "./rune";
import { __setRunePoolsForTest } from "./runes";
import { RUNE_POOL_FILES } from "./runes/rune-pool-files";
import { hasSpelledRun } from "./rune-tiles";
import type { RuneTask } from "./types";
import { seededRng } from "@/lib/utils/drill-generators";
import { findSkill } from "@/lib/utils/skills";
import { cloneRunePool } from "@/test/rune-pool-fixture";

/** Every forged cast Review Focus 2 names, and a few more. */
const FORGED: readonly unknown[] = [
  "r:0,0", "r:99", "r:6", "r:", "r:1,", " r:1", "r:1 ", "R:1", "r:01", "r:-1", "r:1.0", "r:1,,2", "r:1;2",
  "toString", "__proto__", "constructor", 42, 1, {}, [0, 1], [], null, undefined, true, "",
  "r:" + "1,".repeat(5_000), "x".repeat(10_000),
];

describe("the rune kind (R-I5)", () => {
  it("is the registered definition for a rune task, and a hands-on kind", () => {
    expect(TASK_KINDS.rune).toBe(runeKind);
    expect(taskDefOf(RUNE)).toBe(runeKind);
    expect(HANDS_ON_KINDS).toContain("rune");
  });

  it("never shows the word (the leak rule, R-I17)", () => {
    const client = toClientTask(runeStub());
    expect(client).toEqual({
      kind: "rune", id: RUNE.id, skillId: RUNE.skillId, prompt: RUNE.prompt, readAloud: RUNE.readAloud,
      view: { effect: "mend", object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: ["d", "m", "a", "e", "n", "i"], listen: true },
    });
    // The dictation is the one place the word may be (R-I18); everywhere else it is not. The effect is
    // the question (what the object needs), not the answer, and here it happens to read as the word,
    // so it is taken out before the scan; the content's own rule keeps the two apart from g45 up.
    const json = JSON.stringify({ ...client, readAloud: undefined }).toLowerCase().replace('"effect":"mend"', "");
    for (const secret of ["mend", "mend-wagon", "rune-k1", RUNE_HINT.toLowerCase(), RUNE.explain!.toLowerCase(), '"words"', '"entry"', '"hint"', '"explain"']) {
      expect(json, secret).not.toContain(secret);
    }
    // The stub's own tray is clean: no run of adjacent tiles spells the word.
    expect(hasSpelledRun(RUNE.tiles, RUNE.words)).toBe(false);
  });

  it("a meaning (g45 up) sends no accepted word in any field, readAloud included (R-I17)", () => {
    const meaning = runeStub({
      id: "vocab-g68:rune:7a2b9c01", skillId: "vocab-g68", listen: false,
      prompt: "To bring something back to how it was.", readAloud: "To bring something back to how it was.",
      tiles: ["st", "ed", "ore", "un", "re", "ing"], words: ["restore"], hint: "It starts with again.", entry: "rune-g68/restore-wagon",
    });
    const json = JSON.stringify(toClientTask(meaning)).toLowerCase();
    for (const secret of ["restore", "restore-wagon", "rune-g68", "it starts with again", '"words"', '"entry"', '"hint"', '"explain"']) {
      expect(json, secret).not.toContain(secret);
    }
    expect(toClientTask(meaning).view).toEqual({ effect: "mend", object: RUNE.object, tiles: ["st", "ed", "ore", "un", "re", "ing"], listen: false });
    expect(runeKind.isCorrect(meaning, [4, 0, 2])).toBe(true);
  });

  it("builds its view field by field, so a stray field on a stored task cannot ride along", () => {
    const stray = {
      ...RUNE,
      object: { id: "rune:west-wagon", label: "the broken wagon", word: "mend" },
      view: { words: ["mend"] }, why: "mend", answer: "mend",
    } as unknown as RuneTask;
    const view = runeKind.toView(stray);
    expect(view).toEqual({ effect: "mend", object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: RUNE.tiles, listen: true });
    expect(JSON.stringify({ ...toClientTask(stray), readAloud: undefined }).toLowerCase().replace('"effect":"mend"', "")).not.toContain("mend");
    // The tray is a copy: a presenter that reorders it never touches the stored task.
    expect(view.tiles).not.toBe(stray.tiles);
  });

  it("shows no object for a task drawn outside a run, and a meaning is not a dictation", () => {
    expect(runeKind.toView(runeStub({ object: null, listen: false }))).toEqual({ effect: "mend", object: null, tiles: RUNE.tiles, listen: false });
  });

  it("refuses every forged cast (Review Focus 2)", () => {
    for (const raw of FORGED) {
      expect(runeKind.parseResponse(raw, RUNE), String(raw).slice(0, 30)).toBeNull();
    }
    expect(runeKind.parseResponse("r:1,3,4,0", RUNE)).toEqual([1, 3, 4, 0]);
    expect(runeKind.parseResponse("r:5", RUNE)).toEqual([5]);
  });

  it("refuses a forged cast on the retry path too, before anything is written", () => {
    const open = { first: "r:0,3,4,1", second: null };
    for (const raw of FORGED) expect(refuseRetry(RUNE, open, true, raw), String(raw).slice(0, 30)).toBe(PICK_SHOWN);
    expect(refuseRetry(RUNE, open, true, "r:1,3,4,0")).toBeNull();
  });

  it("caps a cast at its limits", () => {
    expect(RUNE_MAX_CHARS).toBe(64);
    expect(RUNE_MAX_TILES).toBe(16);
    const tray = Array.from({ length: 20 }, (_, i) => String.fromCharCode(97 + i));
    const big = runeStub({ tiles: tray });
    const sixteen = "r:" + Array.from({ length: 16 }, (_, i) => i).join(",");
    expect(runeKind.parseResponse(sixteen, big)).toHaveLength(16);
    expect(runeKind.parseResponse(sixteen + ",16", big)).toBeNull();
  });

  it("right and wrong", () => {
    expect(runeKind.isCorrect(RUNE, [1, 3, 4, 0])).toBe(true);
    expect(runeKind.feedback(RUNE, [1, 3, 4, 0])).toBe("none");
    expect(runeKind.isCorrect(RUNE, [0, 3, 4, 1])).toBe(false);
    expect(runeKind.feedback(RUNE, [0, 3, 4, 1])).toBe("wrong_word");
    expect(runeKind.allowsSecondChance(RUNE)).toBe(true);
    expect(isTaskCorrect(RUNE, "r:1,3,4,0")).toBe(true);
    expect(isTaskCorrect(RUNE, "r:0,3,4,1")).toBe(false);
  });

  it("any accepted word counts, however it is tiled", () => {
    const t = runeStub({ words: ["mend", "fix"], tiles: ["d", "f", "m", "x", "e", "i", "n", "e"] });
    expect(runeKind.isCorrect(t, [1, 5, 3])).toBe(true);
    // Either e builds "mend".
    expect(runeKind.isCorrect(t, [2, 4, 6, 0])).toBe(true);
    expect(runeKind.isCorrect(t, [2, 7, 6, 0])).toBe(true);
    expect(runeKind.isCorrect(t, [1, 5])).toBe(false);
  });

  it("the second chance is the hint, and the miss says the word", () => {
    expect(runeKind.retryLine!(RUNE, [0])).toBe("It rhymes with send.");
    expect(runeKind.answerText(RUNE)).toBe("The word was mend.");
    expect(runeKind.reveal!(RUNE)).toBe("r:1,3,4,0");
  });

  it("reveals the first accepted word that tiles", () => {
    expect(runeKind.reveal!(runeStub({ words: ["fix", "mend"] }))).toBe("r:1,3,4,0");
  });

  it("a stored task whose words no longer tile still grades, never throws (Review Focus 4)", () => {
    const t = runeStub({ tiles: ["x", "y", "z"] });
    expect(isTaskCorrect(t, "r:0")).toBe(false);
    expect(runeKind.reveal!(t)).toBe("");
    expect(runeKind.answerText(t)).toBe("The word was mend.");
  });

  it("a stored response out of the tray's range grades wrong, never throws", () => {
    const t = runeStub({ tiles: ["m", "e", "nd"] });
    expect(isTaskCorrect(t, "r:0,1,2")).toBe(true);
    expect(isTaskCorrect(t, "r:0,1,2,9")).toBe(false);
    for (const s of ["", "r:", "toString", "r:0,0"]) expect(isTaskCorrect(t, s), s).toBe(false);
  });

  it("a malformed stored task grades wrong and reveals nothing, never throws", () => {
    const broken = { ...RUNE, tiles: "dmaeni", words: "mend" } as unknown as RuneTask;
    expect(runeKind.parseResponse("r:1,3,4,0", broken)).toBeNull();
    expect(isTaskCorrect(broken, "r:1,3,4,0")).toBe(false);
    expect(runeKind.reveal!(broken)).toBe("");
  });

  it("presents a skill only while a pool credits it, and draws only then (F-7, RI-a / S10)", () => {
    // With no pool loaded nothing is presented, and nothing is drawn.
    __setRunePoolsForTest([]);
    expect(runeKind.presents("spell-g23")).toBe(false);
    expect(runeKind.presents("lang-gk")).toBe(false);
    expect(TASK_DRAWERS.rune(findSkill("spell-g23")!, 1, seededRng(1))).toBeNull();
    // A pool credits its band's skills and no others.
    __setRunePoolsForTest([cloneRunePool("g23")]);
    expect(runeKind.presents("spell-g23")).toBe(true);
    expect(runeKind.presents("lang-g3")).toBe(true);
    expect(runeKind.presents("lang-gk")).toBe(false);
    expect(TASK_DRAWERS.rune(findSkill("spell-g23")!, 1, seededRng(1))).toMatchObject({ kind: "rune", skillId: "spell-g23" });
    // null restores the pools that ship (I5): a skill is presented exactly when one of them credits it.
    __setRunePoolsForTest(null);
    const ships = (id: string): boolean => RUNE_POOL_FILES.some((f) => (f as { skillIds: string[] }).skillIds.includes(id));
    expect(runeKind.presents("spell-g23")).toBe(ships("spell-g23"));
    expect(runeKind.presents("lang-gk")).toBe(ships("lang-gk"));
  });
});

describe("the rune codec", () => {
  const c = TASK_CODECS.rune;

  it("writes the tile indices placed, in order, and reads back only that form", () => {
    expect(c.encode([3, 0, 5])).toBe("r:3,0,5");
    expect(c.decode("r:3,0,5")).toEqual([3, 0, 5]);
    expect(c.decode("r:0")).toEqual([0]);
    expect(c.decode("r:15,0")).toEqual([15, 0]);
  });

  it("round-trips and is idempotent", () => {
    for (const r of [[0], [1, 3, 4, 0], [15, 14, 2], Array.from({ length: 16 }, (_, i) => 15 - i)]) {
      const s = c.encode(r);
      expect(c.decode(s)).toEqual(r);
      expect(c.encode(c.decode(s)!)).toBe(s);
    }
  });

  it("reads nothing but the one form", () => {
    for (const s of ["r:01", "r:0,0", "r:", "r:1,", "r:100", " r:1", "r:1 ", "a:1", "1,2", "", "r:" + Array.from({ length: 17 }, (_, i) => i).join(",")]) {
      expect(c.decode(s), s).toBeNull();
    }
    expect(c.decode(42 as unknown as string)).toBeNull();
  });

  it("compares by encoding", () => {
    expect(c.sameResponse([1, 3], [1, 3])).toBe(true);
    expect(c.sameResponse([1, 3], [3, 1])).toBe(false);
  });

  it("the definition delegates to it (no second copy)", () => {
    expect(runeKind.encode).toBe(c.encode);
    expect(runeKind.decode).toBe(c.decode);
    expect(runeKind.sameResponse).toBe(c.sameResponse);
  });
});
