import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeedPanel } from "./deed-panel";
import { VILLAGERS } from "@/lib/realm/villagers";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

const startDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: (...a: unknown[]) => startDeedRun(...a),
  answerDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/components/deed-player", () => ({
  DeedPlayer: ({ run, onFinished }: { run: { deed: { title: string } }; onFinished: (s: unknown) => void }) => (
    <div>
      <p>Playing {run.deed.title}</p>
      <button type="button" onClick={() => onFinished({ building: { label: "Village Well", done: 5, total: 5, complete: true } })}>finish</button>
    </div>
  ),
}));

const building = {
  id: "well", label: "Village Well", description: "", icon: "box" as const, done: 4, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Dry again.", area: "math" as const }],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DeedPanel", () => {
  it("starts a run in the realm context on Begin, plays it, and reports the summary with the building id", async () => {
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const onFinished = vi.fn();
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={onFinished} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(startDeedRun).toHaveBeenCalledWith("c1", "well-stones", "realm");
    fireEvent.click(screen.getByRole("button", { name: "finish" }));
    expect(onFinished).toHaveBeenCalledWith("well", { label: "Village Well", done: 5, total: 5, complete: true });
  });

  it("focuses the run dialog once a deed starts, so Escape works without a click first", async () => {
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const onClose = vi.fn();
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a start failure in the card with the card still open", async () => {
    startDeedRun.mockRejectedValue(new Error("No deeds are ready for this hero yet."));
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("No deeds are ready for this hero yet.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers Leave the deed while playing and closes on it", async () => {
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const onClose = vi.fn();
    render(<DeedPanel childId="c1" villager={VILLAGERS[0]} building={building} profile={DEFAULT_LEARNING_PROFILE} calm={false} preview={false} onFinished={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    await screen.findByText("Playing Count the Well Stones");
    fireEvent.click(screen.getByRole("button", { name: "Leave the deed" }));
    expect(onClose).toHaveBeenCalled();
  });
});
