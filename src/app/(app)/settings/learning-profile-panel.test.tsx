import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningProfilePanel } from "./learning-profile-panel";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const updateLearningProfile = vi.fn().mockResolvedValue(undefined);
const applyLearningPreset = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/learning-profile", () => ({
  updateLearningProfile: (...a: unknown[]) => updateLearningProfile(...a),
  applyLearningPreset: (...a: unknown[]) => applyLearningPreset(...a),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LearningProfilePanel", () => {
  it("applies a preset by id", async () => {
    const user = userEvent.setup();
    render(<LearningProfilePanel childId="c1" profile={DEFAULT_LEARNING_PROFILE} />);
    await user.click(screen.getByRole("button", { name: /reading support/i }));
    expect(applyLearningPreset).toHaveBeenCalledWith("c1", "reading-support");
  });

  it("flips a single toggle", async () => {
    const user = userEvent.setup();
    render(<LearningProfilePanel childId="c1" profile={DEFAULT_LEARNING_PROFILE} />);
    await user.click(screen.getByRole("switch", { name: /no timers/i }));
    expect(updateLearningProfile).toHaveBeenCalledWith("c1", { untimed: true });
  });

  it("renders the stored state", () => {
    render(<LearningProfilePanel childId="c1" profile={{ ...DEFAULT_LEARNING_PROFILE, lowStimulus: true }} />);
    expect(screen.getByRole("switch", { name: /calm visuals/i })).toHaveAttribute("aria-checked", "true");
  });
});
