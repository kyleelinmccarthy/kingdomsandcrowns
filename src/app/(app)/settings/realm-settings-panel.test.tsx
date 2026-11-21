import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmSettingsPanel } from "./realm-settings-panel";
import { HANDS_ON_KINDS } from "@/lib/tasks/kinds";
import {
  ALLOWANCE_RANGE,
  BANK_CAP_RANGE,
  DEFAULT_REALM_SETTINGS,
  MATERIALS_PER_QUEST_RANGE,
  MINUTES_PER_STAR_RANGE,
  SIDE_QUEST_LENGTH_RANGE,
  SIDE_QUEST_PAY_CAP_RANGE,
  type RealmSettings,
} from "@/lib/utils/realm-settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const updateRealmSettings = vi.fn().mockResolvedValue(undefined);
const resetRealmHelp = vi.fn();
vi.mock("@/lib/actions/realm-settings", () => ({
  updateRealmSettings: (...a: unknown[]) => updateRealmSettings(...a),
  resetRealmHelp: (...a: unknown[]) => resetRealmHelp(...a),
}));
const grantRealmMinutes = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/realm-play", () => ({
  grantRealmMinutes: (...a: unknown[]) => grantRealmMinutes(...a),
}));

const summary = { date: "2026-09-02", balance: 10, spent: 5 };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RealmSettingsPanel", () => {
  it("hides minutes-per-quest in scheduled mode", () => {
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode: "scheduled" }} summary={summary} />);
    expect(screen.queryByLabelText(/minutes per quest/i)).not.toBeInTheDocument();
  });

  it("shows minutes-per-quest in earned mode and saves a mode change", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByLabelText(/minutes per quest/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /both/i }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { accessMode: "both" });
  });

  it("saves a switch to open mode", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("radio", { name: /open/i }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { accessMode: "open" });
  });

  it("hides minutes-per-quest in open mode", () => {
    // Open never consults the ledger, so a per-quest rate has nothing to govern.
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode: "open" }} summary={summary} />);
    expect(screen.queryByLabelText(/minutes per quest/i)).not.toBeInTheDocument();
  });

  it("lets a parent set how many minutes a day clearing troubles may earn, where minutes count", async () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    const field = screen.getByLabelText(/minutes a day from clearing troubles/i);
    expect(field).toHaveValue(5);
    fireEvent.change(field, { target: { value: "0" } });
    const save = field.closest("div.mt-3")!.querySelector("button")!;
    fireEvent.click(save);
    await waitFor(() => expect(updateRealmSettings).toHaveBeenCalledWith("c1", { troubleBonusCapMinutes: 0 }));
    cleanup();
    // Open and scheduled never read the ledger, so clearing earns nothing there and the field is not offered.
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode: "open" }} summary={summary} />);
    expect(screen.queryByLabelText(/minutes a day from clearing troubles/i)).not.toBeInTheDocument();
  });

  it("lets a grown-up choose side-quest length, bounded by the range, and saves only that", async () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByRole("group", { name: "Side quests" })).toBeInTheDocument();
    const field = screen.getByLabelText("Questions in a side quest");
    expect(field).toHaveValue(8);
    expect(field).toHaveAttribute("min", String(SIDE_QUEST_LENGTH_RANGE.min));
    expect(field).toHaveAttribute("max", String(SIDE_QUEST_LENGTH_RANGE.max));
    expect(screen.getByText("Shorter side quests suit younger heroes. Changes apply to the next side quest.")).toBeInTheDocument();
    const save = field.closest("div.flex")!.querySelector("button")!;
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.click(save);
    await waitFor(() => expect(updateRealmSettings).toHaveBeenCalledWith("c1", { sideQuestLength: 5 }));
  });

  it("lets a grown-up turn second chances off and on, saving only that", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByText("A wrong first answer gets a hint and one more try.")).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Second chances" });
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { secondChances: false });
    cleanup();
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, secondChances: false }} summary={summary} />);
    await user.click(screen.getByRole("switch", { name: "Second chances" }));
    expect(updateRealmSettings).toHaveBeenLastCalledWith("c1", { secondChances: true });
  });

  it("offers Building by measuring in the Side quests group, on by default, and saves only that kind", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    const group = screen.getByRole("group", { name: "Side quests" });
    expect(within(group).getByText("Math side quests are played at the bench.")).toBeInTheDocument();
    const sw = within(group).getByRole("switch", { name: "Building by measuring" });
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { mechanics: { measure: false } });
    cleanup();
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: false, lock: true } }} summary={summary} />);
    const off = screen.getByRole("switch", { name: "Building by measuring" });
    expect(off).not.toBeChecked();
    await user.click(off);
    expect(updateRealmSettings).toHaveBeenLastCalledWith("c1", { mechanics: { measure: true } });
  });

  it("offers Solving logic locks beside it, on by default, and saves only that kind", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    const group = screen.getByRole("group", { name: "Side quests" });
    // Says what Off does, everywhere it reaches, and that nothing found is lost (final f8).
    expect(
      within(group).getByText(
        "Science sorts and logic puzzles on a lock's face. Off: science plays as multiple choice, Puzzle practice is hidden, and the Realm's chests, vault doors and Tower puzzles rest. Anything already found stays.",
      ),
    ).toBeInTheDocument();
    const sw = within(group).getByRole("switch", { name: "Solving logic locks" });
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(updateRealmSettings).toHaveBeenLastCalledWith("c1", { mechanics: { lock: false } });
    cleanup();
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, mechanics: { measure: true, lock: false } }} summary={summary} />);
    expect(screen.getByRole("switch", { name: "Solving logic locks" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Building by measuring" })).toBeChecked();
  });

  it("has one switch row for every hands-on kind", () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    const group = screen.getByRole("group", { name: "Side quests" });
    // Second chances plus one per hands-on kind.
    expect(within(group).getAllByRole("switch")).toHaveLength(1 + HANDS_ON_KINDS.length);
  });

  describe("Real work", () => {
    it("is its own group, ahead of Side quests, with the materials count and the minutes switch", () => {
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
      const group = screen.getByRole("group", { name: "Real work" });
      const field = screen.getByLabelText("Materials per quest");
      expect(group).toContainElement(field);
      expect(field).toHaveValue(DEFAULT_REALM_SETTINGS.materialsPerQuest);
      expect(field).toHaveAttribute("min", String(MATERIALS_PER_QUEST_RANGE.min));
      expect(field).toHaveAttribute("max", String(MATERIALS_PER_QUEST_RANGE.max));
      expect(within(group).getByText("0 turns this off.")).toBeInTheDocument();
      const sw = within(group).getByRole("switch", { name: "Show Realm minutes on quests" });
      expect(sw).not.toBeChecked();
      const side = screen.getByRole("group", { name: "Side quests" });
      expect(group.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("saves exactly materialsPerQuest when the count changes", async () => {
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
      const field = screen.getByLabelText("Materials per quest");
      const save = field.closest("div.flex")!.querySelector("button")!;
      expect(save).toBeDisabled();
      fireEvent.change(field, { target: { value: "3" } });
      fireEvent.click(save);
      await waitFor(() => expect(updateRealmSettings).toHaveBeenCalledWith("c1", { materialsPerQuest: 3 }));
      expect(updateRealmSettings).toHaveBeenCalledTimes(1);
    });

    it("saves the minutes switch, on and off", async () => {
      const user = userEvent.setup();
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
      await user.click(screen.getByRole("switch", { name: "Show Realm minutes on quests" }));
      expect(updateRealmSettings).toHaveBeenCalledWith("c1", { showMinutesOnQuests: true });
      cleanup();
      render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, showMinutesOnQuests: true }} summary={summary} />);
      const sw = screen.getByRole("switch", { name: "Show Realm minutes on quests" });
      expect(sw).toBeChecked();
      await user.click(sw);
      expect(updateRealmSettings).toHaveBeenLastCalledWith("c1", { showMinutesOnQuests: false });
    });

    it.each(["scheduled", "open"] as const)("is shown in %s mode too (materials are not minutes)", (accessMode) => {
      render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode }} summary={summary} />);
      expect(screen.getByLabelText("Materials per quest")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Show Realm minutes on quests" })).toBeInTheDocument();
    });
  });

  describe("Earning time", () => {
    const FIELDS: { label: string; key: keyof RealmSettings; range: { min: number; max: number }; value: number }[] = [
      { label: "Free minutes each day", key: "dailyAllowanceMinutes", range: ALLOWANCE_RANGE, value: DEFAULT_REALM_SETTINGS.dailyAllowanceMinutes },
      { label: "Minutes per side-quest star", key: "minutesPerStar", range: MINUTES_PER_STAR_RANGE, value: DEFAULT_REALM_SETTINGS.minutesPerStar },
      { label: "Most minutes side quests can earn a day", key: "sideQuestDailyCapMinutes", range: SIDE_QUEST_PAY_CAP_RANGE, value: DEFAULT_REALM_SETTINGS.sideQuestDailyCapMinutes },
      { label: "Most unspent minutes kept for tomorrow", key: "bankCapMinutes", range: BANK_CAP_RANGE, value: DEFAULT_REALM_SETTINGS.bankCapMinutes },
    ];

    it("is a group of four fields, each with its range and a one-line hint", () => {
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
      const group = screen.getByRole("group", { name: "Earning time" });
      for (const f of FIELDS) {
        const field = screen.getByLabelText(f.label);
        expect(group).toContainElement(field);
        expect(field).toHaveValue(f.value);
        expect(field).toHaveAttribute("min", String(f.range.min));
        expect(field).toHaveAttribute("max", String(f.range.max));
      }
      // Four in Earning time, one more under Real work's materials count.
      expect(within(group).getAllByText("0 turns this off.")).toHaveLength(4);
      expect(screen.getAllByText("0 turns this off.")).toHaveLength(5);
      // The per-quest rate is part of the group, not the access-mode picker.
      expect(group).toContainElement(screen.getByLabelText(/minutes per quest/i));
    });

    it.each(FIELDS)("saves exactly $key when $label changes", async ({ label, key, range }) => {
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
      const field = screen.getByLabelText(label);
      const save = field.closest("div.flex")!.querySelector("button")!;
      expect(save).toBeDisabled();
      fireEvent.change(field, { target: { value: String(range.max) } });
      fireEvent.click(save);
      await waitFor(() => expect(updateRealmSettings).toHaveBeenCalledWith("c1", { [key]: range.max }));
      expect(updateRealmSettings).toHaveBeenCalledTimes(1);
    });

    it.each(["scheduled", "open"] as const)("is replaced by a short note in %s mode", (accessMode) => {
      render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode }} summary={summary} />);
      expect(screen.getByText("Earning time applies when minutes are earned.")).toBeInTheDocument();
      for (const f of FIELDS) expect(screen.queryByLabelText(f.label)).not.toBeInTheDocument();
    });

    it("shows today's free minutes and what was kept from yesterday in the summary", () => {
      render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={{ ...summary, allowance: 10, carried: 7 }} />);
      expect(screen.getByText(/10 free minutes today/i)).toBeInTheDocument();
      expect(screen.getByText(/7 kept from yesterday/i)).toBeInTheDocument();
    });
  });

  it("grants minutes for today", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("button", { name: /grant 15/i }));
    expect(grantRealmMinutes).toHaveBeenCalledWith("c1", 15);
  });

  it("shows today's balance and spent minutes", () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByText(/10 minutes banked/i)).toBeInTheDocument();
    expect(screen.getByText(/5 of 30 played/i)).toBeInTheDocument();
  });

  it("lets a parent show the how-to-play card again", async () => {
    resetRealmHelp.mockResolvedValue(undefined);
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the how-to-play card again" }));
    await waitFor(() => expect(resetRealmHelp).toHaveBeenCalledWith("c1"));
  });

  it("offers three ways the Realm can look, with the stored one checked", () => {
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, depthOverride: "simple" }} summary={summary} />);
    expect(screen.getByRole("radio", { name: "Automatic" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Simple" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Everything" })).not.toBeChecked();
    expect(screen.getByText("Simple at first, everything once they know the world.")).toBeInTheDocument();
    expect(screen.getByText("Fewer numbers, one thing at a time.")).toBeInTheDocument();
    expect(screen.getByText("More numbers, more to do.")).toBeInTheDocument();
  });

  it("saves a change to how much the Realm shows", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("radio", { name: "Simple" }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { depthOverride: "simple" });
  });

  it("never says the word depth on screen", () => {
    const { container } = render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(container.textContent?.toLowerCase()).not.toContain("depth");
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")?.toLowerCase()).not.toContain("depth");
    }
  });
});
