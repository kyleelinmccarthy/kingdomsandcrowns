import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { findSkill } from "@/lib/utils/skills";
import { cloneTrailPool } from "@/test/trail-pool-fixture";
import { TRAIL, TRAIL_REDIRECT, WELL_REDIRECT } from "@/test/trail-stubs";
import { TRAIL_MAX_CHARS, TASK_CODECS } from "./codecs";
import { TASK_DRAWERS, runDrawerFor } from "./draw";
import { TASK_KINDS, isTaskCorrect, taskDefOf, toClientTask } from "./registry";
import { trailKind } from "./trail";
import { __setTrailPoolsForTest } from "./trails";
import { TRAIL_POOL_FILES } from "./trails/trail-pool-files";
import { TRAIL_RETRY_LEAD, TRAIL_UNKNOWN_ANSWER, trailAnswerText } from "./trail-copy";
import type { TrailTask } from "./types";

describe("the trail kind (R-H5)", () => {
  it("is the registered definition for a trail task", () => {
    expect(TASK_KINDS.trail).toBe(trailKind);
    expect(taskDefOf(TRAIL)).toBe(trailKind);
  });

  it("never shows the answer (the leak rule)", () => {
    const client = toClientTask(TRAIL);
    expect(client).toEqual({ kind: "trail", id: TRAIL.id, skillId: TRAIL.skillId, prompt: TRAIL.prompt, readAloud: TRAIL.readAloud, view: {} });
    const json = JSON.stringify(client);
    for (const secret of ["landmark:mill", "mill-walk", "trail-k1", "the mill", TRAIL_REDIRECT, WELL_REDIRECT, TRAIL.explain!, '"answer"', '"redirect', '"trail":', '"explain"']) {
      expect(json, secret).not.toContain(secret);
    }
  });

  it("builds its view from nothing, so a stray field on a stored task cannot ride along", () => {
    const stray = { ...TRAIL, view: { answer: "landmark:mill" }, why: "mill" } as unknown as TrailTask;
    expect(trailKind.toView(stray)).toEqual({});
    expect(JSON.stringify(toClientTask(stray))).not.toContain("mill");
  });

  it("refuses every forged response (Review Focus 2)", () => {
    for (const raw of ["landmark:longwater", "toString", "__proto__", "constructor", " landmark:mill", "landmark:mill ", "LANDMARK:MILL", 42, {}, [], null, undefined, "", "x".repeat(10_000)]) {
      expect(trailKind.parseResponse(raw, TRAIL), String(raw).slice(0, 30)).toBeNull();
    }
    expect(trailKind.parseResponse("landmark:well", TRAIL)).toBe("landmark:well");
    expect(trailKind.parseResponse("object:hay-cart", TRAIL)).toBe("object:hay-cart");
  });

  it("accepts any anchor, not only the answer, so a pick never tells which is right (R-H6)", () => {
    expect(trailKind.parseResponse("landmark:mill", TRAIL)).toBe("landmark:mill");
    expect(trailKind.parseResponse("object:beehives", TRAIL)).toBe("object:beehives");
  });

  it("right and wrong", () => {
    expect(trailKind.isCorrect(TRAIL, "landmark:mill")).toBe(true);
    expect(trailKind.isCorrect(TRAIL, "landmark:well")).toBe(false);
    expect(trailKind.feedback(TRAIL, "landmark:well")).toBe("wrong_place");
    expect(trailKind.feedback(TRAIL, "landmark:mill")).toBe("none");
    expect(trailKind.allowsSecondChance(TRAIL)).toBe(true);
  });

  it("the redirect is the chosen place's (R-H1)", () => {
    expect(trailKind.retryLine!(TRAIL, "landmark:well")).toBe(WELL_REDIRECT);
    expect(trailKind.retryLine!(TRAIL, "landmark:garden")).toBe(TRAIL_REDIRECT);
    expect(trailKind.retryLine!({ ...TRAIL, redirects: undefined }, "landmark:well")).toBe(TRAIL_REDIRECT);
  });

  it("the miss says where it was", () => {
    expect(trailKind.answerText(TRAIL)).toBe("It was the mill.");
    expect(trailAnswerText("the mill")).toBe("It was the mill.");
    expect(trailKind.reveal!(TRAIL)).toBe("landmark:mill");
  });

  it("a stored answer that is no longer an anchor grades wrong, never throws (Review Focus 4)", () => {
    const gone = { ...TRAIL, answer: "landmark:gone" } as unknown as TrailTask;
    expect(isTaskCorrect(gone, "landmark:mill")).toBe(false);
    expect(isTaskCorrect(gone, "landmark:gone")).toBe(false);
    expect(trailKind.answerText(gone)).toBe("It was somewhere else.");
    expect(TRAIL_UNKNOWN_ANSWER).toBe("It was somewhere else.");
  });

  it("a stored response that is not an anchor decodes to nothing and grades wrong", () => {
    for (const s of ["", "landmark:gone", "toString", " landmark:mill"]) {
      expect(trailKind.decode(s)).toBeNull();
      expect(isTaskCorrect(TRAIL, s)).toBe(false);
    }
    expect(isTaskCorrect(TRAIL, "landmark:mill")).toBe(true);
  });

  it("presents a skill only while a pool credits it (F-7)", () => {
    // With no pool loaded nothing is presented.
    __setTrailPoolsForTest([]);
    expect(trailKind.presents("read-g3")).toBe(false);
    expect(trailKind.presents("read-g1")).toBe(false);
    __setTrailPoolsForTest([cloneTrailPool("g23")]);
    expect(trailKind.presents("read-g3")).toBe(true);
    expect(trailKind.presents("read-g1")).toBe(false);
    // null restores the pools that ship (H5): the skill is presented exactly when one of them credits it.
    __setTrailPoolsForTest(null);
    const ships = TRAIL_POOL_FILES.some((f) => (f as { skillId: string }).skillId === "read-g3");
    expect(trailKind.presents("read-g3")).toBe(ships);
  });

  it("keeps the second-chance lead in the shared copy", () => {
    expect(TRAIL_RETRY_LEAD).toBe("Not here.");
  });
});

describe("the trail codec", () => {
  const c = TASK_CODECS.trail;

  it("writes an anchor id as it is and reads back only an anchor id", () => {
    expect(c.encode("landmark:mill")).toBe("landmark:mill");
    expect(c.decode("landmark:mill")).toBe("landmark:mill");
    expect(c.decode("landmark:longwater")).toBeNull();
    expect(c.decode("__proto__")).toBeNull();
    expect(c.sameResponse("landmark:mill", "landmark:mill")).toBe(true);
    expect(c.sameResponse("landmark:mill", "landmark:well")).toBe(false);
  });

  it("the definition delegates to it (no second copy)", () => {
    expect(trailKind.encode).toBe(c.encode);
    expect(trailKind.decode).toBe(c.decode);
    expect(trailKind.sameResponse).toBe(c.sameResponse);
  });

  it("holds every anchor id within its limit", () => {
    expect(TRAIL_MAX_CHARS).toBe(40);
    expect("landmark:puzzle-tower".length).toBeLessThanOrEqual(TRAIL_MAX_CHARS);
  });
});

describe("drawing trails (H4)", () => {
  it("draws nothing while no pool credits the skill, one task at a time or as a run", () => {
    __setTrailPoolsForTest([]);
    expect(TASK_DRAWERS.trail(findSkill("read-g3")!, 2, seededRng(1))).toBeNull();
    expect(runDrawerFor("trail")!(findSkill("read-g3")!, 2, 4, seededRng(1), new Set(), new Set())).toEqual([]);
    __setTrailPoolsForTest(null);
  });

  it("has a run drawer for the trail kind, found by its own keys only", () => {
    expect(runDrawerFor("trail")).toBeDefined();
    for (const k of ["toString", "__proto__", "constructor", "hasOwnProperty", "choice", ""]) expect(runDrawerFor(k), k).toBeUndefined();
  });
});
