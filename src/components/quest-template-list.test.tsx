import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/quests", () => ({ deleteQuest: vi.fn() }));
vi.mock("./quest-template-form", () => ({ QuestTemplateForm: () => null }));

import { QuestTemplateList } from "./quest-template-list";

afterEach(cleanup);

const quest = {
  id: "q1",
  title: "Garden survey",
  subjectId: "s1",
  description: null,
  estimatedMinutes: null,
  rewardXp: null,
  rewardDescription: null,
  rewardAvatarItem: null,
  includeInLearningLog: true,
  requireNotes: true,
};

describe("QuestTemplateList", () => {
  it("says a notes-asking quest takes Scribe's Notes or a drawing", () => {
    render(
      <QuestTemplateList
        childId="c1"
        quests={[quest]}
        subjects={[{ id: "s1", name: "Science", color: null }]}
        schoolDays={["mon"]}
        timeZone="UTC"
      />,
    );
    expect(screen.getByTitle("Asks for Scribe's Notes or a drawing")).toBeInTheDocument();
    expect(screen.queryByTitle("Requires Scribe's Notes to complete")).toBeNull();
  });
});
