import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { RealmHelp, helpGroups } from "./realm-help";

afterEach(cleanup);

describe("helpGroups", () => {
  it("speaks keys to a keyboard hero and taps to a touch hero", () => {
    const keys = helpGroups(false, false);
    expect(keys.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
    expect(keys[0].text).toBe("Use W, A, S and D to walk.");
    expect(keys[1].text).toBe("Follow the gold light. Someone is waiting there.");
    expect(keys[2].text).toBe("Stand close to someone and press E.");
    expect(keys[3].text).toBe("Press 1, 2, 3 or 4 — or click what you want to hit. Press Escape to put it away.");
    expect(keys[4].text).toBe("Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    const touch = helpGroups(true, false);
    expect(touch.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
    expect(touch[0].text).toBe("Drag the stick to walk.");
    expect(touch[1].text).toBe("Follow the gold light. Someone is waiting there.");
    expect(touch[2].text).toBe("Stand close to someone and tap Talk.");
    expect(touch[3].text).toBe("Tap a spell page to cast it, or tap Cast to cast again. Tap Put away when you are done.");
    expect(touch[4].text).toBe("Tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    // `.map` first: joining the group objects themselves compares "[object Object]" and asserts nothing.
    expect(touch.map((g) => g.text).join(" ")).not.toMatch(/WASD|Enter|Space|Press M|\(1, 2, 3, 4\)/);
  });

  it("describes one input model, not two, in either mode", () => {
    // §4.1's five verbs are WASD, 1-4, left click, E and Esc; Space and tap-to-move are both
    // gone (Task 8, Task 10), and a number key or a spell-page tap CASTS on its own rather
    // than merely picking a page for a second click to fire.
    for (const touch of [false, true]) {
      const text = helpGroups(touch, false).map((g) => g.text).join(" ");
      expect(text).not.toMatch(/space/i);
      expect(text).not.toMatch(/click .*(walk|move)/i);
      expect(text).not.toMatch(/tap where you want to go/i);
      expect(text).not.toMatch(/then (tap|click)/i);
    }
    expect(helpGroups(false, false)[0].text).toMatch(/W, A, S and D/);
    expect(helpGroups(false, false).map((g) => g.text).join(" ")).toMatch(/\bE\b/);
  });

  it("promises nothing that clearing a trouble does not do", () => {
    for (const touch of [false, true]) {
      for (const ceremony of [false, true]) {
        for (const g of helpGroups(touch, ceremony)) expect(g.text).not.toMatch(/protect the sites/);
      }
    }
  });

  it("adds the ceremony line only during a ceremony", () => {
    expect(helpGroups(false, true).at(-1)?.text).toBe("Skip the ceremony with Escape or the Skip button.");
    expect(helpGroups(false, false).some((g) => g.title === "Ceremony")).toBe(false);
  });
});

describe("RealmHelp", () => {
  it("is a dialog named How to play that closes on Close and on Escape", () => {
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onReplayTutorial={null} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    expect(dialog).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers everything on the simple view and simplicity on the full one, naming no axis", async () => {
    const onSetDepth = vi.fn();
    const { rerender } = render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onReplayTutorial={null} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show me everything" })).toBeInTheDocument();
    expect(screen.getByText("More numbers, more to do. You can change it back.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(onSetDepth).toHaveBeenCalledWith("full");
    rerender(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={onSetDepth} onReplayTutorial={null} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Keep it simple" })).toBeInTheDocument();
    expect(screen.getByText("Fewer numbers, one thing at a time.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Keep it simple" }));
    });
    expect(onSetDepth).toHaveBeenLastCalledWith("simple");
    // "Depth", "simple mode" and "advanced" are never words a child reads.
    expect(document.body.textContent).not.toMatch(/depth|simple mode|advanced/i);
  });

  it("shows no view control when the card is not allowed to offer one", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={null} onReplayTutorial={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep it simple" })).not.toBeInTheDocument();
    expect(screen.queryByText("More numbers, more to do. You can change it back.")).not.toBeInTheDocument();
  });

  it("says so when the write does not land, and keeps offering the same swap", async () => {
    const onSetDepth = vi.fn(() => Promise.reject(new Error("offline")));
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onReplayTutorial={null} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't save. Try again.");
    expect(screen.getByRole("button", { name: "Show me everything" })).toBeEnabled();
  });

  it("keeps the card keyboard-operable while the view control's write is in flight", async () => {
    // The view control is the escape hatch for a hero who finds the simple view too small,
    // and it is the focused element when they press it. `disabled={saving}` blurred it to
    // <body> mid-save, and Escape and the Tab trap both live on the panel div's onKeyDown —
    // so a keyboard hero pressing the escape hatch was stuck in a card that no longer
    // answered Escape and no longer trapped Tab, until a pointer rescued them.
    let settle: (() => void) | undefined;
    const onSetDepth = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onReplayTutorial={null} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    const control = screen.getByRole("button", { name: "Show me everything" });
    const close = screen.getByRole("button", { name: "Close" });

    control.focus();
    fireEvent.click(control);
    expect(onSetDepth).toHaveBeenCalledTimes(1);
    // Mid-save: still focused, still in the tab order, and refusing a second write itself.
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(control).not.toBeDisabled();
    fireEvent.click(control);
    expect(onSetDepth).toHaveBeenCalledTimes(1);
    // Both keyboard routes out of the card still work while the write is in flight.
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle!();
    });
    expect(control).not.toHaveAttribute("aria-disabled", "true");
    // And the trap still cycles both controls after the save settles (focus is on Close,
    // where the Tab above left it, so the next stop is the view control).
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("keeps Tab inside the card, cycling its own two controls", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={vi.fn()} onReplayTutorial={null} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    const close = screen.getByRole("button", { name: "Close" });
    const control = screen.getByRole("button", { name: "Show me everything" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(control).toHaveFocus();
  });

  it("shows no replay control when none is offered", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={null} onReplayTutorial={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /tutorial again/i })).not.toBeInTheDocument();
  });

  it("can start the walkthrough again", async () => {
    // The card never imports the server action itself (`setTutorialStep` cannot be mocked
    // without a "use server" file in a component test) — it only calls the callback prop the
    // shell hands it, exactly the way it already treats `onSetDepth`.
    const onReplayTutorial = vi.fn();
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onReplayTutorial={onReplayTutorial} onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me the tutorial again" }));
    });
    expect(onReplayTutorial).toHaveBeenCalledTimes(1);
    // The whole point is to get the child back into the world where the first prompt is
    // waiting, so the card gets out of the way rather than staying open on its own restart.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the card even when the replay write fails, because nothing here is worth telling a child about", async () => {
    const onReplayTutorial = vi.fn(() => Promise.reject(new Error("offline")));
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onReplayTutorial={onReplayTutorial} onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me the tutorial again" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the card keyboard-operable while the replay control's write is in flight", async () => {
    // Same hard-won shape as the view control's own test above: `disabled` blurs focus to
    // <body>, and Escape/Tab both live on the panel's onKeyDown, so this control is
    // aria-disabled and never disabled while its write is pending.
    let settle: (() => void) | undefined;
    const onReplayTutorial = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onReplayTutorial={onReplayTutorial} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    const control = screen.getByRole("button", { name: "Show me the tutorial again" });
    const close = screen.getByRole("button", { name: "Close" });

    control.focus();
    fireEvent.click(control);
    expect(onReplayTutorial).toHaveBeenCalledTimes(1);
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(control).not.toBeDisabled();
    fireEvent.click(control);
    expect(onReplayTutorial).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1); // Escape's own close, not the replay's

    await act(async () => {
      settle!();
    });
    expect(control).not.toHaveAttribute("aria-disabled", "true");
    // Settling calls onClose a second time — the card closes on its own once the reset (which
    // already happened locally, before the write even started) is done round-tripping.
    expect(onClose).toHaveBeenCalledTimes(2);
    // The trap still cycles both controls after the save settles (focus is on Close, where
    // the Tab at line 212 left it, so the next stop is the replay control).
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("cycles Close, the view control and the replay control together when both are offered", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={vi.fn()} onReplayTutorial={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    const close = screen.getByRole("button", { name: "Close" });
    const view = screen.getByRole("button", { name: "Show me everything" });
    const replay = screen.getByRole("button", { name: "Show me the tutorial again" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(view).toHaveFocus();
    fireEvent.keyDown(view, { key: "Tab" });
    expect(replay).toHaveFocus();
    fireEvent.keyDown(replay, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(replay).toHaveFocus();
  });
});
