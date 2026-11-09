import { describe, it, expect } from "vitest";
import { minutesWord } from "./minutes-copy";

describe("minutesWord", () => {
  it("is singular for one minute only", () => {
    expect([0, 1, 2, 15].map(minutesWord)).toEqual(["minutes", "minute", "minutes", "minutes"]);
  });
});
