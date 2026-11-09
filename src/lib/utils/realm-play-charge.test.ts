import { describe, it, expect, vi, afterEach } from "vitest";
import { beaconPlayCharge, parsePlayCharge, REALM_PLAY_BEACON_PATH } from "./realm-play-charge";

const charge = { childId: "c1", minutes: 2 };

afterEach(() => {
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  vi.unstubAllGlobals();
});

describe("parsePlayCharge", () => {
  it("round-trips what the beacon sends and refuses anything else", () => {
    expect(parsePlayCharge(JSON.stringify(charge))).toEqual(charge);
    expect(parsePlayCharge("{")).toBeNull();
    expect(parsePlayCharge("null")).toBeNull();
    expect(parsePlayCharge(JSON.stringify({ ...charge, minutes: 31 }))).toBeNull();
    expect(parsePlayCharge(JSON.stringify({ ...charge, childId: "" }))).toBeNull();
  });

  it("ignores a date an old tab still sends: the server decides the day", () => {
    expect(parsePlayCharge(JSON.stringify({ ...charge, date: "2099-01-01" }))).toEqual(charge);
    expect(parsePlayCharge(JSON.stringify({ ...charge, date: "tomorrow" }))).toEqual(charge);
  });
});

describe("beaconPlayCharge", () => {
  it("falls back to a keepalive fetch where sendBeacon is missing or refuses", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", { value: () => false, configurable: true, writable: true });
    expect(beaconPlayCharge(charge)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(REALM_PLAY_BEACON_PATH, expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify(charge) }));
  });
});
