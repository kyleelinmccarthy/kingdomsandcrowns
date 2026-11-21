import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GRADES, type Grade } from "@/lib/utils/grade-levels";
import { findSkill, skillsFor } from "@/lib/utils/skills";
import { VERIFIERS } from "@/lib/utils/drill-verify";
import type { Question } from "@/lib/utils/drill-generators";
import { __setTrailPoolsForTest } from "@/lib/tasks/trails";
import { cloneTrailPool } from "@/test/trail-pool-fixture";

const notFound = vi.fn(() => {
  // The real `notFound()` throws to abort the render; a mock that returns would let the
  // page carry on and render answer keys, so this test would pass on a broken gate.
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import DevContentPage from "./page";

beforeEach(() => {
  notFound.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

/** Drive the page's own controls to a grade and strand, the way a parent would. */
async function show(grade: Grade, strand = "Math") {
  render(<DevContentPage />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Strand"), strand);
  await user.selectOptions(screen.getByLabelText("Grade"), grade);
}

describe("/dev/content", () => {
  it("is not reachable in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DevContentPage()).toThrow(/404/);
    expect(notFound).toHaveBeenCalled();
  });

  it("is reachable outside production, or it would be useless", () => {
    render(<DevContentPage />);
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Content review", level: 1 })).toBeInTheDocument();
  });

  it("shows every math skill the map gives a grade", async () => {
    await show("6");

    // Pinned literally, because the point is the grade-6 curriculum, not that the page
    // agrees with whatever the map happens to say today.
    for (const label of [
      "Ratios and unit rates",
      "Dividing fractions",
      "Integer operations",
      "Evaluating expressions",
      "Percent of a number",
    ]) {
      expect(screen.getByRole("heading", { name: new RegExp(label), level: 2 })).toBeInTheDocument();
    }

    const shown = screen.getAllByTestId("skill").map((el) => el.getAttribute("data-skill"));
    expect(shown.sort()).toEqual(skillsFor("math", "6").map((s) => s.id).sort());
  });

  it("says authored pools are not here yet rather than reading the database", async () => {
    await show("4", "Science");
    expect(screen.getByTestId("pool-note")).toHaveTextContent(/later plan/i);
    expect(screen.queryAllByTestId("question")).toHaveLength(0);
  });

  it("shows a logic skill as a lock, with no questions and no crash", async () => {
    await show("4", "Logic");
    expect(screen.getAllByTestId("skill").map((el) => el.getAttribute("data-skill"))).toEqual(["logic-g45"]);
    expect(screen.getByTestId("lock-note")).toHaveTextContent(/lock/i);
    expect(screen.queryAllByTestId("question")).toHaveLength(0);
  });

  it.each([["6", "read-g6"], ["9", "read-g9"]] as const)(
    "shows a trail skill with no sample yet, and no crash (F-14, grade %s)",
    async (grade, skillId) => {
      await show(grade, "Reading");
      expect(screen.getAllByTestId("skill").map((el) => el.getAttribute("data-skill"))).toEqual([skillId]);
      expect(screen.getByTestId("trail-note")).toHaveTextContent(/no sample yet/i);
      expect(screen.queryAllByTestId("question")).toHaveLength(0);
    },
  );

  describe("a trail skill whose pool exists (F-21)", () => {
    afterEach(() => __setTrailPoolsForTest(null));

    it.each([["6", "read-g6", "g68"], ["9", "read-g9", "g912"]] as const)("shows one clue per level, with its place, its redirect and its why (grade %s)", async (grade, skillId, band) => {
      const pool = cloneTrailPool(band);
      __setTrailPoolsForTest([pool]);
      await show(grade, "Reading");
      expect(screen.getAllByTestId("skill").map((el) => el.getAttribute("data-skill"))).toEqual([skillId]);
      const rows = screen.getAllByTestId("trail-clue");
      expect(rows).toHaveLength(5);
      const texts = new Set(pool.trails.flatMap((t) => t.clues.map((c) => c.text)));
      const answers = new Map(pool.trails.flatMap((t) => t.clues.map((c) => [c.text, c] as const)));
      for (const row of rows) {
        const text = within(row).getByTestId("trail-clue-text").textContent ?? "";
        expect(texts.has(text), text).toBe(true);
        expect(within(row).getByTestId("trail-clue-answer").textContent).toMatch(/^the /i);
        expect(within(row).getByTestId("trail-clue-redirect")).toHaveTextContent(answers.get(text)!.redirect);
        expect(within(row).getByTestId("trail-clue-why")).toHaveTextContent(answers.get(text)!.why!);
      }
      expect(screen.queryAllByTestId("question")).toHaveLength(0);
      expect(screen.getByTestId("trail-note")).not.toHaveTextContent(/no sample yet/i);
    });

    it("shows the same clues on a reload: they are drawn from the page's fixed seeds", async () => {
      __setTrailPoolsForTest([cloneTrailPool("g68")]);
      await show("6", "Reading");
      const first = screen.getAllByTestId("trail-clue-text").map((el) => el.textContent);
      cleanup();
      await show("6", "Reading");
      expect(screen.getAllByTestId("trail-clue-text").map((el) => el.textContent)).toEqual(first);
    });
  });

  it.each(GRADES)(
    "marks exactly one choice as the answer for every question it renders (grade %s)",
    async (grade) => {
      await show(grade);

      const rows = screen.getAllByTestId("question");
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        const prompt = within(row).getByTestId("prompt").textContent ?? "";
        const choices = within(row).getAllByTestId("choice");
        const texts = choices.map((c) => within(c).getByTestId("choice-text").textContent ?? "");
        const marked = choices.filter((c) => c.getAttribute("data-answer") === "yes");

        expect(marked, `"${prompt}" marked ${marked.length} choices, not 1`).toHaveLength(1);

        // Which choice is marked is checked against an INDEPENDENT reading of the prompt
        // the page itself printed — not against the generator's answer field. A page that
        // marks the wrong choice is worse than no page, because a parent would trust it.
        const skillId = row.getAttribute("data-skill") ?? "";
        const source = findSkill(skillId)?.source;
        expect(source?.kind, `no generator skill for ${skillId}`).toBe("generator");
        const generatorId = source?.kind === "generator" ? source.generatorId : "";
        const markedText = within(marked[0]).getByTestId("choice-text").textContent ?? "";
        const asQuestion: Question = {
          id: `${skillId}:from-page`,
          skillId,
          prompt,
          choices: texts,
          answer: markedText,
        };
        expect(
          VERIFIERS[generatorId](asQuestion),
          `"${prompt}" — the page marks ${markedText}, among ${texts.join(", ")}`,
        ).toBe(markedText);
      }
    },
  );
});
