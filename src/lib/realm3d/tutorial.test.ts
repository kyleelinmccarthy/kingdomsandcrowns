import { describe, expect, it } from "vitest";
import {
  advanceLesson,
  currentLesson,
  LEGACY_STEPS,
  LESSONS,
  lessonCopy,
  lessonsFromStored,
  settle,
  skipLesson,
  STORED_MAX,
  CORE_LESSONS,
  storedFromLessons,
  tutorialLearned,
  type LessonContext,
} from "./tutorial";

const ctx: LessonContext = { waiting: "Old Bram", villagers: true, spell: { name: "Ember Bolt", key: 1 }, emptyPage: true };
const at = (id: string) => LESSONS.findIndex((l) => l.id === id);

describe("the ladder", () => {
  it("teaches the real controls, in the order a child meets them", () => {
    expect(LESSONS.map((l) => l.id)).toEqual(["walk", "look", "jump", "find", "talk", "cast", "spells", "ride"]);
  });

  it("teaches M only to a child with a mount, last, and counts the seven before it as learned", () => {
    const spells = LESSONS.findIndex((l) => l.id === "spells");
    const noMount = { ...ctx, mount: null };
    expect(advanceLesson(spells, { kind: "page" }, noMount)).toBe(LESSONS.length);
    const pony = { ...ctx, mount: "Pony" };
    const at = advanceLesson(spells, { kind: "page" }, pony);
    expect(LESSONS[at].id).toBe("ride");
    expect(lessonCopy(at, pony)?.title).toBe("Ride your Pony!");
    expect(lessonCopy(at, pony)?.how).toMatch(/Press M/);
    expect(advanceLesson(at, { kind: "rode" }, pony)).toBe(LESSONS.length);
    expect(tutorialLearned(storedFromLessons(CORE_LESSONS))).toBe(true);
  });

  it("walks from nothing to finished when every lesson is done by doing it", () => {
    let d = 0;
    d = advanceLesson(d, { kind: "walked", keys: 2, distance: 4 }, ctx);
    d = advanceLesson(d, { kind: "looked", px: 200 }, ctx);
    d = advanceLesson(d, { kind: "jumped" }, ctx);
    d = advanceLesson(d, { kind: "near", villager: true, waiting: true }, ctx);
    d = advanceLesson(d, { kind: "talked" }, ctx);
    d = advanceLesson(d, { kind: "cast" }, ctx);
    d = advanceLesson(d, { kind: "page" }, ctx);
    expect(d).toBe(LESSONS.length);
    expect(currentLesson(d, ctx)).toBeNull();
    expect(lessonCopy(d, ctx)).toBeNull();
  });

  it("does not finish walking on one key, however far, or on two keys and no distance", () => {
    expect(advanceLesson(0, { kind: "walked", keys: 1, distance: 99 }, ctx)).toBe(0);
    expect(advanceLesson(0, { kind: "walked", keys: 4, distance: 3.9 }, ctx)).toBe(0);
    expect(advanceLesson(0, { kind: "walked", keys: 2, distance: 4 }, ctx)).toBe(1);
  });

  it("wants a real drag to count as looking", () => {
    expect(advanceLesson(1, { kind: "looked", px: 40 }, ctx)).toBe(1);
    expect(advanceLesson(1, { kind: "looked", px: 160 }, ctx)).toBe(2);
  });

  it("ignores a signal for any lesson but the current one", () => {
    // Reaching Old Bram before learning to walk does not skip walking.
    expect(advanceLesson(0, { kind: "near", villager: true, waiting: true }, ctx)).toBe(0);
    expect(advanceLesson(0, { kind: "cast" }, ctx)).toBe(0);
    // And jumping again later changes nothing.
    expect(advanceLesson(at("talk"), { kind: "jumped" }, ctx)).toBe(at("talk"));
  });

  it("sends the child to the villager who is waiting, not whoever they bump into", () => {
    const find = at("find");
    expect(advanceLesson(find, { kind: "near", villager: true, waiting: false }, ctx)).toBe(find);
    expect(advanceLesson(find, { kind: "near", villager: false, waiting: false }, ctx)).toBe(find);
    expect(advanceLesson(find, { kind: "near", villager: true, waiting: true }, ctx)).toBe(find + 1);
  });

  it("accepts any villager when nobody in particular is waiting (a finished village)", () => {
    const done: LessonContext = { ...ctx, waiting: null };
    expect(advanceLesson(at("find"), { kind: "near", villager: true, waiting: false }, done)).toBe(at("find") + 1);
    expect(lessonCopy(at("find"), done)?.title).toBe("Find a villager.");
  });
});

describe("lessons the world cannot offer are stepped over, never shown", () => {
  it("a child with no spell is not told to press 1", () => {
    const noSpell: LessonContext = { ...ctx, spell: null };
    expect(settle(at("cast"), noSpell)).toBe(at("spells"));
    expect(currentLesson(at("cast"), noSpell)?.id).toBe("spells");
    expect(advanceLesson(at("talk"), { kind: "talked" }, noSpell)).toBe(at("spells"));
  });

  it("a child with every page full finishes on the cast", () => {
    const full: LessonContext = { ...ctx, emptyPage: false };
    expect(advanceLesson(at("cast"), { kind: "cast" }, full)).toBe(LESSONS.length);
  });

  it("a village whose villagers did not load says nothing for the villager lessons, but does not skip them", () => {
    const resting: LessonContext = { ...ctx, villagers: false };
    expect(lessonCopy(at("find"), resting)).toBeNull();
    expect(lessonCopy(at("talk"), resting)).toBeNull();
    expect(settle(at("find"), resting)).toBe(at("find"));
  });
});

describe("never trapped", () => {
  it("skipping a step moves exactly one lesson on, and over anything impossible", () => {
    expect(skipLesson(at("find"), ctx)).toBe(at("talk"));
    expect(skipLesson(at("talk"), { ...ctx, spell: null })).toBe(at("spells"));
    expect(skipLesson(LESSONS.length, ctx)).toBe(LESSONS.length);
  });
});

describe("the words", () => {
  it("names the villager and the real spell", () => {
    expect(lessonCopy(at("find"), ctx)?.title).toBe("Find Old Bram.");
    expect(lessonCopy(at("talk"), ctx)).toMatchObject({ title: "Talk to Old Bram.", how: "Stand close and press E." });
    expect(lessonCopy(at("cast"), { ...ctx, spell: { name: "Tide Orb", key: 2 } })).toMatchObject({ title: "Cast Tide Orb.", how: "Press 2, or click the spell." });
  });

  it("speaks the title and the how together", () => {
    expect(lessonCopy(0, ctx)?.spoken).toBe("Walk around. W walks forward and S walks back. A and D step to the side.");
  });
});

describe("persistence, above the flat tutorial's numbers", () => {
  it("reads every flat-tutorial value, finished or not, as no 3D lesson done", () => {
    for (let v = 0; v <= LEGACY_STEPS; v++) expect(lessonsFromStored(v)).toBe(0);
  });

  it("round-trips every lesson count", () => {
    for (let d = 0; d <= LESSONS.length; d++) expect(lessonsFromStored(storedFromLessons(d))).toBe(d);
    expect(storedFromLessons(0)).toBe(0);
    expect(storedFromLessons(1)).toBe(LEGACY_STEPS + 1);
    expect(storedFromLessons(LESSONS.length)).toBe(STORED_MAX);
  });

  it("clamps nonsense rather than reading it as finished", () => {
    expect(lessonsFromStored(-3)).toBe(0);
    expect(lessonsFromStored(Number.NaN)).toBe(0);
    expect(lessonsFromStored(STORED_MAX + 40)).toBe(LESSONS.length);
    expect(storedFromLessons(-2)).toBe(0);
  });

  it("counts either tutorial, finished, as having learned the Realm, and a half-done one as not", () => {
    expect(tutorialLearned(LEGACY_STEPS)).toBe(true);
    expect(tutorialLearned(STORED_MAX)).toBe(true);
    expect(tutorialLearned(0)).toBe(false);
    expect(tutorialLearned(LEGACY_STEPS + 1)).toBe(false);
    expect(tutorialLearned(2)).toBe(false);
  });
});
