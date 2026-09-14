import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const updateChild = vi.fn().mockResolvedValue({ seasonTransition: null });
vi.mock("@/lib/actions/children", () => ({
  createChild: vi.fn(),
  updateChild: (...args: unknown[]) => updateChild(...args),
  banishChild: vi.fn(),
  restoreChild: vi.fn(),
  deleteChild: vi.fn(),
}));
vi.mock("@/lib/actions/child-auth", () => ({
  setChildEmail: vi.fn(),
  setChildAuthMethod: vi.fn(),
  recordChildConsent: vi.fn(),
  sendChildQuestInvite: vi.fn(),
}));
vi.mock("@/lib/actions/subjects", () => ({
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
  deleteSubject: vi.fn(),
  reorderSubjects: vi.fn(),
}));
vi.mock("@/lib/actions/leaderboard", () => ({ toggleLeaderboardVisibility: vi.fn() }));
vi.mock("@/lib/actions/student-schedule", () => ({ setScheduleSelfManage: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ setSkipQuestsEnabled: vi.fn() }));

import { ChildList } from "./child-list";

afterEach(() => {
  cleanup();
  updateChild.mockClear();
});

const family = { id: "fam-1", name: "The Hearth" } as unknown as Parameters<typeof ChildList>[0]["family"];

function hero(id: string, displayName: string, grade: string) {
  return {
    id,
    displayName,
    birthYear: null,
    grade,
    ageMode: grade === "3" ? "elementary" : "middle",
    avatarConfig: null,
    currentXp: 0,
    currentStreak: 0,
    showOnLeaderboard: true,
    subjects: [],
  };
}

const emma = hero("demo-child-1", "Emma", "6");
const noah = hero("demo-child-2", "Noah", "3");

/**
 * The summary card for a hero is a clickable div carrying their name. Match the card
 * itself rather than the first text node, since once a hero is open their name also
 * appears in the detail panel below.
 */
function openHero(name: string) {
  const card = screen
    .getAllByText(name)
    .map((el) => el.closest<HTMLElement>(".cursor-pointer"))
    .find((el): el is HTMLElement => el !== null);
  if (!card) throw new Error(`No summary card for ${name}`);
  fireEvent.click(card);
}

/**
 * The editor's name field, looked up by the child-specific id it renders with. The id is
 * derived from props on every render while the value lives in state, which is exactly why
 * the stale-state bug is invisible to anything that checks only the id.
 * ("Hero Name" alone is ambiguous: the always-mounted Recruit Hero dialog has one too.)
 */
function nameField(childId: string): HTMLInputElement {
  const el = document.getElementById(`name-${childId}`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`No name field for ${childId}`);
  return el;
}

describe("ChildList — switching between heroes", () => {
  it("shows the newly selected hero's name, never the previous hero's", () => {
    render(<ChildList family={family} kids={[emma, noah]} />);
    openHero("Emma");
    expect(nameField(emma.id)).toHaveValue("Emma");

    openHero("Noah");
    expect(nameField(noah.id)).toHaveValue("Noah");
  });

  it("offers no save after a switch the parent never edited, so nothing stale can be written", () => {
    // The corruption this guards against: Emma's form survived a switch to Noah, the stale
    // "Emma" differed from Noah's real name, the editor counted that as an edit and showed
    // Save Changes, and one click wrote "Emma" onto Noah's record.
    render(<ChildList family={family} kids={[emma, noah]} />);
    openHero("Emma");
    openHero("Noah");

    const editor = screen.getByText("Hero Details").parentElement as HTMLElement;
    expect(within(editor).queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(updateChild).not.toHaveBeenCalled();
  });

  it("shows the newly selected hero's grade, never the previous hero's", () => {
    // Grade is seeded into state from props the same way the name is, so a stale grade
    // is the same corruption path: Save would move Noah to Emma's grade.
    render(<ChildList family={family} kids={[emma, noah]} />);
    openHero("Emma");
    const emmaGrade = document.getElementById(`age-${emma.id}-grade`) as HTMLSelectElement;
    expect(emmaGrade.value).toBe("6");

    openHero("Noah");
    const noahGrade = document.getElementById(`age-${noah.id}-grade`) as HTMLSelectElement;
    expect(noahGrade.value).toBe("3");
  });
});
