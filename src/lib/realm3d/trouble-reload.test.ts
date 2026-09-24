import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RESPAWN_MS } from "@/lib/realm/spells/troubles";
import { makeFxPool } from "./spell-fx";
import { makeField, NO_POP_R, stepField, WAKE_R, type FieldInput, type Mover, type TroubleField, type TroubleHome } from "./troubles3d";
import { addTabClear, holdClears, latestClears, mergeClears, readTabClears, RELOAD_MEMORY_MS, seedClears, STAMP_SLACK_MS, TAB_CLEARS_MAX, tabClearsKey } from "./trouble-reload";

/** Open ground: every step is allowed. */
const open: Mover = (out, _fx, _fz, tx, tz) => {
  out.x = tx;
  out.z = tz;
};

/** One home, a fog at the origin, and a field made fresh — as a reload makes it. */
function reloaded(homes: Partial<TroubleHome>[] = [{ id: "rim-0" }]): TroubleField {
  return makeField(homes.map((h, i) => ({ id: `h${i}`, kind: "fog" as const, x: 0, z: 0, place: null, placeName: null, ...h })));
}

const pool = makeFxPool(8);

/** Steps the field `seconds` at 60 fps with the hero standing at (x, 0). */
function run(f: TroubleField, seconds: number, heroX: number, calm = false): void {
  const inp: FieldInput = { dt: 1 / 60, heroX, heroZ: 0, calm, move: open };
  for (let i = 0; i < Math.round(seconds * 60); i++) stepField(f, pool, inp);
}

const awake = (f: TroubleField, home = 0) => f.slotOf[home] >= 0;
/** Near: inside the 34, and well inside waking range. */
const NEAR = NO_POP_R - 10;
/** Away: past the 34, still inside waking range. */
const AWAY = NO_POP_R + 10;

describe("a reload remembers what was just cleared", () => {
  it("without the record, a reload brings the trouble straight back (the defect)", () => {
    const f = reloaded();
    run(f, 0.1, AWAY);
    expect(awake(f)).toBe(true);
  });

  it("a clear 5 s before the reload waits out the rest of the 20 s, not a fresh 20 s and not none", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 5_000 }], 0);
    run(f, (RESPAWN_MS - 5_000) / 1000 - 0.5, AWAY);
    expect(awake(f)).toBe(false);
    run(f, 1, AWAY);
    expect(awake(f)).toBe(true);
  });

  it("counts the page's own load time into the age (`sinceMs`)", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 5_000 }], 3_000);
    run(f, (RESPAWN_MS - 8_000) / 1000 - 0.5, AWAY);
    expect(awake(f)).toBe(false);
    run(f, 1, AWAY);
    expect(awake(f)).toBe(true);
  });

  it("keeps the 34: a child standing near a home cleared before the reload never sees it pop up, however long they wait", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 2_000 }], 0);
    run(f, (RESPAWN_MS * 3) / 1000, NEAR);
    expect(awake(f)).toBe(false);
    // Step 34 away: back it comes, at once, since its 20 s are long gone.
    run(f, 0.1, AWAY);
    expect(awake(f)).toBe(true);
  });

  it("keeps the 34 for a clear older than the 20 s too: it comes back only once the child is away", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 3 * 60_000 }], 0);
    run(f, 1, NEAR);
    expect(awake(f)).toBe(false);
    run(f, 0.1, NO_POP_R + 0.5);
    expect(awake(f)).toBe(true);
  });

  it("does not hold the 34 exactly on the line: 34 is still near, just past it is away", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 60_000 }], 0);
    run(f, 0.5, NO_POP_R);
    expect(awake(f)).toBe(false);
  });

  it("is the same rule as without a reload: a cleared home in play and a seeded one wake on the same frame", () => {
    // In play: cleared at t = 0, the child walks away at once.
    const played = reloaded();
    run(played, 0.1, AWAY);
    const slot = played.slotOf[0];
    expect(slot).toBeGreaterThanOrEqual(0);
    played.clearedAt[0] = played.now;
    played.troubles[slot].live = false;
    played.slotOf[0] = -1;
    // Reloaded 5 s after the same clear.
    run(played, 5, AWAY);
    const seeded = reloaded();
    seedClears(seeded, [{ homeId: "rim-0", agoMs: 5_000 }], 0);
    let a = -1;
    let b = -1;
    for (let i = 0; i < 20 * 60 && (a < 0 || b < 0); i++) {
      run(played, 1 / 60, AWAY);
      run(seeded, 1 / 60, AWAY);
      if (a < 0 && awake(played)) a = i;
      if (b < 0 && awake(seeded)) b = i;
    }
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it("only ever makes a home wait LONGER: an older clear never shortens a newer one", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 2_000 }], 0);
    const newer = f.clearedAt[0];
    seedClears(f, [{ homeId: "rim-0", agoMs: 60_000 }], 0);
    expect(f.clearedAt[0]).toBe(newer);
  });

  it("puts back to sleep a trouble that woke before the seed (the field stepped first)", () => {
    const f = reloaded();
    run(f, 0.1, AWAY);
    expect(awake(f)).toBe(true);
    seedClears(f, [{ homeId: "rim-0", agoMs: 1_000 }], 0);
    expect(awake(f)).toBe(false);
    run(f, 1, AWAY);
    expect(awake(f)).toBe(false);
  });

  it("skips a home the plan does not have, and a home that is leaving", () => {
    const f = reloaded([{ id: "rim-0" }, { id: "rim-1", x: 5, leaving: true }]);
    seedClears(f, [{ homeId: "place-gone", agoMs: 1_000 }, { homeId: "rim-1", agoMs: 1_000 }], 0);
    expect(f.clearedAt.every((t) => t === Number.NEGATIVE_INFINITY)).toBe(true);
  });

  it("seeds each home on its own: the others wake as ever", () => {
    const f = reloaded([{ id: "rim-0" }, { id: "rim-1", x: 60 }]);
    seedClears(f, [{ homeId: "rim-0", agoMs: 1_000 }], 0);
    run(f, 0.1, AWAY);
    expect(awake(f, 0)).toBe(false);
    expect(awake(f, 1)).toBe(true);
  });

  it("a home out of waking range stays asleep whatever the seed, as ever", () => {
    const f = reloaded();
    seedClears(f, [{ homeId: "rim-0", agoMs: 60_000 }], 0);
    run(f, 1, WAKE_R + 5);
    expect(awake(f)).toBe(false);
  });
});

describe("latestClears — what the bundle carries", () => {
  const now = 1_000_000_000;

  it("keeps each home's LATEST clear, as an age, a second younger than stored", () => {
    const out = latestClears(
      [
        { homeId: "rim-0", at: now - 90_000 },
        { homeId: "rim-0", at: now - 8_000 },
        { homeId: "place-ringstones", at: now - 30_000 },
      ],
      now,
    );
    expect(out).toEqual(
      expect.arrayContaining([
        { homeId: "rim-0", agoMs: 8_000 - STAMP_SLACK_MS },
        { homeId: "place-ringstones", agoMs: 30_000 - STAMP_SLACK_MS },
      ]),
    );
    expect(out).toHaveLength(2);
  });

  it("never gives an age below nought (a stamp in the same second, or a clock step)", () => {
    expect(latestClears([{ homeId: "rim-0", at: now + 400 }], now)).toEqual([{ homeId: "rim-0", agoMs: 0 }]);
  });

  it("forgets clears older than the window", () => {
    expect(latestClears([{ homeId: "rim-0", at: now - RELOAD_MEMORY_MS - 1 }], now)).toEqual([]);
    expect(latestClears([{ homeId: "rim-0", at: now - RELOAD_MEMORY_MS }], now)).toHaveLength(1);
  });

  it("the second off can only make a reloaded home wait longer, never less", () => {
    // Stored to the second: a clear at 12.9 s ago is stored as 13 s ago. Its age must not exceed the truth.
    const truth = 12_900;
    const storedAt = Math.floor((now - truth) / 1000) * 1000;
    const [c] = latestClears([{ homeId: "rim-0", at: storedAt }], now);
    expect(c.agoMs).toBeLessThanOrEqual(truth);
  });
});

describe("the tab's own note — a reload that beats the server", () => {
  const now = 2_000_000_000;

  it("merges per home, taking the NEWER clear, from either side", () => {
    const merged = mergeClears(
      [
        { homeId: "rim-0", agoMs: 30_000 },
        { homeId: "rim-1", agoMs: 2_000 },
      ],
      [
        { homeId: "rim-0", at: now - 3_000 }, // newer than the server's: the batch had not landed
        { homeId: "rim-1", at: now - 50_000 }, // older than the server's
        { homeId: "place-ringstones", at: now - 1_000 }, // the server has not heard of it yet
      ],
      now,
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { homeId: "rim-0", agoMs: 3_000 },
        { homeId: "rim-1", agoMs: 2_000 },
        { homeId: "place-ringstones", agoMs: 1_000 },
      ]),
    );
    expect(merged).toHaveLength(3);
  });

  it("a note from the future (the clock went back) counts as just now; one past the window is dropped", () => {
    expect(mergeClears([], [{ homeId: "rim-0", at: now + 60_000 }], now)).toEqual([{ homeId: "rim-0", agoMs: 0 }]);
    expect(mergeClears([], [{ homeId: "rim-0", at: now - RELOAD_MEMORY_MS - 1 }], now)).toEqual([]);
  });

  it("reads a stored note defensively, and keeps it short", () => {
    expect(readTabClears(null, now)).toEqual([]);
    expect(readTabClears("not json", now)).toEqual([]);
    expect(readTabClears(JSON.stringify({ homeId: "rim-0" }), now)).toEqual([]);
    expect(
      readTabClears(JSON.stringify([{ homeId: "rim-0", at: now - 5 }, { homeId: 3, at: now }, { homeId: "rim-1", at: "x" }, { homeId: "rim-2", at: now - RELOAD_MEMORY_MS - 9 }]), now),
    ).toEqual([{ homeId: "rim-0", at: now - 5 }]);
    let list: ReturnType<typeof readTabClears> = [];
    for (let i = 0; i < TAB_CLEARS_MAX + 20; i++) list = addTabClear(list, `rim-${i % 3}`, now + i);
    expect(list).toHaveLength(TAB_CLEARS_MAX);
    expect(list[list.length - 1]).toEqual({ homeId: `rim-${(TAB_CLEARS_MAX + 19) % 3}`, at: now + TAB_CLEARS_MAX + 19 });
    expect(addTabClear([{ homeId: "rim-0", at: now - RELOAD_MEMORY_MS - 1 }], "rim-1", now)).toEqual([{ homeId: "rim-1", at: now }]);
    expect(tabClearsKey("c1")).toBe("realm3d:clears:c1");
  });

  it("a clear the server had not heard of when the page reloaded still keeps its trouble away", () => {
    const f = reloaded();
    seedClears(f, mergeClears([], [{ homeId: "rim-0", at: now - 1_500 }], now), 0);
    run(f, (RESPAWN_MS - 1_500) / 1000 - 0.5, AWAY);
    expect(awake(f)).toBe(false);
    run(f, 1, AWAY);
    expect(awake(f)).toBe(true);
  });
});

describe("holdClears", () => {
  it("holds the list with when it arrived, and an empty list when the bundle had none", () => {
    expect(holdClears([{ homeId: "rim-0", agoMs: 1 }], 42)).toEqual({ clears: [{ homeId: "rim-0", agoMs: 1 }], heldAt: 42 });
    expect(holdClears(undefined, 7)).toEqual({ clears: [], heldAt: 7 });
  });

  it("is pure: no three, and no Date.now in the seeding", () => {
    const src = readFileSync(path.join(__dirname, "trouble-reload.ts"), "utf8");
    expect(src).not.toMatch(/from "three"/);
    expect(src).not.toMatch(/Date\.now|Math\.random/);
  });
});
