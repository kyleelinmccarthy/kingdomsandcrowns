import { describe, expect, it } from "vitest";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { cleanPlaceIds, isRealmPlaceId, legacyVisitedKey, readStoredPlaces, REALM_PLACE_IDS, retryDelayMs } from "./places-found";
import { visitedKey } from "@/lib/realm3d/riding";

describe("the Realm's place ids", () => {
  it("are exactly the generated island's landmarks", () => {
    expect([...REALM_PLACE_IDS].sort()).toEqual(realmWorld().landmarks.map((l) => l.id).sort());
    expect(REALM_PLACE_IDS).toHaveLength(19);
  });

  it("refuse anything made up", () => {
    for (const bad of ["village", "castle", "summit-1", "summit-60", "place-summit-6", "Ringstones", "", " ringstones", 7, null, undefined, {}]) {
      expect(isRealmPlaceId(bad)).toBe(false);
    }
    for (const ok of REALM_PLACE_IDS) expect(isRealmPlaceId(ok)).toBe(true);
  });

  it("cleans a list to real ids, once each", () => {
    expect(cleanPlaceIds(["ringstones", "ringstones", "x", 4, "cove-12"])).toEqual(["ringstones", "cove-12"]);
    expect(cleanPlaceIds("ringstones")).toEqual([]);
    expect(cleanPlaceIds(null)).toEqual([]);
  });

  it("reads a stored list defensively", () => {
    expect(readStoredPlaces(null)).toEqual([]);
    expect(readStoredPlaces("not json")).toEqual([]);
    expect(readStoredPlaces('{"a":1}')).toEqual([]);
    expect(readStoredPlaces('["farfurrow","nowhere","farfurrow"]')).toEqual(["farfurrow"]);
  });

  it("reads the mounts lane's old key, so what a child found before moves across", () => {
    expect(legacyVisitedKey("c1")).toBe(visitedKey("c1"));
  });

  it("backs off a failing save, up to a minute", () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});
