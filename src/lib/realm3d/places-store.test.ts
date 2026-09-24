import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePlacesStore } from "./places-store";

/** A server that answers with everything it holds, or fails while `down`. */
function fakeServer(held: string[] = []) {
  const db = new Set(held);
  const s = {
    down: false,
    calls: [] as string[][],
    save: vi.fn(async (ids: string[]) => {
      s.calls.push(ids);
      if (s.down) throw new Error("offline");
      for (const id of ids) db.add(id);
      return [...db];
    }),
    db,
  };
  return s;
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the places store", () => {
  it("starts from the database's list and shows a new find at once", async () => {
    const server = fakeServer(["farfurrow"]);
    const store = makePlacesStore({ initial: ["farfurrow"], save: server.save });
    const seen = vi.fn();
    store.subscribe(seen);
    const before = store.get();
    store.add("cove-12");
    expect(store.get()).not.toBe(before);
    expect([...store.get()].sort()).toEqual(["cove-12", "farfurrow"]);
    expect(seen).toHaveBeenCalled();
    await settle();
    expect(server.db.has("cove-12")).toBe(true);
    expect(store.unsaved()).toEqual([]);
  });

  it("ignores made-up ids and places already found", async () => {
    const server = fakeServer();
    const store = makePlacesStore({ initial: ["farfurrow"], save: server.save });
    store.add("nowhere");
    store.add("farfurrow");
    await settle();
    expect(server.save).not.toHaveBeenCalled();
    expect(store.get().size).toBe(1);
  });

  it("keeps a find made offline on the device, retries, and saves it when the server is back", async () => {
    const server = fakeServer();
    server.down = true;
    const persisted: string[][] = [];
    const store = makePlacesStore({ initial: [], save: server.save, persist: (ids) => persisted.push([...ids]) });
    store.add("appleway");
    await settle();
    expect(store.get().has("appleway")).toBe(true); // play never waits
    expect(store.unsaved()).toEqual(["appleway"]);
    expect(persisted.at(-1)).toEqual(["appleway"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.save).toHaveBeenCalledTimes(2);
    server.down = false;
    await vi.advanceTimersByTimeAsync(4000);
    expect(server.db.has("appleway")).toBe(true);
    expect(store.unsaved()).toEqual([]);
    expect(persisted.at(-1)).toEqual([]);
  });

  it("backs off, and a flush (reconnecting) goes at once", async () => {
    const server = fakeServer();
    server.down = true;
    const store = makePlacesStore({ initial: [], save: server.save });
    store.add("appleway");
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(server.save).toHaveBeenCalledTimes(3);
    server.down = false;
    store.flush();
    await settle();
    expect(server.db.has("appleway")).toBe(true);
  });

  it("sends a find made while a save is in flight straight after it", async () => {
    const server = fakeServer();
    const store = makePlacesStore({ initial: [], save: server.save });
    store.add("appleway");
    store.add("cove-12");
    await settle();
    await settle();
    expect(server.calls).toEqual([["appleway"], ["cove-12"]]);
    expect(store.unsaved()).toEqual([]);
  });

  it("carries what the device kept — an old visited list or an unsaved find — into the database once", async () => {
    const server = fakeServer(["farfurrow"]);
    const store = makePlacesStore({ initial: ["farfurrow"], carried: ["farfurrow", "summit-6", "junk"], save: server.save });
    expect([...store.get()].sort()).toEqual(["farfurrow", "summit-6"]);
    expect(store.unsaved()).toEqual(["summit-6"]);
    store.flush();
    await settle();
    expect(server.calls).toEqual([["summit-6"]]);
    expect(store.unsaved()).toEqual([]);
  });

  it("takes the server's answer: a place found on another device shows up", async () => {
    const server = fakeServer(["ringstones"]);
    const store = makePlacesStore({ initial: [], save: server.save });
    store.add("appleway");
    await settle();
    expect([...store.get()].sort()).toEqual(["appleway", "ringstones"]);
  });

  it("a visitor's finds are shown for the visit and written nowhere", async () => {
    const persist = vi.fn();
    const store = makePlacesStore({ initial: ["farfurrow"], save: null, persist });
    store.add("appleway");
    store.flush();
    await settle();
    expect(store.get().has("appleway")).toBe(true);
    expect(store.unsaved()).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
  });

  it("stops retrying once disposed, and keeps the unsaved find for next time", async () => {
    const server = fakeServer();
    server.down = true;
    const store = makePlacesStore({ initial: [], save: server.save });
    store.add("appleway");
    await settle();
    store.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(store.unsaved()).toEqual(["appleway"]);
    server.down = false;
    store.start();
    await settle();
    expect(server.db.has("appleway")).toBe(true);
  });
});
