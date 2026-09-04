import { describe, it, expect } from "vitest";
import { startClock, tickClock, applyAccess, gateCopy } from "./play-clock";

function tickFor(clock: ReturnType<typeof startClock>, seconds: number, visible = true) {
  const events: string[] = [];
  let c = clock;
  for (let i = 0; i < seconds; i++) {
    const r = tickClock(c, 1, visible);
    c = r.clock;
    if (r.event) events.push(r.event);
  }
  return { clock: c, events };
}

describe("tickClock", () => {
  it("records once per 60 visible seconds", () => {
    const { clock, events } = tickFor(startClock(5), 125);
    expect(events.filter((e) => e === "record")).toHaveLength(2);
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
  it("closes at zero", () => {
    const { clock, events } = tickFor(startClock(0), 2);
    expect(events[0]).toBe("close");
    expect(clock.closed).toBe(true);
  });
});

describe("applyAccess", () => {
  it("adopts the fresh minutes and warns or closes accordingly", () => {
    const c = startClock(5);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 3, source: "earned" }).clock.minutesRemaining).toBe(3);
    expect(applyAccess(c, { allowed: true, minutesRemaining: 1, source: "earned" }).event).toBe("warn");
    expect(applyAccess(c, { allowed: true, minutesRemaining: 0, source: "earned" }).event).toBe("close");
    expect(applyAccess(c, { allowed: false, reason: "cap_reached" }).event).toBe("close");
  });
});

describe("gateCopy", () => {
  it("names each reason in the hero's terms", () => {
    expect(gateCopy({ allowed: false, reason: "no_minutes" })).toEqual({ title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" }, { recessStart: "10:30" })).toEqual({ title: "Recess hasn't started.", body: "Recess opens at 10:30 AM." });
    expect(gateCopy({ allowed: false, reason: "outside_recess" }).body).toBe("Ask a grown-up when recess is.");
    expect(gateCopy({ allowed: false, reason: "cap_reached" })).toEqual({ title: "You've played your minutes for today.", body: "The Realm will be waiting tomorrow." });
    expect(gateCopy({ allowed: false, reason: "school_hours" })).toEqual({ title: "It's school time.", body: "The Realm opens after your last class." });
    expect(gateCopy({ allowed: false, reason: "disabled" })).toEqual({ title: "The Realm is closed for this hero.", body: "A grown-up can open it in the Chronicle." });
  });
  it("has nothing to say when access is allowed", () => {
    expect(gateCopy({ allowed: true, minutesRemaining: 5, source: "earned" })).toBeNull();
  });
});
