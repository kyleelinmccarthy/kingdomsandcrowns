import { describe, expect, it } from "vitest";
import * as copy from "./rune-copy";

const NO_GRADE = /\bgrades?\b|\bkindergarten\b/i;
const NO_COMPARE = /\b(behind|ahead)\b/i;
const LABELS = ["the dark lantern", "the broken wagon", "the dry flower bed"];

/** Every string the module holds, plus every function's output for one to three labels. */
function everyLine(): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, v] of Object.entries(copy)) {
    if (typeof v === "string") out.push([name, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => out.push([`${name}[${i}]`, String(x)]));
    else if (typeof v === "function") {
      for (let n = 1; n <= 3; n++) {
        const labels = LABELS.slice(0, n);
        const call = name === "runeSetOffLine" ? () => copy.runeSetOffLine(labels) : name === "runeStopCount" ? () => copy.runeStopCount(n, 3) : () => (v as (s: string) => string)(labels[n - 1]);
        out.push([`${name}(${n})`, call()]);
      }
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) out.push([`${name}.${k}`, String(x)]);
  }
  return out;
}

describe("the rune copy", () => {
  it("is clean: no grade or band word, nobody behind or ahead, no markup", () => {
    const lines = everyLine();
    expect(lines.length).toBeGreaterThan(40);
    for (const [name, line] of lines) {
      expect(line, name).not.toMatch(NO_GRADE);
      expect(line, name).not.toMatch(NO_COMPARE);
      expect(line, name).not.toMatch(/</);
    }
  });

  it("says the Set off line for one, two and three things", () => {
    expect(copy.runeSetOffLine(LABELS)).toBe("Three things in the village need a rune: the dark lantern, the broken wagon and the dry flower bed. Walk to each one and cast it there.");
    expect(copy.runeSetOffLine(LABELS.slice(0, 2))).toBe("Two things in the village need a rune: the dark lantern and the broken wagon. Walk to each one and cast it there.");
    expect(copy.runeSetOffLine(LABELS.slice(0, 1))).toBe("Something in the village needs a rune: the dark lantern. Walk to it and cast it there.");
    expect(copy.runeSetOffLine([])).toBe("");
  });

  it("keeps the exact words the plan fixed", () => {
    expect(copy.RUNE_VERB).toBe("Cast a rune at");
    expect(copy.RUNE_LOOK_VERB).toBe("Look at");
    expect(copy.RUNE_TITLE).toBe("The rune stone");
    expect(copy.RUNE_STORY).toBe("Something here needs a rune. Build the word and cast it.");
    expect(copy.RUNE_HOLDS_LINE).toBe("The rune holds. In a few days it will need a fresh one.");
    expect(copy.RUNE_HOLDS_LINE_VISITOR).toBe("The rune holds here.");
    expect(copy.RUNE_NOT_NOW).toBe("No rune can be cast here just now.");
    expect(copy.RUNE_READING).toBe("The rune stone stirs…");
    expect(copy.RUNE_STONE_LABEL).toBe("The rune stone");
    expect(copy.RUNE_HELP).toBe("Tap the runes in order to build the word, then Cast.");
    expect(copy.RUNE_CAST).toBe("Cast");
    expect(copy.RUNE_CLEAR).toBe("Clear");
    expect(copy.RUNE_EMPTY_ROW).toBe("Your word goes here");
    expect(copy.RUNE_HEAR).toBe("Hear the word");
    expect(copy.RUNE_HEAR_MEANING).toBe("Hear the meaning");
    expect(copy.RUNE_NO_SOUND_LEAD).toBe("Sound is off. Read the word:");
    expect(copy.RUNE_SAME_WORD).toBe("You cast that word already. Try another.");
    expect(copy.RUNE_RETRY_LEAD).toBe("Not that word.");
    expect(copy.runeAnswerText("mend")).toBe("The word was mend.");
    expect(copy.RUNE_TRACKER_LABEL).toBe("Rune walk");
    expect(copy.runeStopCount(2, 3)).toBe("Rune 2 of 3");
    expect(copy.runeNextLine("the dark lantern")).toBe("Next: the dark lantern");
    expect(copy.runeFirstLine("the dark lantern")).toBe("First, the dark lantern.");
    expect(copy.RUNE_HOLDS_HERE).toBe("The rune holds here.");
    expect(copy.RUNE_LEAVE).toBe("Leave the rune walk");
    expect(copy.RUNE_FINISH).toBe("Finish the rune walk");
    expect(copy.RUNE_DONE).toBe("Done");
    expect(copy.RUNE_HIDE).toBe("Hide the list");
    expect(copy.RUNE_SHOW).toBe("Show the list");
    expect(copy.RUNE_WORKS).toBe("The rune works!");
    expect(copy.RUNE_FADES).toBe("The rune fades.");
    expect(copy.RUNE_FADES_LINE).toBe("Try again with a fresh word.");
    expect(copy.RUNE_ALREADY).toBe("The rune already held.");
  });

  it("gives every band its generic after-a-miss line, as the plan words them", () => {
    expect(copy.RUNE_GENERIC_WHY).toEqual({
      k1: "Say the word slowly: each sound is one rune.",
      g23: "Some sounds take two or three letters together. Listen for them.",
      g45: "Think what the meaning asks for, then spell it part by part.",
      g68: "A word's parts carry its meaning: the start, the root and the end.",
      g912: "Old roots carry the meaning; the start and the end shape the word.",
    });
  });

  it("names Pip's word in the demo", () => {
    expect(copy.RUNE_DEMO_COPY).toBe("Watch Pip build a rune. Pip hears the word hop, taps h, then o, then p, and casts it. It works!");
    expect(copy.RUNE_DEMO_COPY).toContain("hop");
    expect(copy.RUNE_DEMO_STEPS).toEqual(["Hear the word", "Tap the runes in order", "Cast"]);
  });
});
