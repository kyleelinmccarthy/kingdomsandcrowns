import { describe, expect, it } from "vitest";
import { TASK_CODECS } from "./codecs";
import { choiceKind } from "./choice";

describe("TASK_CODECS", () => {
  it("has a codec for every kind", () => {
    expect(Object.keys(TASK_CODECS)).toEqual(["choice", "measure"]);
  });

  it("choice trims on the way in and out, and compares trimmed", () => {
    const c = TASK_CODECS.choice;
    expect(c.encode(" 6 ")).toBe("6");
    expect(c.decode(" 6 ")).toBe("6");
    expect(c.sameResponse("6 ", " 6")).toBe(true);
    expect(c.sameResponse("6", "7")).toBe(false);
  });

  it("the choice definition delegates to the codec (no second copy)", () => {
    expect(choiceKind.encode).toBe(TASK_CODECS.choice.encode);
    expect(choiceKind.decode).toBe(TASK_CODECS.choice.decode);
    expect(choiceKind.sameResponse).toBe(TASK_CODECS.choice.sameResponse);
  });
});
