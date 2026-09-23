import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";
import { DEFAULT_SOUND } from "@/lib/realm3d/sound/settings";

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
vi.mock("@/lib/services/realm-play", () => ({
  loadRealmSettings: async () => ({ ...DEFAULT_REALM_SETTINGS }),
  loadRealmFlags: async () => ({ helpSeenAt: null, starterSpellAt: null }),
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
  const rows = [[{ displayName: "Emma", avatarConfig: null }], []];
  let n = 0;
  const chain = { from: () => chain, where: () => chain, limit: async () => rows[n++ % 2] };
  return { db: { select: () => chain } };
});

import { getRealmBundle } from "./realm";

const as = (userId: string, permission: "edit" | "view") => ({ access: { userId, permission }, familyId: "f1" });

beforeEach(() => {
  requireChildAccess.mockReset();
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
