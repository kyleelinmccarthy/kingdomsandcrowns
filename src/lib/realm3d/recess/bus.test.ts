import { describe, expect, it } from "vitest";
import { RING } from "@/lib/realm/recess/copy";
import { makeRecessBus, ringMapMarks } from "./bus";

const bus = () => makeRecessBus({ seed: 1, runs: true, lowStimulus: false, showTime: true });

describe("ringMapMarks: the Ring on the big map", () => {
  it("always marks the arch, as the minimap does", () => {
    const b = bus();
    expect(ringMapMarks(b)).toEqual([{ id: "ring-arch", x: b.course.arch.x, z: b.course.arch.z, kind: "ring", label: RING }]);
  });

  it("adds the lit post during a lap, the one the minimap lights", () => {
    const b = bus();
    Object.assign(b.run, { active: true, lapStartedAt: 0, nextPost: 1 });
    const post = b.course.posts[1];
    const marks = ringMapMarks(b);
    expect(marks).toHaveLength(2);
    expect(marks[1]).toMatchObject({ id: "ring-next", x: post.position.x, z: post.position.z, kind: "ring" });
    expect(marks[1].label).toContain(post.name);
  });

  it("adds nothing for the arch's own lit mark before a lap or after the last post: the arch is already marked", () => {
    const b = bus();
    Object.assign(b.run, { active: true, lapStartedAt: null, nextPost: 0 });
    expect(ringMapMarks(b)).toHaveLength(1);
    Object.assign(b.run, { lapStartedAt: 0, nextPost: b.course.posts.length });
    expect(ringMapMarks(b)).toHaveLength(1);
  });
});
