import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { isValidElement } from "react";

// The page is a server component, so everything it reaches for at module load
// (auth, DB-backed actions) is stubbed — the assertions below are about the
// element tree it builds, not about any data it fetches.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/quests",
}));
vi.mock("@/lib/auth/actor", () => ({ requireActor: vi.fn().mockResolvedValue({ kind: "adult" }) }));
vi.mock("@/lib/actions/family", () => ({ getFamily: vi.fn().mockResolvedValue({ id: "fam-1" }) }));
vi.mock("@/lib/actions/resolve-child", () => ({ resolveActiveChild: vi.fn() }));
vi.mock("@/lib/actions/subjects", () => ({ getSubjects: vi.fn() }));
vi.mock("@/lib/actions/activities", () => ({
  getRecentActivities: vi.fn(),
  updateActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));
vi.mock("@/lib/actions/quest-assignments", () => ({
  getAssignmentsForDate: vi.fn(),
  generateAssignmentsFromSchedules: vi.fn(),
  getLatestAssignmentStatusByQuest: vi.fn(),
  getQuestFormData: vi.fn(),
  createAssignment: vi.fn(),
  completeAssignment: vi.fn(),
  skipAssignment: vi.fn(),
  markAssignmentStuck: vi.fn(),
  reviseAssignment: vi.fn(),
  updateAssignmentNotes: vi.fn(),
  dismissAssignment: vi.fn(),
}));
vi.mock("@/lib/actions/quests", () => ({ getQuests: vi.fn() }));
vi.mock("@/lib/actions/student-schedule", () => ({ getScheduleBlocks: vi.fn() }));
vi.mock("@/lib/actions/schooling-mode", () => ({ getSchoolingModeForDate: vi.fn(), setSchoolingModeOverride: vi.fn() }));
vi.mock("@/lib/actions/chronicles", () => ({ generateLearningLog: vi.fn(), getSavedLog: vi.fn(), saveLog: vi.fn() }));
vi.mock("@/lib/actions/school-breaks", () => ({
  getSchoolBreaks: vi.fn(),
  addSchoolBreak: vi.fn(),
  addSchoolBreaks: vi.fn(),
  deleteSchoolBreak: vi.fn(),
}));
// Upkeep is off for these heroes, and the family clock is a fixed zone: neither is what
// these tests are about, and both would otherwise reach for a real database.
vi.mock("@/lib/services/upkeep-context", () => ({ loadUpkeepContext: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/actions/makeup", () => ({ getMakeupView: vi.fn(), getMoveTargets: vi.fn() }));
vi.mock("@/lib/services/realm-materials", () => ({ loadQuestRewards: vi.fn(), loadRealmEnabled: vi.fn() }));
vi.mock("@/lib/services/family-timezone", () => ({ getFamilyTimezone: vi.fn().mockResolvedValue("America/Denver") }));

import QuestsPage from "./page";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getAssignmentsForDate, getLatestAssignmentStatusByQuest } from "@/lib/actions/quest-assignments";
import { getMakeupView } from "@/lib/actions/makeup";
import { getScheduleBlocks } from "@/lib/actions/student-schedule";
import { getSchoolingModeForDate } from "@/lib/actions/schooling-mode";
import { getQuests } from "@/lib/actions/quests";
import { getSubjects } from "@/lib/actions/subjects";
import { getRecentActivities } from "@/lib/actions/activities";
import { loadQuestRewards, loadRealmEnabled } from "@/lib/services/realm-materials";

const child = (id: string) => ({
  id,
  familyId: "fam-1",
  displayName: id === "kid-1" ? "Emma" : "Noah",
  skipQuestsEnabled: false,
});

/** The element for the page's TodayView / AdventureView, wherever it sits. */
function findView(node: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findView(n);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ children?: unknown }>;
  const name = typeof el.type === "function" ? el.type.name : "";
  if (name === "TodayView" || name === "AdventureView") return el;
  return findView(el.props?.children);
}

async function renderPage(params: { child: string; view?: string }) {
  vi.mocked(resolveActiveChild).mockResolvedValue({
    child: child(params.child),
    allChildren: [child("kid-1"), child("kid-2")],
    isChildView: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return findView(await QuestsPage({ searchParams: Promise.resolve(params) }));
}

describe("QuestsPage child switching", () => {
  // Switching heroes is a search-param-only soft navigation, so React keeps the
  // same client component instances unless the subtree's key changes — which
  // left the Scribe's Notes draft and the generated Learning Log showing the
  // previously selected hero's data.
  it("keys Today view by child so a switch remounts child-scoped state", async () => {
    const first = await renderPage({ child: "kid-1" });
    const second = await renderPage({ child: "kid-2" });

    expect(first?.type).toHaveProperty("name", "TodayView");
    expect(first?.key).toBe("kid-1");
    expect(second?.key).toBe("kid-2");
  });

  it("keys Adventure view by child too", async () => {
    const first = await renderPage({ child: "kid-1", view: "adventure" });
    const second = await renderPage({ child: "kid-2", view: "adventure" });

    expect(first?.type).toHaveProperty("name", "AdventureView");
    expect(first?.key).toBe("kid-1");
    expect(second?.key).toBe("kid-2");
  });
});

describe("QuestsPage finished quests", () => {
  const entry = (id: string, status: string) => ({
    assignment: { id, status, notes: null, statusReason: null },
    quest: { id: `q-${id}`, title: id, description: null, estimatedMinutes: null, rewardXp: null, rewardDescription: null, rewardAvatarItem: null, requireNotes: false },
    subject: { id: "s1", name: "Math", color: null },
  });

  /** Every element in the tree whose component is called `name`. */
  function collect(node: unknown, name: string, out: ReactElement<Record<string, unknown>>[] = []) {
    if (Array.isArray(node)) {
      for (const n of node) collect(n, name, out);
    } else if (isValidElement(node)) {
      const el = node as ReactElement<{ children?: unknown }>;
      if (typeof el.type === "function" && el.type.name === name) out.push(el as ReactElement<Record<string, unknown>>);
      collect(el.props?.children, name, out);
    }
    return out;
  }

  async function renderToday(isChildView: boolean) {
    vi.mocked(resolveActiveChild).mockResolvedValue({
      child: child("kid-1"),
      allChildren: [child("kid-1")],
      isChildView,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(getSubjects).mockResolvedValue([]);
    vi.mocked(getRecentActivities).mockResolvedValue([]);
    vi.mocked(getQuests).mockResolvedValue([]);
    vi.mocked(getScheduleBlocks).mockResolvedValue([]);
    vi.mocked(getLatestAssignmentStatusByQuest).mockResolvedValue({} as never);
    vi.mocked(getSchoolingModeForDate).mockResolvedValue("unstructured" as never);
    vi.mocked(getMakeupView).mockResolvedValue({ assignments: [entry("m1", "completed")], isMakeupDay: true, reason: null } as never);
    vi.mocked(getAssignmentsForDate).mockResolvedValue([entry("a1", "completed"), entry("a2", "pending")] as never);
    const view = findView(await QuestsPage({ searchParams: Promise.resolve({ child: "kid-1" }) }));
    const tree = await (view!.type as (p: unknown) => Promise<unknown>)(view!.props);
    return { cards: collect(tree, "QuestAssignmentCard"), makeup: collect(tree, "MakeupQuests") };
  }

  it("asks for what the finished quests made, once, for those quests only, and attaches it", async () => {
    vi.mocked(loadQuestRewards).mockResolvedValue({ a1: { made: "+1 Stone", minutes: null }, m1: { made: "+1 Ink", minutes: 5 } });
    vi.mocked(loadRealmEnabled).mockResolvedValue(true);
    const { cards, makeup } = await renderToday(true);

    expect(loadQuestRewards).toHaveBeenCalledTimes(1);
    expect(loadQuestRewards).toHaveBeenCalledWith("kid-1", ["a1", "m1"]);
    const byId = Object.fromEntries(cards.map((c) => [(c.props.data as { assignment: { id: string } }).assignment.id, c.props]));
    expect(byId.a1.data).toMatchObject({ rewards: { made: "+1 Stone" } });
    expect(byId.a2.data).not.toHaveProperty("rewards");
    expect(byId.a1.realmEnabled).toBe(true);
    expect((makeup[0].props.assignments as unknown[])[0]).toMatchObject({ rewards: { made: "+1 Ink", minutes: 5 } });
    expect(makeup[0].props.realmEnabled).toBe(true);
  });

  it("does not ask whether the Realm is on for a grown-up, and offers no way there", async () => {
    vi.mocked(loadQuestRewards).mockResolvedValue({});
    vi.mocked(loadRealmEnabled).mockClear();
    const { cards } = await renderToday(false);
    expect(loadRealmEnabled).not.toHaveBeenCalled();
    expect(cards[0].props.realmEnabled).toBe(false);
  });

  it("still renders the page when the rewards cannot be read", async () => {
    vi.mocked(loadQuestRewards).mockRejectedValue(new Error("db down"));
    vi.mocked(loadRealmEnabled).mockRejectedValue(new Error("db down"));
    const { cards } = await renderToday(true);
    expect(cards).toHaveLength(2);
    expect(cards[0].props.data).not.toHaveProperty("rewards");
    expect(cards[0].props.realmEnabled).toBe(false);
  });
});
