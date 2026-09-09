import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPicker } from "./deed-picker";
import type { DeedsOverview } from "@/lib/actions/deeds";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const startDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: (...a: unknown[]) => startDeedRun(...a),
  answerDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));

const overview: DeedsOverview = {
  enabled: true, band: "g23", bandLabel: "Grades 2–3", tone: "gentle",
  buildings: [
    { id: "well", label: "Village Well", description: "Water.", icon: "box", done: 5, total: 5, complete: true, deeds: [{ id: "well-signs", title: "Signs for the Well", story: "Help.", area: "reading" }] },
    { id: "mill", label: "Grain Mill", description: "Flour.", icon: "compass", done: 0, total: 5, complete: false, deeds: [{ id: "mill-sacks", title: "Sacks at the Mill", story: "Count.", area: "math" }] },
    { id: "bridge", label: "River Bridge", description: "Cross.", icon: "link", done: 2, total: 5, complete: false, deeds: [{ id: "bridge-planks", title: "Planks for the Bridge", story: "Measure.", area: "math" }] },
  ],
  mastery: [],
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };

beforeEach(() => { vi.clearAllMocks(); startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "bridge-planks", title: "Planks for the Bridge", story: "Measure.", area: "math" }, questions: [{ id: "q", skillId: "add-20", prompt: "What is 1 + 1?", choices: ["2", "3", "4", "5"] }], responses: [null] }); });
afterEach(cleanup);

describe("DeedPicker", () => {
  it("lists in-progress buildings first and built ones last", () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["River Bridge", "Grain Mill", "Village Well"]);
    expect(within(screen.getByText("Village Well").closest("section")!).getByText("Built")).toBeInTheDocument();
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
});
