import { describe, expect, it } from "vitest";
import { lookBy, zoomBy } from "./controls";
import { ROOM_LOOK, ROOM_DIST_MAX, ROOM_DIST_MIN, ROOM_PITCH_MAX, ROOM_PITCH_MIN } from "./room-rules";

describe("looking round a room", () => {
  const still = { sensitivity: 1, invertY: false };
  it("tilts and zooms within the room's own limits, not the island's", () => {
    const o = { yaw: 0, pitch: 0.72, dist: 12 };
    expect(lookBy({ ...o }, 0, 100_000, still, ROOM_LOOK).pitch).toBe(ROOM_PITCH_MAX);
    expect(lookBy({ ...o }, 0, -100_000, still, ROOM_LOOK).pitch).toBe(ROOM_PITCH_MIN);
    expect(zoomBy({ ...o }, 100_000, ROOM_LOOK).dist).toBe(ROOM_DIST_MAX);
    expect(zoomBy({ ...o }, -100_000, ROOM_LOOK).dist).toBe(ROOM_DIST_MIN);
  });
});
