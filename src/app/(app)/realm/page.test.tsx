import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

/**
 * What the Realm page hands the frame about who is looking. The page is a server component; it
 * is called as a function and the `RealmFrame` element it returns is read, never rendered.
 */
const getRealmBundle = vi.fn();
const resolveActiveChild = vi.fn();
vi.mock("@/lib/auth/actor", () => ({ requireActor: async () => ({ kind: "adult", userId: "u" }) }));
vi.mock("@/lib/actions/family", () => ({ getFamily: async () => ({ id: "f1" }) }));
vi.mock("@/lib/actions/resolve-child", () => ({ resolveActiveChild: (...a: unknown[]) => resolveActiveChild(...a) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmBundle: (...a: unknown[]) => getRealmBundle(...a) }));
vi.mock("@/lib/actions/castle", () => ({ getCastle: async () => null }));
vi.mock("@/components/realm3d/realm-frame", () => ({ RealmFrame: () => null }));
vi.mock("@/components/child-selector", () => ({ ChildSelector: () => null }));
vi.mock("@/components/switch-hero", () => ({ SwitchHero: () => null }));

import RealmPage from "./page";

const emma = { id: "c1", currentXp: 0 };
const bundle = (canEdit: boolean) => ({
  heroName: "Emma",
  avatarConfig: null,
  castleType: "campsite",
  kingdom: { tone: "gentle", buildings: [] },
  profile: {},
  settings: { enabled: true, toneMode: "gentle" },
  spellbook: { spells: [], slots: 1 },
  mounts: { unlocked: [] },
  ceremony: null,
  banners: 0,
  wornCrown: null,
  helpSeen: true,
  depthOverride: "auto",
  depth: "full",
  tutorialStep: 0,
  canEdit,
});

async function realmProp(): Promise<Record<string, unknown>> {
  const el = (await RealmPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ realm: Record<string, unknown> }>;
  return el.props.realm;
}

beforeEach(() => {
  resolveActiveChild.mockResolvedValue({ child: emma, allChildren: [emma], isChildView: false });
});

describe("/realm — may the viewer write?", () => {
  it("tells the frame a view-only member may not (viewerCanWrite false)", async () => {
    getRealmBundle.mockResolvedValue(bundle(false));
    expect((await realmProp()).viewerCanWrite).toBe(false);
  });

  it("tells the frame a grown-up with edit rights, or the hero, may", async () => {
    getRealmBundle.mockResolvedValue(bundle(true));
    expect((await realmProp()).viewerCanWrite).toBe(true);
    resolveActiveChild.mockResolvedValue({ child: emma, allChildren: [emma], isChildView: true });
    expect((await realmProp()).viewerCanWrite).toBe(true);
  });
});

describe("/realm — the rises the world still owes", () => {
  it("hands the frame the buildings waiting to rise and why, as the bundle read them", async () => {
    getRealmBundle.mockResolvedValue({ ...bundle(true), unannounced: ["well", "mill"], regraded: true });
    const realm = await realmProp();
    expect(realm.unannounced).toEqual(["well", "mill"]);
    expect(realm.regraded).toBe(true);
  });

  it("owes none, with no retro line, when a hand-built bundle carries neither", async () => {
    getRealmBundle.mockResolvedValue(bundle(true));
    const realm = await realmProp();
    expect(realm.unannounced).toEqual([]);
    expect(realm.regraded).toBe(false);
  });
});
