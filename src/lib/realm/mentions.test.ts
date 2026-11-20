import { describe, it, expect } from "vitest";
import { mentionLine, pickMention, type RecentQuest } from "./mentions";
import { VILLAGERS, villagerById } from "./villagers";
import { MATERIAL_IDS } from "./materials";

const quest = (assignmentId: string, title: string, material: RecentQuest["material"]): RecentQuest => ({ assignmentId, title, material });
const NONE: ReadonlySet<string> = new Set();

describe("pickMention", () => {
  it("is null with no recent quests", () => {
    expect(pickMention({ villagerId: "hesper", recent: [], said: NONE, date: "2026-11-19" })).toBeNull();
  });

  it("is null when no recent quest is in the villager's trade", () => {
    // Hesper keeps the library (ink); she has nothing to say about a stone quest.
    expect(pickMention({ villagerId: "hesper", recent: [quest("a1", "Fractions", "stone")], said: NONE, date: "2026-11-19" })).toBeNull();
  });

  it("is null for a villager that does not exist", () => {
    expect(pickMention({ villagerId: "nobody", recent: [quest("a1", "Fractions", "stone")], said: NONE, date: "2026-11-19" })).toBeNull();
  });

  it("mentions the quest by its title, in the villager's own words", () => {
    const got = pickMention({ villagerId: "hesper", recent: [quest("a1", "Volcanoes, part 2", "ink")], said: NONE, date: "2026-11-19" });
    expect(got?.assignmentId).toBe("a1");
    expect(got?.line).toContain("Volcanoes, part 2");
    expect(got?.line).not.toContain("{quest}");
  });

  it("puts the title in as plain text, never as markup or a replacement pattern", () => {
    const title = `<b>$&</b> $1 {quest} <img src=x onerror=alert(1)>`;
    const got = pickMention({ villagerId: "hesper", recent: [quest("a1", title, "ink")], said: NONE, date: "2026-11-19" });
    expect(got?.line).toContain(title);
  });

  it("is deterministic by date and villager", () => {
    const recent = [quest("a1", "One", "ink"), quest("a2", "Two", "ink"), quest("a3", "Three", "ink")];
    const first = pickMention({ villagerId: "hesper", recent, said: NONE, date: "2026-11-19" });
    for (let i = 0; i < 5; i++) expect(pickMention({ villagerId: "hesper", recent, said: NONE, date: "2026-11-19" })).toEqual(first);
  });

  it("can choose differently on different days", () => {
    const recent = Array.from({ length: 8 }, (_, i) => quest(`a${i}`, `Quest ${i}`, "ink"));
    const days = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"];
    const picks = new Set(days.map((date) => pickMention({ villagerId: "hesper", recent, said: NONE, date })?.assignmentId));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("never mentions a quest that was already said today", () => {
    const recent = [quest("a1", "One", "ink"), quest("a2", "Two", "ink")];
    const got = pickMention({ villagerId: "hesper", recent, said: new Set(["a1"]), date: "2026-11-19" });
    expect(got?.assignmentId).toBe("a2");
    expect(pickMention({ villagerId: "hesper", recent, said: new Set(["a1", "a2"]), date: "2026-11-19" })).toBeNull();
  });

  it("gives at most one mention: one line about one quest", () => {
    const recent = [quest("a1", "One", "ink"), quest("a2", "Two", "ink")];
    const got = pickMention({ villagerId: "hesper", recent, said: NONE, date: "2026-11-19" });
    expect(got).not.toBeNull();
    expect(Object.keys(got!).sort()).toEqual(["assignmentId", "line"]);
    const titles = ["One", "Two"].filter((t) => got!.line.includes(t));
    expect(titles).toHaveLength(1);
  });

  it("never repeats a quest across villagers in one day when each said is fed to the next", () => {
    // The hero finished one quest in each of four materials; every villager is asked in turn.
    const recent = [quest("q-ink", "Spelling", "ink"), quest("q-herbs", "Seeds", "herbs"), quest("q-stone", "Fractions", "stone"), quest("q-timber", "Carpentry", "timber")];
    const said = new Set<string>();
    const heard: string[] = [];
    for (const v of VILLAGERS) {
      const got = pickMention({ villagerId: v.id, recent, said, date: "2026-11-19" });
      if (!got) continue;
      expect(said.has(got.assignmentId)).toBe(false);
      said.add(got.assignmentId);
      heard.push(got.assignmentId);
    }
    expect(new Set(heard).size).toBe(heard.length);
    // Each of the four quests is heard by some villager, none is left out and none twice.
    expect([...heard].sort()).toEqual(["q-herbs", "q-ink", "q-stone", "q-timber"]);
  });

  it("drops the full stop after the closing quote when the title already ends a sentence", () => {
    for (const end of [".", "?", "!"]) {
      const got = pickMention({ villagerId: "hesper", recent: [quest("a1", `Why do volcanoes erupt${end}`, "ink")], said: NONE, date: "2026-11-19" });
      expect(got!.line).toContain(`erupt${end}’`);
      expect(got!.line).not.toContain(`${end}’.`);
    }
  });

  it("leaves the villager's line exactly as written for a title that does not end in a stop", () => {
    const got = pickMention({ villagerId: "hesper", recent: [quest("a1", "Volcanoes", "ink")], said: NONE, date: "2026-11-19" });
    expect(villagerById("hesper")!.mentions.ink!.map((l) => l.replace("{quest}", "‘Volcanoes’"))).toContain(got!.line);
  });

  it("never doubles a stop, whichever line the villager says", () => {
    for (const v of VILLAGERS) {
      for (const [material, lines] of Object.entries(v.mentions)) {
        // Days 1 to 28 reach every line the villager has for the material.
        for (let day = 1; day <= 28; day++) {
          const got = pickMention({ villagerId: v.id, recent: [quest("a1", "Why?", material as RecentQuest["material"])], said: NONE, date: `2026-11-${String(day).padStart(2, "0")}` });
          expect(got!.line, `${v.id} ${material} ${lines!.length}`).not.toMatch(/[.?!]’\./);
        }
      }
    }
  });

  it("caps a long title at 60 characters with an ellipsis, and leaves a short one alone", () => {
    const long = "A very long quest title that goes on and on about the volcanoes of the world and more";
    const got = pickMention({ villagerId: "hesper", recent: [quest("a1", long, "ink")], said: NONE, date: "2026-11-19" });
    const shown = /‘([^’]*)’/.exec(got!.line)![1];
    expect(shown.length).toBeLessThanOrEqual(60);
    expect(shown.endsWith("…")).toBe(true);
    expect(long.startsWith(shown.slice(0, -1))).toBe(true);
    const exactly60 = "x".repeat(60);
    expect(pickMention({ villagerId: "hesper", recent: [quest("a1", exactly60, "ink")], said: NONE, date: "2026-11-19" })!.line).toContain(`‘${exactly60}’`);
  });

  it("does not mention a quest with no title at all", () => {
    expect(pickMention({ villagerId: "hesper", recent: [quest("a1", "", "ink"), quest("a2", "   ", "ink")], said: NONE, date: "2026-11-19" })).toBeNull();
  });

  it("falls to the quest in the trade, not to the newest one that is not", () => {
    const recent = [quest("a1", "Fractions", "stone"), quest("a2", "Poems", "ink")];
    expect(pickMention({ villagerId: "hesper", recent, said: NONE, date: "2026-11-19" })?.assignmentId).toBe("a2");
    expect(pickMention({ villagerId: "gerd", recent, said: NONE, date: "2026-11-19" })?.assignmentId).toBe("a1");
  });
});

describe("mentionLine: every authored line, as the talk panel shows it", () => {
  const every = VILLAGERS.flatMap((v) => Object.values(v.mentions).flatMap((lines) => lines!.map((line) => ({ who: v.id, line }))));
  const LONG = "A very long quest title that goes on and on about the volcanoes of the world and more";
  const TITLES = ["Chapter Book Reading", "Map Drawing Day", "Why do volcanoes erupt?", "Done.", "Wow!", LONG];
  const count = (text: string, ch: string) => text.split(ch).length - 1;

  it("holds no quote marks of its own: the title is wrapped in code, once", () => {
    expect(every.length).toBeGreaterThan(20);
    for (const { who, line } of every) expect(line, `${who}: ${line}`).not.toMatch(/[“”‘’"]/);
  });

  it("wraps the title in exactly one opening and one closing quote, nested inside the speech's own quotes", () => {
    for (const { who, line } of every) {
      for (const title of TITLES) {
        const said = mentionLine(line, title);
        // The talk panel wraps the whole speech in double quotes (`deed-board.tsx`).
        const speech = `“${said}”`;
        const at = `${who}: ${speech}`;
        expect(count(said, "‘"), at).toBe(1);
        expect(count(said, "’"), at).toBe(1);
        expect(count(speech, "“"), at).toBe(1);
        expect(count(speech, "”"), at).toBe(1);
        expect(speech, at).not.toMatch(/““|””/);
        const shown = /‘([^’]*)’/.exec(said)![1];
        expect(title === LONG ? shown.endsWith("…") && LONG.startsWith(shown.slice(0, -1)) : shown === title, at).toBe(true);
      }
    }
  });

  it("never doubles a stop or a comma around the title", () => {
    for (const { who, line } of every) {
      for (const title of TITLES) {
        const said = mentionLine(line, title);
        expect(said, `${who}: ${said}`).not.toMatch(/[.?!…]’[.,!?]/);
        expect(said, `${who}: ${said}`).not.toMatch(/\.\.|,,|[.!?],|,[.!?]|\s[.,!?]/);
      }
    }
  });
});

describe("what each villager cares about", () => {
  const trade: Record<string, string> = { hesper: "ink", ivy: "herbs", pip: "thread", wren: "dye", gerd: "stone", bram: "stone", aldo: "timber", tessa: "timber" };

  it("every villager has 2 or 3 lines for their own material", () => {
    for (const v of VILLAGERS) {
      const lines = v.mentions[trade[v.id] as keyof typeof v.mentions];
      expect(lines?.length, v.id).toBeGreaterThanOrEqual(2);
      expect(lines!.length, v.id).toBeLessThanOrEqual(3);
    }
  });

  it("every line carries the {quest} token once, only names known materials, and never judges", () => {
    for (const v of VILLAGERS) {
      for (const [material, lines] of Object.entries(v.mentions)) {
        expect(MATERIAL_IDS as readonly string[], `${v.id} ${material}`).toContain(material);
        expect(lines!.length, `${v.id} ${material}`).toBeGreaterThanOrEqual(2);
        expect(lines!.length, `${v.id} ${material}`).toBeLessThanOrEqual(3);
        for (const line of lines!) {
          expect(line.split("{quest}").length - 1, line).toBe(1);
          expect(line, line).not.toMatch(/behind|ahead|\blate\b|failed|should have/i);
        }
      }
    }
  });
});
