import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MAIN_NAV } from "@/components/nav-items";
import { SiteCard, HERO_ONLY } from "@/components/realm/site-card";
import { DeedResults } from "@/components/deed-results";
import { VILLAGERS } from "@/lib/realm/villagers";
import { SIDE_QUEST, SIDE_QUESTS, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "./side-quest-copy";
import nextConfig from "../../../next.config";

afterEach(cleanup);

const building = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 2, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};

describe("side quest copy", () => {
  it("has the four nouns", () => {
    expect([SIDE_QUEST, SIDE_QUESTS, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER]).toEqual(["Side Quest", "Side Quests", "side quest", "side quests"]);
  });
  it("never says deed where a person reads", () => {
    for (const item of MAIN_NAV) expect(`${item.label} ${item.description}`).not.toMatch(/deed/i);
    expect(MAIN_NAV.find((i) => i.label === "Side Quests")?.href).toBe("/side-quests");
    expect(HERO_ONLY).toBe("Side quests are for the hero to play.");
    const card = render(<SiteCard villager={VILLAGERS[0]} building={building} preview={true} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(card.container.textContent).not.toMatch(/deed/i);
    cleanup();
    const results = render(<DeedResults summary={{ correctCount: 4, total: 5, flawless: false, masteryChanges: [], building: { label: "Village Well", done: 3, total: 5, complete: false } }} deedTitle="Count the Well Stones" area="math" onDone={() => {}} />);
    expect(results.container.textContent).toContain("Side quest done!");
    expect(results.container.textContent).toContain("Village Well: 3 of 5 side quests");
    expect(results.container.textContent).toContain("Back to side quests");
    expect(results.container.textContent).not.toMatch(/deed/i);
  });
  it("redirects the old deeds address for good", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({ source: "/deeds", destination: "/side-quests", permanent: true });
  });
});
