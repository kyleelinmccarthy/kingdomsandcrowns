import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SideQuestMagic, magicLine } from "./side-quest-magic";
import { schoolLines } from "@/lib/utils/skills";

afterEach(cleanup);

describe("How side quests make magic", () => {
  it("derives one line per school from the area mapping", () => {
    expect(schoolLines()).toEqual([
      { school: "form", areas: ["math"] },
      { school: "element", areas: ["reading", "language"] },
      { school: "modifier", areas: ["science"] },
    ]);
    expect(magicLine("form", ["math"])).toBe("Math side quests unlock Forms: Bolt, Orb, Burst and more.");
    expect(magicLine("element", ["reading", "language"])).toBe("Reading and Language Arts side quests unlock Elements: Ember, Tide, Stone and more.");
    expect(magicLine("modifier", ["science"])).toBe("Science side quests unlock Modifiers.");
  });
  it("links every line to the Spellbook", () => {
    render(<SideQuestMagic spellbookHref="/spellbook?child=c1" />);
    expect(screen.getByText("How side quests make magic")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Open the Spellbook" });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/spellbook?child=c1");
  });
});
