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

import QuestsPage from "./page";
import { resolveActiveChild } from "@/lib/actions/resolve-child";

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
