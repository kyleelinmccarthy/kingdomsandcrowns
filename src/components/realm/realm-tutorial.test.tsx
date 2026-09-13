import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmTutorial } from "./realm-tutorial";
import { TUTORIAL_STEPS, tutorialPrompt } from "@/lib/realm/tutorial";

afterEach(cleanup);

describe("RealmTutorial", () => {
  it("shows the current prompt, and says nothing once finished", () => {
    const { rerender } = render(<RealmTutorial prompt="Use W, A, S and D to walk." onSkip={() => {}} />);
    expect(screen.getByText(/Use W, A, S and D to walk\./)).toBeInTheDocument();
    rerender(<RealmTutorial prompt={null} onSkip={() => {}} />);
    // Empty, and with no Skip to press — but still THERE. See the next test for why.
    expect(screen.getByTestId("realm-tutorial").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Skip the tutorial" })).not.toBeInTheDocument();
  });

  it("keeps the live region mounted with nothing to say, so the FIRST prompt is announced", () => {
    // A live region only announces mutations that land after it has entered the accessibility
    // tree. This component used to return null when there was no prompt, so every step-one
    // prompt arrived in the same commit as the region itself and a screen reader said nothing:
    // the child heard steps two, three and four and never the one that teaches them to walk.
    // `realm-messages.tsx:6-8` states this rule beside the two lanes that already follow it.
    const { rerender } = render(<RealmTutorial prompt={null} onSkip={() => {}} />);
    const region = screen.getByTestId("realm-tutorial");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.textContent).toBe("");
    rerender(<RealmTutorial prompt="Use W, A, S and D to walk." onSkip={() => {}} />);
    // The SAME node, mutated — not a replacement, which is what would be silent.
    expect(screen.getByTestId("realm-tutorial")).toBe(region);
    expect(region).toHaveTextContent("Use W, A, S and D to walk.");
  });

  it("offers a way out that a grown-up can press", async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<RealmTutorial prompt="Press 1." onSkip={onSkip} />);
    await user.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("announces politely so a screen reader hears each new step", () => {
    render(<RealmTutorial prompt="Press 1." onSkip={() => {}} />);
    expect(screen.getByTestId("realm-tutorial")).toHaveAttribute("aria-live", "polite");
  });

  // The box floats over a world the child is walking around in, so it must not eat a click
  // aimed at the grass behind it — but Skip has to stay pressable. jsdom computes no
  // styles from the stylesheet, so this asserts the contract in the only place it can: the
  // two class names globals.css hangs `pointer-events: none` / `auto` off.
  it("wears the two class names the stylesheet aims at, and nothing else", () => {
    // Also the hook the stylesheet collapses the empty box with:
    // `.realm-tutorial:has(.realm-tutorial-step:empty)` drops the padding, the border and the
    // background, which takes an absolutely positioned box to 0x0 without `display: none` —
    // which would put the live region back out of the accessibility tree.
    render(<RealmTutorial prompt="Go where the light is." onSkip={() => {}} />);
    const box = screen.getByTestId("realm-tutorial");
    expect(box.className).toBe("realm-tutorial");
    expect(box.querySelector(".realm-tutorial-step")?.textContent).toBe("Go where the light is.");
  });

  // The copy is frozen to tutorial.ts: this component renders whatever the model says and
  // never a word of its own, so every one of the four steps has to come through unedited.
  it("renders each of the four prompts exactly as the model words them", () => {
    for (let completed = 0; completed < TUTORIAL_STEPS.length; completed += 1) {
      const prompt = tutorialPrompt({ completed });
      cleanup();
      render(<RealmTutorial prompt={prompt} onSkip={() => {}} />);
      expect(screen.getByTestId("realm-tutorial")).toHaveTextContent(TUTORIAL_STEPS[completed].prompt);
    }
  });
});
