import { describe, expect, it } from "vitest";
import { LORE, LORE_IDS } from "./lore";

describe("the lore pages", () => {
  it("has ten pages, each under its own id", () => {
    expect(LORE_IDS).toHaveLength(10);
    expect(new Set(LORE_IDS).size).toBe(10);
    expect([...LORE_IDS].sort()).toEqual(Object.keys(LORE).sort());
  });

  it.each(LORE_IDS.map((id) => [id]))("%s is two to four short sentences under a short title", (id) => {
    const { title, text } = LORE[id];
    const sentences = text.split(/[.!?](?:\s|$)/).filter((s) => s.trim().length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
    expect(text.length).toBeLessThanOrEqual(320);
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(40);
  });

  it("never names a grade, or tells a child they are behind or ahead, and carries no markup", () => {
    for (const id of LORE_IDS) {
      for (const s of [LORE[id].title, LORE[id].text]) {
        expect(s, id).not.toMatch(/grade|kindergarten/i);
        expect(s, id).not.toMatch(/\b(behind|ahead)\b/i);
        expect(s, id).not.toMatch(/</);
      }
    }
  });
});
