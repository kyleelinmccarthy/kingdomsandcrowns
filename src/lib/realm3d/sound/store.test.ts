import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUND } from "./settings";
import { debounceSave, makeSoundStore, realmCue, setRealmCue } from "./store";

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    set: (f: () => void) => {
      const id = next++;
      pending.set(id, f);
      return id;
    },
    clear: (id: number) => void pending.delete(id),
    run() {
      const fs = [...pending.values()];
      pending.clear();
      fs.forEach((f) => f());
    },
    get size() {
      return pending.size;
    },
  };
}

describe("the settings store", () => {
  it("tells its subscribers and the engine about a real change, and only a real one", () => {
    const changed = vi.fn();
    const store = makeSoundStore(DEFAULT_SOUND, changed);
    const sub = vi.fn();
    store.subscribe(sub);
    store.set({ music: 10 });
    expect(store.get().music).toBe(10);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(sub).toHaveBeenCalledTimes(1);
    store.set({ music: 10 });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("clamps what it is given", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    store.set({ master: 400 });
    expect(store.get().master).toBe(100);
  });

  it("shows a failed save until the next change", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    store.setError("That didn't save. Try again.");
    expect(store.error()).toMatch(/didn't save/);
    store.set({ muted: true });
    expect(store.error()).toBe("");
  });
});

describe("saving a slider", () => {
  it("saves once, after the child stops dragging, with the last value", () => {
    const t = fakeTimers();
    const save = vi.fn();
    const d = debounceSave<number>(save, 700, t);
    for (let v = 0; v <= 60; v += 5) d.push(v);
    expect(save).not.toHaveBeenCalled();
    t.run();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(60);
  });

  it("sends anything waiting on leaving, so the last move is never lost", () => {
    const t = fakeTimers();
    const save = vi.fn();
    const d = debounceSave<number>(save, 700, t);
    d.push(30);
    d.flush();
    expect(save).toHaveBeenCalledWith(30);
    d.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("a sound from deep in a panel", () => {
  it("does nothing with no Realm open, and reaches the Realm when there is one", () => {
    expect(() => realmCue("deed-right")).not.toThrow();
    const play = vi.fn();
    setRealmCue(play);
    realmCue("deed-wrong");
    expect(play).toHaveBeenCalledWith("deed-wrong");
    setRealmCue(null);
    realmCue("deed-right");
    expect(play).toHaveBeenCalledTimes(1);
  });
});
