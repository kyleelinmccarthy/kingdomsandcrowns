import { describe, expect, it } from "vitest";
import { typingInto } from "./typing";

const input = (type: string) => Object.assign(document.createElement("input"), { type });

describe("typingInto: a key pressed into a field that takes text is the field's, not the game's", () => {
  it("is true for text fields, text areas, selects and editable content", () => {
    expect(typingInto(input("text"))).toBe(true);
    expect(typingInto(input("search"))).toBe(true);
    expect(typingInto(document.createElement("textarea"))).toBe(true);
    expect(typingInto(document.createElement("select"))).toBe(true);
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(typingInto(div)).toBe(true);
  });

  it("is false for a slider, a checkbox, a radio or a button, which take no text", () => {
    for (const t of ["range", "checkbox", "radio", "button", "submit"]) expect(typingInto(input(t)), t).toBe(false);
    expect(typingInto(document.createElement("button"))).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(typingInto(null)).toBe(false);
    expect(typingInto(window)).toBe(false);
  });
});
