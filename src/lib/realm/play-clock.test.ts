import { describe, it, expect } from "vitest";
import { startClock, tickClock, applyAccess, gateCopy, idleGiveBack, minutesToSettle, noteInput, ROUND_UP_SECONDS, type ClockEvent, type PlayClock } from "./play-clock";
import { IDLE_REFUND_MAX_MINUTES } from "@/lib/realm3d/pause";

function tickFor(clock: ReturnType<typeof startClock>, seconds: number, visible = true) {
  const events: string[] = [];
  let c = clock;
  let totalRecords = 0;
  for (let i = 0; i < seconds; i++) {
    const r = tickClock(c, 1, visible);
    c = r.clock;
    totalRecords += r.records;
    if (r.event) events.push(r.event);
  }
  return { clock: c, events, records: totalRecords };
}

describe("tickClock", () => {
  it("records once per 60 visible seconds", () => {
    const { clock, events, records } = tickFor(startClock(5), 125);
    expect(events.filter((e) => e === "record")).toHaveLength(2);
    expect(records).toBe(2);
    expect(clock.secondsThisMinute).toBe(5);
  });
  it("ignores hidden time", () => {
    const { events } = tickFor(startClock(5), 200, false);
    expect(events).toEqual([]);
  });
  it("warns exactly once at one minute left", () => {
    const { events } = tickFor(startClock(1), 10);
    expect(events.filter((e) => e === "warn")).toHaveLength(1);
  });
  it("at zero asks the server (empty) and never closes by itself", () => {
    const { clock, events, records } = tickFor(startClock(0), 2);
    expect(events).toEqual(["empty", "empty"]);
    expect(records).toBe(0);
    expect(clock.closed).toBe(false);
  });
  it("handles multi-minute ticks correctly", () => {
    const r = tickClock(startClock(10), 125, true);
    expect(r.records).toBe(2);
    expect(r.event).toBe("record");
    expect(r.clock.secondsThisMinute).toBe(5);
    expect(r.clock.minutesRemaining).toBe(8);
  });
  it("decrements minutes and asks the server when they hit zero", () => {
    // 1 minute remaining, tick 125 seconds (crosses 2 boundaries = 2 minutes spent)
    const r1 = tickClock(startClock(1), 125, true);
    expect(r1.records).toBe(2);
    expect(r1.event).toBe("record");
    expect(r1.clock.minutesRemaining).toBe(0);
    expect(r1.clock.warned).toBe(false);
    expect(r1.clock.closed).toBe(false);
    // Next tick asks the server (minutesRemaining <= 0): quiet or closed is its answer, not the clock's.
    const r2 = tickClock(r1.clock, 1, true);
    expect(r2.event).toBe("empty");
    expect(r2.clock.closed).toBe(false);
  });
  it("warning is not lost behind a record", () => {
    // Case 1: With 1 minute remaining, a record drops to 0, so next tick asks the server rather than warns.
    const clock1 = { minutesRemaining: 1, secondsThisMinute: 59, warned: false, closed: false, quiet: false, countedSinceInput: 0 };
    const r1a = tickClock(clock1, 1, true);
    expect(r1a.event).toBe("record");
    expect(r1a.records).toBe(1);
    expect(r1a.clock.minutesRemaining).toBe(0);
    expect(r1a.clock.warned).toBe(false);
    const r1b = tickClock(r1a.clock, 1, true);
    expect(r1b.event).toBe("empty");
    expect(r1b.clock.closed).toBe(false);

    // Case 2: With 2 minutes remaining, a record leaves 1 minute, so next tick warns.
    const clock2 = { minutesRemaining: 2, secondsThisMinute: 59, warned: false, closed: false, quiet: false, countedSinceInput: 0 };
    const r2a = tickClock(clock2, 1, true);
    expect(r2a.event).toBe("record");
    expect(r2a.records).toBe(1);
    expect(r2a.clock.minutesRemaining).toBe(1);
    expect(r2a.clock.warned).toBe(false);
    const r2b = tickClock(r2a.clock, 1, true);
    expect(r2b.event).toBe("warn");
    expect(r2b.clock.warned).toBe(true);
  });
  it("warns again at the REAL last minute after a mid-visit top-up", () => {
    // A child at one minute is warned, a grown-up grants five more (or a quest finished on
    // another device pays out), and the child plays on. The banner they saw belonged to a
    // last minute that stopped being the last minute; the real one must still announce
    // itself rather than the Realm closing on them in silence.
    const warnedAtOne = tickClock({ minutesRemaining: 1, secondsThisMinute: 0, warned: false, closed: false, quiet: false, countedSinceInput: 0 }, 1, true);
    expect(warnedAtOne.event).toBe("warn");
    expect(warnedAtOne.clock.warned).toBe(true);
    const toppedUp = applyAccess(warnedAtOne.clock, { allowed: true, minutesRemaining: 6, source: "earned" });
    expect(toppedUp.event).toBeNull();
    expect(toppedUp.clock.warned).toBe(false); // the latch is released with the last minute
    // Spend five of the six minutes: five records, no warn yet.
    let clock = toppedUp.clock;
    const events: ClockEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const r = tickClock(clock, 60, true);
      clock = r.clock;
      events.push(r.event);
    }
    expect(clock.minutesRemaining).toBe(1);
    expect(events.filter((e) => e === "warn")).toHaveLength(0);
    const last = tickClock(clock, 1, true);
    expect(last.event).toBe("warn");
    expect(last.clock.warned).toBe(true);
  });
  it("releases the latch on a fresh access check that raises the minutes", () => {
    const warned = { minutesRemaining: 1, secondsThisMinute: 0, warned: true, closed: false, quiet: false, countedSinceInput: 0 };
    const raised = applyAccess(warned, { allowed: true, minutesRemaining: 10, source: "earned" });
    expect(raised.clock.warned).toBe(false);
    expect(raised.event).toBeNull();
    // Back down to the last minute: the banner fires again, and only once.
    const down = applyAccess(raised.clock, { allowed: true, minutesRemaining: 1, source: "earned" });
    expect(down.event).toBe("warn");
    const again = applyAccess(down.clock, { allowed: true, minutesRemaining: 1, source: "earned" });
    expect(again.event).toBeNull();
  });
});

describe("applyAccess", () => {
  it("adopts the fresh minutes and warns or closes accordingly", () => {
    const c = startClock(5);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 3, source: "earned" }).clock.minutesRemaining).toBe(3);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 1, source: "earned" }).event).toBe("warn");
    expect(applyAccess(c, { allowed: false, reason: "cap_reached" }).event).toBe("close");
  });

  it("goes quiet, not closed, when the server answers quiet", () => {
    const playing = { minutesRemaining: 1, secondsThisMinute: 20, warned: true, closed: false, quiet: false, countedSinceInput: 0 };
    const r = applyAccess(playing, { allowed: true, minutesRemaining: 0, source: "quiet" });
    expect(r.event).toBe("quiet");
    expect(r.clock).toEqual({ minutesRemaining: 0, secondsThisMinute: 0, warned: false, closed: false, quiet: true, countedSinceInput: 0 });
    // Already quiet: a second quiet answer is not news.
    expect(applyAccess(r.clock, { allowed: true, minutesRemaining: 0, source: "quiet" }).event).toBeNull();
  });

  it("a quiet answer on a closed clock is no news: the goodbye stands", () => {
    const closed = applyAccess(startClock(1), { allowed: false, reason: "cap_reached" }).clock;
    const r = applyAccess(closed, { allowed: true, minutesRemaining: 0, source: "quiet" });
    expect(r.event).toBeNull();
    expect(r.clock.closed).toBe(true);
  });

  it("closes from quiet when the server denies (the daily cap still shuts the Realm)", () => {
    const quiet = startClock(0, true);
    const r = applyAccess(quiet, { allowed: false, reason: "cap_reached" });
    expect(r.event).toBe("close");
    expect(r.clock.closed).toBe(true);
    expect(r.clock.quiet).toBe(false);
  });

  it("wakes from quiet when minutes land, and the clock counts again", () => {
    const r = applyAccess(startClock(0, true), { allowed: true, minutesRemaining: 3, source: "earned" });
    expect(r.event).toBe("wake");
    expect(r.clock).toMatchObject({ minutesRemaining: 3, quiet: false, closed: false, warned: false });
    const { events, records } = tickFor(r.clock, 60);
    expect(events).toEqual(["record"]);
    expect(records).toBe(1);
  });

  it("a wake to the last minute still warns, on the next tick", () => {
    const woke = applyAccess(startClock(0, true), { allowed: true, minutesRemaining: 1, source: "earned" });
    expect(woke.event).toBe("wake");
    expect(tickClock(woke.clock, 1, true).event).toBe("warn");
  });
});

describe("the quiet clock", () => {
  it("starts quiet when asked to", () => {
    expect(startClock(0, true)).toEqual({ minutesRemaining: 0, secondsThisMinute: 0, warned: false, closed: false, quiet: true, countedSinceInput: 0 });
    expect(startClock(4).quiet).toBe(false);
  });

  it("never counts, never records, never asks and never closes", () => {
    const { clock, events, records } = tickFor(startClock(0, true), 200);
    expect(events).toEqual([]);
    expect(records).toBe(0);
    expect(clock).toEqual(startClock(0, true));
  });
});

describe("gateCopy", () => {
  it("names each reason in the hero's terms", () => {
    expect(gateCopy({ allowed: false, reason: "no_minutes" })).toEqual({ title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" }, { recessStart: "10:30" })).toEqual({ title: "Recess hasn't started.", body: "Recess opens at 10:30 AM." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" })!.body).toBe("Ask a grown-up when recess is.");
    expect(gateCopy({ allowed: false, reason: "cap_reached" })).toEqual({ title: "You've played your minutes for today.", body: "The Realm will be waiting tomorrow." });
    expect(gateCopy({ allowed: false, reason: "school_hours" })).toEqual({ title: "It's school time.", body: "The Realm opens after your last class." });
    expect(gateCopy({ allowed: false, reason: "disabled" })).toEqual({ title: "The Realm is closed for this hero.", body: "A grown-up can open it in the Chronicle." });
  });
  it("has nothing to say when access is allowed", () => {
    expect(gateCopy({ allowed: true, minutesRemaining: 5, source: "earned" })).toBeNull();
  });
});

describe("minutesToSettle in the quiet world", () => {
  it("charges nothing for quiet time, only minutes played before it", () => {
    const quiet = { ...startClock(0, true), secondsThisMinute: 45 };
    expect(minutesToSettle(quiet, 0)).toBe(0);
    expect(minutesToSettle(quiet, 2)).toBe(2);
  });
});

describe("minutesToSettle", () => {
  const at = (secondsThisMinute: number, minutesRemaining = 10, closed = false): PlayClock => ({
    minutesRemaining,
    secondsThisMinute,
    warned: false,
    closed,
    quiet: false,
    countedSinceInput: 0,
  });

  it("charges no minute in progress once the gate has closed", () => {
    expect(minutesToSettle(at(59, 10, true), 0)).toBe(0);
    expect(minutesToSettle(at(0, 0, true), 0)).toBe(0);
  });

  it("still charges whole minutes that were played but never recorded, after the gate closed", () => {
    // The last minute's record failed, and the next tick closed the clock at 0: that minute was
    // played, and settling it is the only retry it gets.
    expect(minutesToSettle(at(0, 0, true), 1)).toBe(1);
    expect(minutesToSettle(at(59, 0, true), 3)).toBe(3);
    expect(minutesToSettle(at(0, 0, true), 40)).toBe(30);
  });

  it("rounds the minute in progress half-up", () => {
    expect(ROUND_UP_SECONDS).toBe(30);
    expect(minutesToSettle(at(0), 0)).toBe(0);
    expect(minutesToSettle(at(29), 0)).toBe(0);
    expect(minutesToSettle(at(ROUND_UP_SECONDS), 0)).toBe(1);
    expect(minutesToSettle(at(45), 0)).toBe(1);
    expect(minutesToSettle(at(59), 0)).toBe(1);
  });

  it("adds the records still pending", () => {
    expect(minutesToSettle(at(5), 2)).toBe(2);
    expect(minutesToSettle(at(45), 2)).toBe(3);
  });

  it("rounds up the minute in progress only while the hero has a minute left", () => {
    expect(minutesToSettle(at(45, 0), 0)).toBe(0);
    expect(minutesToSettle(at(45, 1), 0)).toBe(1);
  });

  it("charges pending minutes in full: the clock already took them off what is left", () => {
    // `tickClock` counts a record against `minutesRemaining` when it happens, so pending minutes
    // are not part of what is left and must not be clamped by it: 4 failed records and 2 left
    // is 4 played, plus the half-minute in progress.
    expect(minutesToSettle(at(45, 2), 4)).toBe(5);
    expect(minutesToSettle(at(5, 0), 1)).toBe(1);
  });

  it("clamps to the ledger's 30-minute ceiling", () => {
    expect(minutesToSettle(at(45, 60), 40)).toBe(30);
    expect(minutesToSettle(at(5, 60), 30)).toBe(30);
  });
});

describe("idle time given back (spec §4.6)", () => {
  /** Plays `before` seconds, then the child's last input, then `idle` untouched seconds. */
  function idleAfter(before: number, idle: number, minutes = 10) {
    const played = tickFor(startClock(minutes), before);
    const after = tickFor(noteInput(played.clock), idle);
    return { clock: after.clock, records: played.records + after.records };
  }

  it("counts only the clock's own visible seconds since the last input", () => {
    const { clock } = idleAfter(20, 45);
    expect(clock.countedSinceInput).toBe(45);
    expect(tickFor(clock, 30, false).clock.countedSinceInput).toBe(45); // hidden time is not counted, so not given back
    expect(tickFor(startClock(0, true), 30).clock.countedSinceInput).toBe(0); // nor is quiet time
  });

  it("input resets the counter (and leaves a clock already at 0 untouched)", () => {
    const { clock } = idleAfter(5, 40);
    expect(noteInput(clock)).toEqual({ ...clock, countedSinceInput: 0 });
    const still = noteInput(clock);
    expect(noteInput(still)).toBe(still);
  });

  it("rewinds seconds of the current minute when the whole idle span is inside it", () => {
    const { clock } = idleAfter(10, 40);
    const back = idleGiveBack(clock, 0);
    expect(back).toEqual({ clock: { ...clock, secondsThisMinute: 10, countedSinceInput: 0 }, dropPending: 0, refundRecorded: 0 });
  });

  it("drops a pending minute the idle span reached into, keeping the seconds that were really played", () => {
    // 50 played, then 30 idle: one minute pending (not yet written) and 20 seconds in progress.
    const { clock } = idleAfter(50, 30);
    expect(clock).toMatchObject({ minutesRemaining: 9, secondsThisMinute: 20 });
    const back = idleGiveBack(clock, 1);
    expect(back.dropPending).toBe(1);
    expect(back.refundRecorded).toBe(0);
    expect(back.clock).toMatchObject({ minutesRemaining: 10, secondsThisMinute: 50, countedSinceInput: 0 });
  });

  it("drops whole pending minutes the child was idle through", () => {
    const { clock } = idleAfter(20, 100);
    const back = idleGiveBack(clock, 2);
    expect(back.dropPending).toBe(2);
    expect(back.clock).toMatchObject({ minutesRemaining: 10, secondsThisMinute: 20 });
  });

  it("asks for minutes already written back, a minute that was at least half idle counting (the half-up rule)", () => {
    // 30 played, 120 idle; both whole minutes written. The older one was half idle, so it comes back too.
    const half = idleAfter(30, 120);
    expect(half.records).toBe(2);
    expect(idleGiveBack(half.clock, 0)).toMatchObject({ dropPending: 0, refundRecorded: 2, clock: { secondsThisMinute: 0, minutesRemaining: 8 } });
    // 31 played, 119 idle: the older minute was mostly played, so it stays charged.
    expect(idleGiveBack(idleAfter(31, 119).clock, 0).refundRecorded).toBe(1);
  });

  it("drops what is pending first and asks back only what was written, never both for one minute", () => {
    // 30 played, 120 idle; the newer minute is still pending, the older one written.
    const { clock } = idleAfter(30, 120);
    const back = idleGiveBack(clock, 1);
    expect(back).toMatchObject({ dropPending: 1, refundRecorded: 1, clock: { secondsThisMinute: 0, minutesRemaining: 9 } });
  });

  it("never asks back more than one idle pause can owe", () => {
    const { clock } = idleAfter(0, 600, 20);
    expect(idleGiveBack(clock, 0).refundRecorded).toBe(IDLE_REFUND_MAX_MINUTES);
  });

  /** The last minute ran out while nobody was there: 10 played, 50 idle, the minute written, and the server said quiet. */
  function ranOutWhileIdle() {
    const { clock } = idleAfter(10, 50, 1);
    expect(clock).toMatchObject({ minutesRemaining: 0, countedSinceInput: 50 });
    const quiet = applyAccess(clock, { allowed: true, minutesRemaining: 0, source: "quiet" }).clock;
    return tickFor(quiet, 60).clock; // quiet time counts nothing more
  }

  it("still asks back the minutes charged while idle when they ran out and the clock went quiet", () => {
    const quiet = ranOutWhileIdle();
    expect(quiet).toMatchObject({ quiet: true, countedSinceInput: 50 });
    expect(idleGiveBack(quiet, 0)).toMatchObject({ dropPending: 0, refundRecorded: 1, clock: { quiet: true, minutesRemaining: 0, countedSinceInput: 0 } });
  });

  it("drops a quiet clock's unwritten idle minute without putting minutes on it (quiet holds 0; the server's answer wakes it)", () => {
    const back = idleGiveBack(ranOutWhileIdle(), 1);
    expect(back).toMatchObject({ dropPending: 1, refundRecorded: 0, clock: { quiet: true, minutesRemaining: 0, secondsThisMinute: 10 } });
  });

  it("gives nothing back from a clock quiet throughout: it never counted", () => {
    const quiet = tickFor(startClock(0, true), 120).clock;
    expect(idleGiveBack(quiet, 0)).toEqual({ clock: quiet, dropPending: 0, refundRecorded: 0 });
  });

  it("gives nothing back from a closed clock, and starts the count again", () => {
    const closed = { ...idleAfter(0, 90).clock, closed: true };
    expect(idleGiveBack(closed, 1)).toEqual({ clock: { ...closed, countedSinceInput: 0 }, dropPending: 0, refundRecorded: 0 });
  });
});
