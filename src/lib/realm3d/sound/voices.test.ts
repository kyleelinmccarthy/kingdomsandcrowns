import { describe, expect, it } from "vitest";
import { admit, busyCount, claimVoice, clearPool, endVoice, makeGate, makePool, playingCount } from "./voices";

describe("the voice pool", () => {
  it("hands out free voices first", () => {
    const pool = makePool(3);
    expect(claimVoice(pool, "a", 1, 0, 1)).toEqual({ index: 0, stolen: false });
    expect(claimVoice(pool, "b", 1, 0, 1)).toEqual({ index: 1, stolen: false });
    expect(busyCount(pool, 0.5)).toBe(2);
    // Once a sound has finished its voice is free again.
    expect(claimVoice(pool, "c", 1, 1.5, 1)).toEqual({ index: 0, stolen: false });
  });

  it("steals the oldest voice of the same or lower priority when every one is busy", () => {
    const pool = makePool(2);
    claimVoice(pool, "step", 1, 0, 5);
    claimVoice(pool, "step", 1, 0.1, 5);
    const r = claimVoice(pool, "clear", 4, 0.2, 5);
    expect(r).toEqual({ index: 0, stolen: true });
    expect(pool.voices[0].id).toBe("clear");
  });

  it("drops a sound rather than cut off something more important", () => {
    const pool = makePool(2);
    claimVoice(pool, "complete", 5, 0, 5);
    claimVoice(pool, "found", 5, 0, 5);
    expect(claimVoice(pool, "step", 1, 0.2, 0.3).index).toBe(-1);
    expect(pool.voices.map((v) => v.id)).toEqual(["complete", "found"]);
  });

  it("frees a voice cut short, and clears on leaving", () => {
    const pool = makePool(1);
    claimVoice(pool, "charge", 3, 0, 1.4);
    endVoice(pool, 0, 0.3);
    expect(busyCount(pool, 0.31)).toBe(0);
    claimVoice(pool, "x", 1, 0.4, 9);
    clearPool(pool);
    expect(busyCount(pool, 0.5)).toBe(0);
  });

  it("never allocates a voice: the pool is the same objects for ever", () => {
    const pool = makePool(4);
    const before = pool.voices.slice();
    for (let i = 0; i < 100; i++) claimVoice(pool, `s${i % 3}`, i % 5, i * 0.1, 0.25);
    expect(pool.voices).toHaveLength(4);
    pool.voices.forEach((v, i) => expect(v).toBe(before[i]));
  });
});

describe("the gate", () => {
  it("keeps two of the same sound apart", () => {
    const gate = makeGate();
    const pool = makePool(8);
    expect(admit(gate, pool, "prompt", 0, 0.35, 2)).toBe(true);
    expect(admit(gate, pool, "prompt", 0.1, 0.35, 2)).toBe(false);
    expect(admit(gate, pool, "prompt", 0.4, 0.35, 2)).toBe(true);
    // A different sound is not held back by it.
    expect(admit(gate, pool, "talk", 0.4, 0.35, 2)).toBe(true);
  });

  it("caps how many of one sound can overlap: three troubles cleared in a frame is not three chimes stacked", () => {
    const gate = makeGate();
    const pool = makePool(8);
    let played = 0;
    for (let i = 0; i < 3; i++) {
      if (admit(gate, pool, "hit", i * 0.07, 0.06, 2)) {
        claimVoice(pool, "hit", 3, i * 0.07, 1);
        played++;
      }
    }
    expect(played).toBe(2);
    expect(playingCount(pool, "hit", 0.2)).toBe(2);
  });
});
