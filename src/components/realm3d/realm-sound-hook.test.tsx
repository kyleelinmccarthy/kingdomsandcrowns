import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeHudBus, type HudBus } from "@/lib/realm3d/hud-bus";
import { makeTroubleBus, type TroubleBus } from "@/lib/realm3d/trouble-bus";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import type { WorldLayout } from "@/lib/realm/layout";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import { realmCue } from "@/lib/realm3d/sound/store";
import { speak } from "@/lib/utils/speech";
import { useRealmSound, type RealmSoundOptions } from "./realm-sound";

vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));

/* ---- a Web Audio stand-in: just enough graph to record what the backend does ---------------- */

type Src = { buffer: { length: number; sampleRate: number } | null; started: number; loop: boolean };
let sources: Src[];
let contexts: FakeContext[];

class Param {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
}
class Node {
  connect() {}
  disconnect() {}
}
class FakeContext {
  currentTime = 0;
  state = "running";
  destination = new Node();
  closed = false;
  constructor() {
    contexts.push(this);
  }
  createGain() {
    return Object.assign(new Node(), { gain: new Param() });
  }
  createStereoPanner() {
    return Object.assign(new Node(), { pan: new Param() });
  }
  createWaveShaper() {
    return Object.assign(new Node(), { curve: null as unknown });
  }
  createBuffer(_ch: number, length: number, sampleRate: number) {
    return { length, sampleRate, copyToChannel() {} };
  }
  createBufferSource() {
    const s = Object.assign(new Node(), {
      buffer: null as Src["buffer"],
      started: -1,
      loop: false,
      playbackRate: new Param(),
      onended: null as unknown,
      start(this: { started: number }, t: number) {
        this.started = t;
      },
      stop() {},
    });
    sources.push(s);
    return s;
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const world = {
  heightAt: () => 0,
  waterLevelAt: () => -6,
  biomeAt: () => "meadow",
  roads: [],
} as unknown as RealmWorld;
const layout = { props: [], spawn: { x: 0, z: 15 } } as unknown as WorldLayout;
const ember = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: null })!;
const pages: SpellPageView[] = [{ slot: 1, name: "Ember Bolt", spell: ember, color: "#f97316", icon: null }];

function Harness(p: Partial<RealmSoundOptions> & { bus: HudBus; tbus: TroubleBus }) {
  useRealmSound({
    world,
    layout,
    pages,
    initial: undefined,
    enabled: true,
    calm: false,
    childId: "kid-1",
    overlay: null,
    room: null,
    roomUses: 0,
    toast: null,
    lessons: 0,
    lessonsTotal: 5,
    close: false,
    ...p,
  });
  return <div className="r3-game" />;
}

/** The one-shot sounds started so far (the beds loop, and are left out). */
const shots = () => sources.filter((s) => !s.loop && s.started >= 0);

beforeEach(() => {
  sources = [];
  contexts = [];
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("the Realm's sound, wired to the game", () => {
  it("makes no audio at all until the first key press, then makes it silently", async () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    bus.onFound("cloudfoot");
    expect(contexts).toHaveLength(0);
    fireEvent.keyDown(window, { code: "KeyW" });
    expect(contexts).toHaveLength(1);
    // The country's beds start looping as soon as they are made.
    await waitFor(() => expect(sources.filter((s) => s.loop)).toHaveLength(2));
  });

  it("answers the game's events: a place found, a spell, a footfall, a trouble cleared, a deed answer", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.pointerDown(window);
    bus.onFound("cloudfoot");
    expect(shots()).toHaveLength(1);
    bus.onCast(1);
    // The charge and the release.
    expect(shots()).toHaveLength(3);
    bus.feet.onStep(3, 30);
    bus.feet.onJump();
    tbus.onEvent({ kind: "cleared", trouble: "fog", home: 0, x: 0, z: 0, count: 1 }, null, null);
    realmCue("deed-right");
    expect(shots()).toHaveLength(7);
  });

  it("chimes when the E prompt appears, not again while it stays on the same thing", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "KeyD" });
    const bram = { kind: "villager" as const, id: "bram", label: "Old Bram" };
    bus.onNear(bram);
    bus.onNear(bram);
    expect(shots()).toHaveLength(1);
  });

  it("goes through the door, rings the bell, and comes back out", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    const { rerender } = render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "KeyE" });
    rerender(<Harness bus={bus} tbus={tbus} room="chapel" />);
    expect(shots()).toHaveLength(1);
    rerender(<Harness bus={bus} tbus={tbus} room="chapel" roomUses={1} />);
    expect(shots()).toHaveLength(2);
    rerender(<Harness bus={bus} tbus={tbus} room={null} roomUses={1} />);
    expect(shots()).toHaveLength(3);
  });

  it("ducks under the pause menu and under read-aloud", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    const synth = { cancel() {}, speak() {} };
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function () {};
    const { rerender } = render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "Escape" });
    const engine = window.__realmSound!;
    rerender(<Harness bus={bus} tbus={tbus} overlay="pause" />);
    expect(engine.state.paused).toBe(true);
    speak("How many apples?");
    expect(engine.state.speaking).toBe(true);
    rerender(<Harness bus={bus} tbus={tbus} overlay={null} />);
    expect(engine.state.paused).toBe(false);
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  });

  it("keeps playing through a building rising: a new village layout never restarts the sound", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    const { rerender } = render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "KeyW" });
    const engine = window.__realmSound!;
    rerender(<Harness bus={bus} tbus={tbus} layout={{ ...layout, props: [] } as WorldLayout} toast={{ rose: true }} />);
    expect(window.__realmSound).toBe(engine);
    expect(engine.attached).toBe(true);
    expect(contexts).toHaveLength(1);
    // And the rise was heard.
    expect(shots()).toHaveLength(1);
  });

  it("stops everything on leaving", () => {
    vi.useFakeTimers();
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    const { unmount } = render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "KeyW" });
    unmount();
    vi.advanceTimersByTime(200);
    expect(contexts[0].closed).toBe(true);
    // And the feet no longer reach anything.
    expect(() => bus.feet.onStep(0, 0)).not.toThrow();
    vi.useRealTimers();
  });

  it("a gesture after the world was closed opens no audio device", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} close />);
    fireEvent.keyDown(window, { key: "w", code: "KeyW" });
    fireEvent.click(window);
    expect(contexts).toHaveLength(0);
  });

  it("stays silent, with no audio device at all, where there is no Web Audio", () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { code: "KeyW" });
    expect(() => bus.onFound("cloudfoot")).not.toThrow();
    expect(sources).toHaveLength(0);
  });
});

describe("the first gesture, and only a real one", () => {
  const setUA = (isActive: boolean | null) => {
    if (isActive === null) delete (navigator as unknown as { userActivation?: unknown }).userActivation;
    else Object.defineProperty(navigator, "userActivation", { value: { isActive }, configurable: true });
  };
  afterEach(() => setUA(null));

  it("does not spend itself on Esc: the context waits for the next real key", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(contexts).toHaveLength(0);
    fireEvent.keyDown(window, { key: "w", code: "KeyW" });
    expect(contexts).toHaveLength(1);
  });

  it("waits for a finger to lift, not to land", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.pointerDown(window, { pointerType: "touch" });
    expect(contexts).toHaveLength(0);
    fireEvent.pointerUp(window, { pointerType: "touch" });
    expect(contexts).toHaveLength(1);
  });

  it("asks the browser where it can: no context while it says the press did not count", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    setUA(false);
    fireEvent.keyDown(window, { key: "a", code: "KeyA" });
    expect(contexts).toHaveLength(0);
    setUA(true);
    fireEvent.keyDown(window, { key: "a", code: "KeyA" });
    expect(contexts).toHaveLength(1);
  });

  it("where the browser cannot say, resumes a context left suspended on the next real gesture", () => {
    const bus = makeHudBus(4, 1);
    const tbus = makeTroubleBus(4);
    render(<Harness bus={bus} tbus={tbus} />);
    fireEvent.keyDown(window, { key: "w", code: "KeyW" });
    const ctx = contexts[0];
    ctx.state = "suspended";
    const resume = vi.spyOn(ctx, "resume");
    fireEvent.click(window);
    expect(resume).toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
  });
});
