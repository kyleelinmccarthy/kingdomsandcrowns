import { describe, expect, it } from "vitest";
import { EFFECTS } from "./recipes";
import { footfallCue, GALLOP_GAP, hoofTick, makeHoofClock, mountSounds, mountSurface, mountVoice, WALK_GAP, wingsOpen, wingTick, WING_RATE } from "./ride-cues";

describe("each mount's sound", () => {
  it("has hooves, padded feet or wings by body", () => {
    for (const id of ["pony", "donkey", "goat", "stag"]) expect(mountVoice(id).feet, id).toBe("hoof");
    for (const id of ["direwolf", "boar", "gryphon", "wyrm"]) expect(mountVoice(id).feet, id).toBe("paw");
    for (const id of ["gryphon", "wyrm"]) expect(mountVoice(id).wings, id).toBe(true);
    for (const id of ["pony", "donkey", "goat", "stag", "direwolf", "boar"]) expect(mountVoice(id).wings, id).toBe(false);
  });

  it("says hello in its own voice: a whinny, a bray, a bleat, a grunt, a howl…", () => {
    expect(mountVoice("pony").call).toBe("whinny");
    expect(mountVoice("donkey").call).toBe("bray");
    expect(mountVoice("goat").call).toBe("bleat");
    expect(mountVoice("boar").call).toBe("grunt");
    expect(mountVoice("direwolf").call).toBe("howl");
    const calls = new Set(["pony", "donkey", "goat", "stag", "boar", "direwolf", "gryphon", "wyrm"].map((id) => mountVoice(id).call));
    expect(calls.size).toBe(8);
  });

  it("sounds like a pony when the id is unknown", () => {
    expect(mountVoice("unicorn")).toEqual(mountVoice("pony"));
    expect(mountVoice(null)).toEqual(mountVoice("pony"));
  });

  it("names only sounds that exist, and wants a wingbeat only with wings", () => {
    for (const id of ["pony", "boar", "wyrm"]) for (const s of mountSounds(mountVoice(id))) expect(EFFECTS, s).toContain(s);
    expect(mountSounds(mountVoice("pony"))).not.toContain("wingbeat");
    expect(mountSounds(mountVoice("gryphon"))).toContain("wingbeat");
    expect(mountSounds(mountVoice("pony"))).toContain("hoof-road");
    expect(mountSounds(mountVoice("boar"))).toContain("gallop-paw-water");
  });

  it("finds a mount's ground outdoors only, and its footfall by feet, ground and gait", () => {
    expect(mountSurface("wood")).toBe("grass");
    expect(mountSurface("water")).toBe("water");
    expect(footfallCue("hoof", "road", false)).toBe("hoof-road");
    expect(footfallCue("paw", "grass", true)).toBe("gallop-paw-grass");
  });
});

/** Runs the hoof clock at a steady speed for `seconds`: how many walks and gallops it heard. */
function ride(speed: number, stride: number, run: number, seconds: number, moving = true) {
  const c = makeHoofClock();
  const dt = 1 / 60;
  let phase = 0;
  const heard = { walk: 0, gallop: 0 };
  for (let t = 0; t < seconds; t += dt) {
    phase += ((speed * dt) / stride) * Math.PI * 2;
    const f = hoofTick(c, phase, run, moving, dt);
    if (f) heard[f]++;
  }
  return heard;
}

describe("the mount's feet", () => {
  it("walks as single feet no faster than one every WALK_GAP", () => {
    const h = ride(3, 1.9, 0.1, 4);
    expect(h.gallop).toBe(0);
    expect(h.walk).toBeGreaterThan(4);
    expect(h.walk).toBeLessThanOrEqual(Math.ceil(4 / WALK_GAP));
  });

  it("gallops as a three-beat pattern about three times a second, however fast the legs turn", () => {
    const h = ride(14, 1.9, 1, 4);
    expect(h.walk).toBe(0);
    expect(h.gallop).toBeGreaterThanOrEqual(Math.floor(4 / (GALLOP_GAP + 0.1)));
    expect(h.gallop).toBeLessThanOrEqual(Math.ceil(4 / GALLOP_GAP));
    // A fast-travel ride goes three times as fast: still no drum roll.
    expect(ride(44, 1.9, 1, 4).gallop).toBeLessThanOrEqual(Math.ceil(4 / GALLOP_GAP));
  });

  it("is silent standing still, and when nothing moved", () => {
    expect(ride(0, 1.9, 0, 3)).toEqual({ walk: 0, gallop: 0 });
    expect(ride(10, 1.9, 1, 3, false)).toEqual({ walk: 0, gallop: 0 });
  });
});

describe("the wings", () => {
  it("beat once per downstroke while open, never folded", () => {
    const c = makeHoofClock();
    const dt = 1 / 60;
    let open = 0;
    let folded = 0;
    for (let t = 0; t < 3; t += dt) if (wingTick(c, t, 1)) open++;
    for (let t = 3; t < 6; t += dt) if (wingTick(c, t, 0)) folded++;
    const cycles = (3 * WING_RATE) / (Math.PI * 2);
    expect(open).toBeGreaterThanOrEqual(Math.floor(cycles) - 1);
    expect(open).toBeLessThanOrEqual(Math.ceil(cycles) + 1);
    expect(folded).toBe(0);
  });

  it("open in the air, and flat out", () => {
    expect(wingsOpen(1, 0)).toBe(1);
    expect(wingsOpen(0, 0.3)).toBe(0);
    expect(wingsOpen(0, 1)).toBeGreaterThan(0.5);
  });
});
