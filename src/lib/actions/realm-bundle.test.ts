import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { DEFAULT_SOUND } from "@/lib/realm3d/sound/settings";
import { EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import type { Drawing } from "@/lib/utils/drawing";
import { todayInZone } from "@/lib/utils/dates";

/**
 * What `getRealmBundle` tells the page about WHO is looking: whether they may change the child's
 * Realm (`canEdit`), and whose sound settings to open with. Every read behind it is mocked.
 */
const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
const loadRealmSound = vi.fn(async () => ({ ...DEFAULT_SOUND }));
vi.mock("@/lib/services/realm-sound", () => ({ loadRealmSound: (...a: unknown[]) => (loadRealmSound as (...x: unknown[]) => unknown)(...a) }));
const loadPlacesFound = vi.fn(async (childId: string): Promise<string[]> => (childId ? ["farfurrow", "summit-6"] : []));
vi.mock("@/lib/services/realm-places", () => ({ loadPlacesFound: (childId: string) => loadPlacesFound(childId) }));
const loadRecentTroubleClears = vi.fn(async (childId: string) => childId ? [{ homeId: "rim-0", agoMs: 4_000 }] : []);
/** The hero's settings row, read once for the whole bundle (M-5). Null is "no row": the defaults. */
const SETTINGS_ROW = { pinnedPlan: "well-house", deliverySeenAt: null, regradedAt: new Date(1_700_000_000_000) };
const loadRealmSettingsRow = vi.fn(async () => SETTINGS_ROW);
const loadRealmSettings = vi.fn(async () => ({ ...DEFAULT_REALM_SETTINGS }));
vi.mock("@/lib/services/realm-play", () => ({
  loadRealmSettings: () => loadRealmSettings(),
  loadRealmSettingsRow: (...a: unknown[]) => (loadRealmSettingsRow as (...x: unknown[]) => unknown)(...a),
  loadRealmFlags: async () => ({ helpSeenAt: null, starterSpellAt: null }),
}));
vi.mock("@/lib/services/realm-troubles", () => ({
  loadRecentTroubleClears: (childId: string) => loadRecentTroubleClears(childId),
}));
const loadReviewDue = vi.fn<(childId: string) => Promise<boolean>>(async () => false);
vi.mock("@/lib/services/review", () => ({ loadReviewDue: (childId: string) => loadReviewDue(childId) }));
const loadFocusSkillIds = vi.fn<(childId: string) => Promise<string[]>>(async () => []);
vi.mock("@/lib/services/learning-focus", () => ({ loadFocusSkillIds: (childId: string) => loadFocusSkillIds(childId) }));
const loadRises = vi.fn<(childId: string) => Promise<{ unannounced: string[]; regraded: boolean }>>(async () => ({ unannounced: ["well", "mill"], regraded: true }));
vi.mock("@/lib/services/realm-rises", () => ({ loadRises: (...a: unknown[]) => (loadRises as (...x: unknown[]) => unknown)(...a) }));
const SOME_WORKS: Works = {
  balance: { stone: 3, ink: 1, herbs: 0, thread: 0, dye: 0, timber: 0 },
  built: { "well-house": 1 },
  plaques: [],
  pinned: "well-house",
  delivery: { rows: [{ materialId: "stone", amount: 3, title: "Fractions", origin: "quest" }], through: 1_700_000_000 },
};
const loadWorks = vi.fn<(childId: string) => Promise<Works>>(async () => SOME_WORKS);
vi.mock("@/lib/services/realm-materials", () => ({ loadWorks: (...a: unknown[]) => (loadWorks as (...x: unknown[]) => unknown)(...a) }));
/** The drawings the hall hangs: the service owns the limit, so the mock honours it like the real one. */
const HALL_DRAWINGS: Drawing[] = [1, 2, 3, 4, 5, 6].map((n) => ({ v: 1, strokes: [{ c: 0, w: 0, p: [n, n] }] }));
const loadHallDrawings = vi.fn<(childId: string, limit: number) => Promise<Drawing[]>>(async (_childId, limit) => HALL_DRAWINGS.slice(0, Math.max(0, limit)));
const RECENT = [{ assignmentId: "a1", title: "Volcanoes, part 2", material: "ink" as const }];
const loadRecentQuests = vi.fn<(childId: string) => Promise<typeof RECENT>>(async () => RECENT);
vi.mock("@/lib/services/realm-chronicle", () => ({
  loadHallDrawings: (...a: unknown[]) => (loadHallDrawings as (...x: unknown[]) => unknown)(...a),
  loadRecentQuests: (...a: unknown[]) => (loadRecentQuests as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/services/deeds", () => ({ loadKingdomOverview: async () => ({ tone: "gentle", buildings: [] }) }));
vi.mock("@/lib/services/learning-profile", () => ({ loadLearningProfileRow: async () => null }));
vi.mock("@/lib/services/spells", () => ({
  loadSpellbookPages: async () => ({ spells: [], slots: 1 }),
  ensureStarterSpell: async () => ({ flags: { helpSeenAt: null, starterSpellAt: null } }),
}));
vi.mock("@/lib/services/mounts", () => ({ loadUnlockedMountIds: async () => [] }));
vi.mock("@/lib/services/crowns", () => ({ loadSeasons: async () => [] }));
// Two selects: the child's row, then the castle's.
vi.mock("@/lib/db", () => {
  const rows = [[{ displayName: "Emma", avatarConfig: null, timezone: "America/Chicago" }], []];
  let n = 0;
  const chain = { from: () => chain, leftJoin: () => chain, where: () => chain, limit: async () => rows[n++ % 2] };
  return { db: { select: () => chain } };
});

import { getRealmBundle } from "./realm";

const as = (userId: string, permission: "edit" | "view") => ({ access: { userId, permission }, familyId: "f1" });

beforeEach(() => {
  requireChildAccess.mockReset();
  loadHallDrawings.mockClear();
  loadRealmSound.mockClear();
});

describe("getRealmBundle — who is looking", () => {
  it("lets the hero change their own Realm, with their own sound", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(b.canEdit).toBe(true);
    expect(loadRealmSound).toHaveBeenCalledWith("c1", null);
  });

  it("lets a grown-up with edit rights change it, with their own sound", async () => {
    requireChildAccess.mockResolvedValue(as("u-mom", "edit"));
    const b = await getRealmBundle("c1");
    expect(b.canEdit).toBe(true);
    expect(loadRealmSound).toHaveBeenCalledWith("c1", "u-mom");
  });

  it("tells the page a view-only grown-up may not, so the pause menu can leave the controls out", async () => {
    requireChildAccess.mockResolvedValue(as("u-tutor", "view"));
    const b = await getRealmBundle("c1");
    expect(b.canEdit).toBe(false);
    expect(loadRealmSound).toHaveBeenCalledWith("c1", "u-tutor");
  });
});

describe("getRealmBundle — the places found, and the earning copy's settings", () => {
  it("carries the hero's found places, read from the database, to whoever is looking", async () => {
    for (const who of [as("child:c1", "edit"), as("u-mom", "edit")]) {
      requireChildAccess.mockResolvedValue(who);
      const b = await getRealmBundle("c1");
      expect(b.placesFound).toEqual(["farfurrow", "summit-6"]);
    }
    expect(loadPlacesFound).toHaveBeenCalledWith("c1");
  });

  it("opens with none found when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadPlacesFound.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.placesFound).toEqual([]);
  });

  it("hands the earning copy the settings it reads, from the row already loaded", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(b.earning).toEqual({
      enabled: DEFAULT_REALM_SETTINGS.enabled,
      accessMode: DEFAULT_REALM_SETTINGS.accessMode,
      earnedMinutesPerQuest: DEFAULT_REALM_SETTINGS.earnedMinutesPerQuest,
      dailyCapMinutes: DEFAULT_REALM_SETTINGS.dailyCapMinutes,
      troubleBonusCapMinutes: DEFAULT_REALM_SETTINGS.troubleBonusCapMinutes,
      dailyAllowanceMinutes: DEFAULT_REALM_SETTINGS.dailyAllowanceMinutes,
      minutesPerStar: DEFAULT_REALM_SETTINGS.minutesPerStar,
      sideQuestDailyCapMinutes: DEFAULT_REALM_SETTINGS.sideQuestDailyCapMinutes,
      bankCapMinutes: DEFAULT_REALM_SETTINGS.bankCapMinutes,
      // The kingdom lead line (`KINGDOM_LEAD_LINE`) reads it.
      materialsPerQuest: DEFAULT_REALM_SETTINGS.materialsPerQuest,
    });
  });
});

describe("getRealmBundle — the troubles cleared a moment ago", () => {
  it("carries the hero's recent clears to whoever is looking, so a reload keeps them cleared", async () => {
    for (const who of [as("child:c1", "edit"), as("u-mom", "edit"), as("u-tutor", "view")]) {
      requireChildAccess.mockResolvedValue(who);
      const b = await getRealmBundle("c1");
      expect(b.troubleClears).toEqual([{ homeId: "rim-0", agoMs: 4_000 }]);
    }
    expect(loadRecentTroubleClears).toHaveBeenCalledWith("c1");
  });

  it("opens with none remembered when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadRecentTroubleClears.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.troubleClears).toEqual([]);
  });
});

describe("getRealmBundle — whether the riddle stones glow", () => {
  it("says whether anything learned is due for review, read once with the bundle's own access", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadReviewDue.mockResolvedValueOnce(true);
    const b = await getRealmBundle("c1");
    expect(b.reviewDue).toBe(true);
    expect(loadReviewDue).toHaveBeenCalledWith("c1");
    expect(requireChildAccess).toHaveBeenCalledTimes(1);
  });

  it("leaves the stones dark when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadReviewDue.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.reviewDue).toBe(false);
  });
});

describe("getRealmBundle — the strands the beacon leans toward", () => {
  it("hands over the strands of the hero's focus skills, with the bundle's own access", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadFocusSkillIds.mockResolvedValueOnce(["mul-facts", "div-facts", "sight-k1"]);
    const b = await getRealmBundle("c1");
    expect(b.focusAreas).toEqual(["math", "reading"]);
    expect(loadFocusSkillIds).toHaveBeenCalledWith("c1");
    expect(requireChildAccess).toHaveBeenCalledTimes(1);
  });

  it("has none when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadFocusSkillIds.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.focusAreas).toEqual([]);
  });
});

describe("getRealmBundle — the family's clock", () => {
  it("carries the family's timezone, for the island's day and night", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    expect((await getRealmBundle("c1")).timezone).toBe("America/Chicago");
  });
});

describe("getRealmBundle — the rises the world still owes the hero", () => {
  it("carries the buildings waiting to be shown rising, and whether the migration finished them", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(b.unannounced).toEqual(["well", "mill"]);
    expect(b.regraded).toBe(true);
    expect(loadRises).toHaveBeenCalledWith("c1", expect.any(Promise));
  });

  it("owes none when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadRises.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.unannounced).toEqual([]);
    expect(b.regraded).toBe(false);
  });
});

describe("getRealmBundle — the works: satchel, plaques, pinned plan, delivery", () => {
  it("carries the hero's works as loadWorks read them", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(b.works).toEqual(SOME_WORKS);
    expect(loadWorks).toHaveBeenCalledWith("c1", expect.any(Promise));
  });

  it("reads the settings row once, and hands that one read to the works and the rises (M-5)", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadRealmSettingsRow.mockClear();
    loadRealmSettings.mockClear();
    await getRealmBundle("c1");
    expect(loadRealmSettingsRow).toHaveBeenCalledTimes(1);
    expect(loadRealmSettingsRow).toHaveBeenCalledWith("c1");
    expect(loadRealmSettings).not.toHaveBeenCalled();
    const worksRow = loadWorks.mock.lastCall![1 as never] as unknown as Promise<unknown>;
    const risesRow = loadRises.mock.lastCall![1 as never] as unknown as Promise<unknown>;
    expect(worksRow).toBe(risesRow);
    expect(await worksRow).toBe(SETTINGS_ROW);
  });

  it("is empty works when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadWorks.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.works).toEqual(EMPTY_WORKS);
  });
});

describe("getRealmBundle — the drawings the Chronicle Hall hangs", () => {
  it("asks for two drawings per built level of the hall, and hands them over as read", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadWorks.mockResolvedValueOnce({ ...SOME_WORKS, built: { "well-house": 1, "chronicle-hall": 2 } });
    const b = await getRealmBundle("c1");
    expect(loadHallDrawings).toHaveBeenCalledWith("c1", 4);
    expect(b.hallDrawings).toEqual(HALL_DRAWINGS.slice(0, 4));
  });

  it("asks for none while the hall is not built, so the read has nothing to do", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(loadHallDrawings).toHaveBeenCalledWith("c1", 0);
    expect(b.hallDrawings).toEqual([]);
  });

  it("is none when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadWorks.mockResolvedValueOnce({ ...SOME_WORKS, built: { "chronicle-hall": 3 } });
    loadHallDrawings.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.hallDrawings).toEqual([]);
  });

  it("is none when the works failed to load, because no hall is known to stand", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadWorks.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(loadHallDrawings).toHaveBeenCalledWith("c1", 0);
    expect(b.hallDrawings).toEqual([]);
  });
});

describe("getRealmBundle — what the villagers have heard", () => {
  it("carries the quests finished lately, as read, and the family's day", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    const b = await getRealmBundle("c1");
    expect(loadRecentQuests).toHaveBeenCalledWith("c1");
    expect(b.recentQuests).toEqual(RECENT);
    // The server's day in the hero's own time zone (the mock's family is in Chicago), never the device's.
    expect(b.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.today).toBe(todayInZone("America/Chicago", new Date()));
  });

  it("is none when the read fails, rather than closing the Realm", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    loadRecentQuests.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await getRealmBundle("c1");
    spy.mockRestore();
    expect(b.recentQuests).toEqual([]);
  });
});
