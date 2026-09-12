import { describe, it, expect } from "vitest";
import { pickProblem, pickSpeech, PROBLEM_ORDER, SPEECH_ORDER, type MessageInput, type ProblemKind, type SpeechKind } from "./messages";

/** Every lane quiet: the shape RealmShell holds on a calm, mid-session frame. */
const QUIET: MessageInput = {
  spriteError: "",
  kingdomError: "",
  ceremonyError: "",
  lastMinute: false,
  questTimerDone: null,
  preview: null,
  ceremonyNotice: null,
  toast: null,
  notice: null,
  calm: false,
};

const input = (patch: Partial<MessageInput>): MessageInput => ({ ...QUIET, ...patch });

const SPRITE_FAILED = "The hero's picture could not be drawn.";
const VILLAGERS_RESTING = "The villagers are resting. Try again.";
const CEREMONY_FAILED = "The crown could not be recorded.";
const PREVIEW_INTRO = "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.";
const TIMER_DONE = "Your Math timer finished.";
const HAIL = "Hail, Lily, Crown of Spring!";
const WELL_STANDS = "The Village Well stands.";
const NOT_ENOUGH_MANA = "Not enough mana yet.";

describe("PROBLEM_ORDER", () => {
  it("is the closed list of problem kinds, in written priority order", () => {
    expect(PROBLEM_ORDER).toEqual(["spriteError", "kingdomError", "ceremonyError", "questTimer", "lastMinute", "preview"]);
  });
});

describe("pickProblem", () => {
  it("returns nothing when every field is empty", () => {
    expect(pickProblem(QUIET)).toBeNull();
  });

  it("returns one message, and each kind takes the lane in PROBLEM_ORDER as the one above it clears", () => {
    const clear: Record<ProblemKind, Partial<MessageInput>> = {
      spriteError: { spriteError: "" },
      kingdomError: { kingdomError: "" },
      ceremonyError: { ceremonyError: "" },
      questTimer: { questTimerDone: null },
      lastMinute: { lastMinute: false },
      preview: { preview: null },
    };
    let live = input({
      spriteError: SPRITE_FAILED,
      kingdomError: VILLAGERS_RESTING,
      ceremonyError: CEREMONY_FAILED,
      questTimerDone: TIMER_DONE,
      lastMinute: true,
      preview: PREVIEW_INTRO,
    });
    for (const kind of PROBLEM_ORDER) {
      expect(pickProblem(live)?.kind).toBe(kind);
      live = { ...live, ...clear[kind] };
    }
    expect(pickProblem(live)).toBeNull();
  });

  it("carries each source's own text", () => {
    expect(pickProblem(input({ spriteError: SPRITE_FAILED }))?.text).toBe(SPRITE_FAILED);
    expect(pickProblem(input({ kingdomError: VILLAGERS_RESTING }))?.text).toBe(VILLAGERS_RESTING);
    expect(pickProblem(input({ ceremonyError: CEREMONY_FAILED }))?.text).toBe(CEREMONY_FAILED);
    expect(pickProblem(input({ preview: PREVIEW_INTRO }))?.text).toBe(PREVIEW_INTRO);
  });

  it("writes the last-minute banner itself, since the input carries only a flag", () => {
    expect(pickProblem(input({ lastMinute: true }))).toEqual({
      kind: "lastMinute",
      text: "One minute left in the Realm today.",
      actionLabel: null,
    });
  });

  it("labels each action verbatim", () => {
    expect(pickProblem(input({ spriteError: SPRITE_FAILED }))?.actionLabel).toBe("Try again");
    expect(pickProblem(input({ kingdomError: VILLAGERS_RESTING }))?.actionLabel).toBe("Wake the villagers");
    expect(pickProblem(input({ ceremonyError: CEREMONY_FAILED }))?.actionLabel).toBe("Try again");
    expect(pickProblem(input({ lastMinute: true }))?.actionLabel).toBeNull();
    expect(pickProblem(input({ preview: PREVIEW_INTRO }))?.actionLabel).toBeNull();
  });

  it("leaves the loser in the input, so it appears when the winner clears", () => {
    const both = input({ kingdomError: VILLAGERS_RESTING, preview: PREVIEW_INTRO });
    expect(pickProblem(both)?.kind).toBe("kingdomError");
    expect(both.preview).toBe(PREVIEW_INTRO);
    expect(pickProblem({ ...both, kingdomError: "" })?.kind).toBe("preview");
  });

  it("treats an empty string as no message, not as a blank pill", () => {
    expect(pickProblem(input({ preview: "" }))).toBeNull();
  });

  it("gives a finished quest timer the lane above the one-minute banner, with its own action", () => {
    // §3.20: a chore that ran out outranks the clock's own warning — the child can come
    // back to the Realm, but the chore is what a grown-up is waiting on.
    const live = input({ questTimerDone: TIMER_DONE, lastMinute: true });
    expect(pickProblem(live)).toEqual({ kind: "questTimer", text: TIMER_DONE, actionLabel: "Go to it →" });
    expect(pickProblem({ ...live, questTimerDone: null })?.kind).toBe("lastMinute");
    // …and it still loses to a real error, which is the thing that actually broke.
    expect(pickProblem({ ...live, kingdomError: VILLAGERS_RESTING })?.kind).toBe("kingdomError");
  });
});

describe("SPEECH_ORDER", () => {
  it("is the closed list of speech kinds, in written priority order", () => {
    expect(SPEECH_ORDER).toEqual(["ceremony", "toast", "notice"]);
  });
});

describe("pickSpeech", () => {
  it("returns nothing when every field is empty", () => {
    expect(pickSpeech(QUIET)).toBeNull();
  });

  it("returns one message, and each kind takes the lane in SPEECH_ORDER as the one above it clears", () => {
    const clear: Record<SpeechKind, Partial<MessageInput>> = {
      ceremony: { ceremonyNotice: null },
      toast: { toast: null },
      notice: { notice: null },
    };
    let live = input({ ceremonyNotice: HAIL, toast: WELL_STANDS, notice: NOT_ENOUGH_MANA });
    for (const kind of SPEECH_ORDER) {
      expect(pickSpeech(live)?.kind).toBe(kind);
      live = { ...live, ...clear[kind] };
    }
    expect(pickSpeech(live)).toBeNull();
  });

  it("does not let the one-minute banner suppress a toast — the lanes are independent", () => {
    const live = input({ lastMinute: true, toast: WELL_STANDS });
    expect(pickProblem(live)?.kind).toBe("lastMinute");
    expect(pickSpeech(live)).toEqual({ kind: "toast", text: WELL_STANDS, tone: "cheer" });
  });

  it("gives the ceremony the lane without destroying a spell notice fired beneath it", () => {
    const live = input({ ceremonyNotice: HAIL, notice: NOT_ENOUGH_MANA });
    expect(pickSpeech(live)).toEqual({ kind: "ceremony", text: HAIL, tone: "stage" });
    expect(live.notice).toBe(NOT_ENOUGH_MANA);
    expect(pickSpeech({ ...live, ceremonyNotice: null })).toEqual({ kind: "notice", text: NOT_ENOUGH_MANA, tone: "plain" });
  });

  it("turns a cheer plain under calm and leaves the other two tones alone", () => {
    expect(pickSpeech(input({ toast: WELL_STANDS }))?.tone).toBe("cheer");
    expect(pickSpeech(input({ toast: WELL_STANDS, calm: true }))?.tone).toBe("plain");
    expect(pickSpeech(input({ ceremonyNotice: HAIL, calm: true }))?.tone).toBe("stage");
    expect(pickSpeech(input({ notice: NOT_ENOUGH_MANA, calm: true }))?.tone).toBe("plain");
  });

  it("treats an empty string as no message, not as a blank pill", () => {
    expect(pickSpeech(input({ toast: "" }))).toBeNull();
  });
});

/**
 * The two orders are closed against their unions here, not in the source.
 *
 * `Record<ProblemKind, 1>` makes TypeScript fail the moment a seventh kind joins the union
 * without joining this map, and the test below fails if it joins the map without joining
 * PROBLEM_ORDER — which is the silent failure: `pickProblem` walks the ORDER, so a kind the
 * union and both tables know about but the order does not is unreachable, and the band would
 * simply say nothing at all.
 */
const PROBLEM_KINDS = {
  spriteError: 1,
  kingdomError: 1,
  ceremonyError: 1,
  questTimer: 1,
  lastMinute: 1,
  preview: 1,
} satisfies Record<ProblemKind, 1>;

const SPEECH_KINDS = { ceremony: 1, toast: 1, notice: 1 } satisfies Record<SpeechKind, 1>;

describe("the closed orders", () => {
  it("orders every problem kind the union declares, once each", () => {
    const declared = Object.keys(PROBLEM_KINDS) as ProblemKind[];
    expect([...PROBLEM_ORDER].sort()).toEqual([...declared].sort());
    expect(new Set(PROBLEM_ORDER).size).toBe(PROBLEM_ORDER.length);
  });
  it("orders every speech kind the union declares, once each", () => {
    const declared = Object.keys(SPEECH_KINDS) as SpeechKind[];
    expect([...SPEECH_ORDER].sort()).toEqual([...declared].sort());
    expect(new Set(SPEECH_ORDER).size).toBe(SPEECH_ORDER.length);
  });
  it("can reach every problem kind it orders", () => {
    // Every kind in the order is produced by some input, so an ordered kind is never dead.
    const live: Record<ProblemKind, Partial<MessageInput>> = {
      spriteError: { spriteError: "sprites failed" },
      kingdomError: { kingdomError: "the kingdom failed" },
      ceremonyError: { ceremonyError: "the ceremony failed" },
      questTimer: { questTimerDone: "Your Math timer finished." },
      lastMinute: { lastMinute: true },
      preview: { preview: "a parent is looking" },
    };
    for (const kind of PROBLEM_ORDER) {
      expect(pickProblem({ ...QUIET, ...live[kind] })?.kind).toBe(kind);
    }
  });
  it("can reach every speech kind it orders", () => {
    const live: Record<SpeechKind, Partial<MessageInput>> = {
      ceremony: { ceremonyNotice: "Hail!" },
      toast: { toast: "The Village Well stands." },
      notice: { notice: "Not enough mana." },
    };
    for (const kind of SPEECH_ORDER) {
      expect(pickSpeech({ ...QUIET, ...live[kind] })?.kind).toBe(kind);
    }
  });
});
