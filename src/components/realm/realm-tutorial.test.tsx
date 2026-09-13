import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmTutorial } from "./realm-tutorial";
import { TUTORIAL_STEPS, tutorialPrompt } from "@/lib/realm/tutorial";

afterEach(cleanup);

describe("RealmTutorial", () => {
  it("shows the current prompt and nothing once finished", () => {
    const { rerender, container } = render(<RealmTutorial prompt="Use W, A, S and D to walk." onSkip={() => {}} />);
    expect(screen.getByText(/Use W, A, S and D to walk\./)).toBeInTheDocument();
    rerender(<RealmTutorial prompt={null} onSkip={() => {}} />);
    expect(container.firstChild).toBeNull();
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
