import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { castleShown, mountsFor, overrideAvatar, queryString, viewerFor } from "./overrides";

describe("the screenshot overrides", () => {
  it("restyles any avatar field by its short name, and fills in a missing #", () => {
    const a = overrideAvatar(DEFAULT_AVATAR, { outfit: "robe", outfitc: "ff0000", hair: ["afro", "bob"] });
    expect(a.outfit).toBe("robe");
    expect(a.outfitColor).toBe("#ff0000");
    expect(a.hairStyle).toBe("afro");
    expect(a.skinTone).toBe(DEFAULT_AVATAR.skinTone);
  });

  it("makes a parent a visitor whatever the query says", () => {
    expect(viewerFor(false, {})).toBe("parent");
    expect(viewerFor(false, { viewer: "child" })).toBe("parent");
  });

  it("dresses a child's own view as a visit only when asked", () => {
    expect(viewerFor(true, {})).toBe("child");
    expect(viewerFor(true, { viewer: "parent" })).toBe("parent");
  });

  it("follows the real castle rule unless a screenshot asks otherwise", () => {
    expect(castleShown(true, {})).toBe(true);
    expect(castleShown(false, {})).toBe(false);
    expect(castleShown(true, { castle: "0" })).toBe(false);
    expect(castleShown(false, { castle: "1" })).toBe(true);
  });

  it("rebuilds the query for the old address, keeping every key and repeat", () => {
    expect(queryString({})).toBe("");
    expect(queryString({ outfit: "robe", close: "", viewer: "parent", tag: ["a", "b"], gone: undefined })).toBe(
      "?outfit=robe&close=&viewer=parent&tag=a&tag=b",
    );
  });
});

describe("the mount overrides", () => {
  it("rides any mount in a screenshot, or none at all", () => {
    expect(overrideAvatar(DEFAULT_AVATAR, { mount: "wyrm", mountc: "ff0000" })).toMatchObject({ mount: "wyrm", mountColor: "#ff0000" });
    expect(overrideAvatar({ ...DEFAULT_AVATAR, mount: "pony" }, { mount: "none" }).mount).toBeNull();
    expect(overrideAvatar({ ...DEFAULT_AVATAR, mount: "pony" }, {}).mount).toBe("pony");
  });

  it("unlocks the screenshot's mount in development only", () => {
    expect(mountsFor(["pony"], { mount: "gryphon" }, true)).toEqual(["pony", "gryphon"]);
    expect(mountsFor(["pony"], { mount: "gryphon" }, false)).toEqual(["pony"]);
    expect(mountsFor(["pony"], { mount: "none" }, true)).toEqual(["pony"]);
  });
});
