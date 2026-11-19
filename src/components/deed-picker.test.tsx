import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPicker } from "./deed-picker";
import { CLOSED } from "@/lib/utils/deed-refusals";
import type { DeedsOverview } from "@/lib/actions/deeds";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const startDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: (...a: unknown[]) => startDeedRun(...a),
  answerDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
const startReviewRun = vi.fn();
vi.mock("@/lib/actions/review", () => ({ startReviewRun: (...a: unknown[]) => startReviewRun(...a) }));

const overview: DeedsOverview = {
  enabled: true, band: "g23", bandLabel: "Grades 2–3", tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "Water.", icon: "box", done: 3, total: 3, complete: true, raisedBy: "Ada", raisedAt: 1_776_000_000, stars: 2, maxStars: 3, deeds: [{ id: "well-signs", title: "Signs for the Well", story: "Help.", area: "reading", bestStars: 2 as const, crowned: false }] },
    { id: "mill", label: "Grain Mill", description: "Flour.", icon: "compass", done: 0, total: 3, complete: false, raisedBy: null, raisedAt: null, stars: 0, maxStars: 3, deeds: [{ id: "mill-sacks", title: "Sacks at the Mill", story: "Count.", area: "math", bestStars: 0 as const, crowned: false }] },
    {
      id: "bridge", label: "River Bridge", description: "Cross.", icon: "link", done: 1, total: 2, complete: false, raisedBy: null, raisedAt: null, stars: 1, maxStars: 6, deeds: [
        { id: "bridge-planks", title: "Planks for the Bridge", story: "Measure.", area: "math", bestStars: 0 as const, crowned: false },
        { id: "bridge-toll", title: "The Toll-Keeper's Words", story: "Greet.", area: "language", bestStars: 1 as const, crowned: false },
      ],
    },
  ],
  mastery: [],
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };

beforeEach(() => { vi.clearAllMocks(); startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "bridge-planks", title: "Planks for the Bridge", story: "Measure.", area: "math", bestStars: 0 as const, crowned: false }, questions: [{ kind: "choice", id: "q", skillId: "add-20", prompt: "What is 1 + 1?", view: { choices: ["2", "3", "4", "5"] } }], responses: [null] }); });
afterEach(cleanup);

describe("DeedPicker", () => {
  it("lists in-progress buildings first and built ones last", () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["River Bridge", "Grain Mill", "Village Well"]);
    expect(within(screen.getByText("Village Well").closest("section")!).getByText("Built")).toBeInTheDocument();
  });

  it("marks each story done once it has earned a star, and offers a built building's stories as practice", () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    const bridge = screen.getByText("River Bridge").closest("section")!;
    const row = (title: string) => within(bridge).getByText(title).closest("li")!;
    expect(within(row("The Toll-Keeper's Words")).getByText("Done")).toBeInTheDocument();
    expect(within(row("Planks for the Bridge")).queryByText("Done")).not.toBeInTheDocument();
    // Still rising: no practice line.
    expect(within(bridge).queryByText("Practise again")).not.toBeInTheDocument();
    const well = screen.getByText("Village Well").closest("section")!;
    expect(within(well).getByText("Practise again")).toBeInTheDocument();
    expect(within(well).getByText("Done")).toBeInTheDocument();
  });

  it("begins a deed and mounts the player", async () => {
    const user = userEvent.setup();
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    await user.click(screen.getByRole("button", { name: "Begin Planks for the Bridge" }));
    expect(startDeedRun).toHaveBeenCalledWith("c1", "bridge-planks");
    expect(await screen.findByText("What is 1 + 1?")).toBeInTheDocument();
  });

  it("shows each side quest's subject and filters by it", async () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    // SubjectChip names itself with sr-only text combined with the visible label rather
    // than an aria-label on a plain span, so it's queried by its own data-subject attribute.
    expect(document.querySelectorAll('[data-subject="math"]')).toHaveLength(2);
    expect(document.querySelector('[data-subject="reading"]')).toHaveTextContent("Subject: Reading");
    await userEvent.click(screen.getByRole("button", { name: "Reading", pressed: false }));
    expect(screen.queryByText("Grain Mill")).not.toBeInTheDocument();
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All", pressed: false }));
    expect(screen.getByText("Grain Mill")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/deed/i);
  });

  describe("Quick review", () => {
    it("starts a page review for the hero and mounts the player", async () => {
      const user = userEvent.setup();
      startReviewRun.mockResolvedValue({
        runId: "rv1", deed: { id: "review:page", title: "Quick review", story: "Three riddles.", area: null },
        questions: [{ kind: "choice", id: "q", skillId: "add-20", prompt: "What is 2 + 2?", view: { choices: ["4", "5"] } }],
        responses: [null], kind: "review", pending: null,
      });
      render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
      await user.click(screen.getByRole("button", { name: "Quick review" }));
      expect(startReviewRun).toHaveBeenCalledWith("c1", { kind: "page" });
      expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    });

    it("shows a refusal in the error banner and lets the hero try again", async () => {
      const user = userEvent.setup();
      startReviewRun.mockRejectedValueOnce(new Error(CLOSED));
      render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
      await user.click(screen.getByRole("button", { name: "Quick review" }));
      expect(await screen.findByText(CLOSED)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quick review" })).toBeEnabled();
    });

    it("says there is nothing to review yet, and clears the note on the next press", async () => {
      const user = userEvent.setup();
      startReviewRun.mockResolvedValueOnce({ empty: true });
      render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
      await user.click(screen.getByRole("button", { name: "Quick review" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Nothing to review yet. Finish a side quest first and it will come back here.");
      expect(screen.getByText("Grain Mill")).toBeInTheDocument();
      let release!: () => void;
      startReviewRun.mockReturnValueOnce(new Promise((r) => { release = () => r({ empty: true }); }));
      await user.click(screen.getByRole("button", { name: "Quick review" }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quick review" })).toBeDisabled();
      release();
      expect(await screen.findByRole("status")).toBeInTheDocument();
    });
  });
});
